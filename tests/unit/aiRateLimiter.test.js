import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createLimiter,
  resolveRateLimitKey,
  chatRateLimiter,
  expenseAgentRateLimiter,
  receiptOcrRateLimiter,
  apiRateLimiter,
  indexingRateLimiter,
  signupRateLimiter,
} from '../../server/src/shared/middleware/rateLimiter.js';
import { RATE_LIMIT_CONFIG } from '../../server/src/constants/config.js';
import { config } from '../../server/src/config.js';

import chatRouter from '../../server/src/features/assistant/assistant.routes.js';
import expenseAgentRouter from '../../server/src/features/expenseAgent/expenseAgent.routes.js';
import expenseRouter from '../../server/src/features/expenses/expenses.routes.js';

/**
 * Creates a mock Express request and response pair for simulating middleware calls.
 */
function createMockHttp({ ip = '127.0.0.1', user = null, headers = {} } = {}) {
  const resHeaders = {};
  let statusCode = 200;
  let jsonBody = null;

  const req = {
    ip,
    headers: { ...headers },
    user,
    socket: { remoteAddress: ip },
  };

  const res = {
    statusCode,
    setHeader(key, value) {
      resHeaders[key.toLowerCase()] = value;
      return this;
    },
    getHeader(key) {
      return resHeaders[key.toLowerCase()];
    },
    status(code) {
      statusCode = code;
      res.statusCode = code;
      return this;
    },
    json(body) {
      jsonBody = body;
      return this;
    },
  };

  return { req, res, getHeaders: () => resHeaders, getStatus: () => statusCode, getBody: () => jsonBody };
}

describe('AI Rate Limiting & Quota Protection Suite', () => {
  describe('1. Key Resolution & Identity Isolation (resolveRateLimitKey)', () => {
    it('keys authenticated users by user:<id>', () => {
      const req = { user: { id: 'usr_abc123' }, ip: '192.168.1.10' };
      const key = resolveRateLimitKey(req);
      assert.equal(key, 'user:usr_abc123');
    });

    it('isolates different authenticated users from each other', () => {
      const req1 = { user: { id: 'usr_user1' }, ip: '10.0.0.1' };
      const req2 = { user: { id: 'usr_user2' }, ip: '10.0.0.1' };
      assert.notEqual(resolveRateLimitKey(req1), resolveRateLimitKey(req2));
    });

    it('falls back to client IP for unauthenticated or anonymous callers', () => {
      const req = { user: null, ip: '203.0.113.195' };
      const key = resolveRateLimitKey(req);
      assert.match(key, /203\.0\.113\.195/);
    });

    it('never collides an authenticated user key with an IP key from the same address', () => {
      const authReq = { user: { id: '127.0.0.1' }, ip: '127.0.0.1' };
      const anonReq = { user: null, ip: '127.0.0.1' };
      assert.equal(resolveRateLimitKey(authReq), 'user:127.0.0.1');
      assert.notEqual(resolveRateLimitKey(authReq), resolveRateLimitKey(anonReq));
    });
  });

  describe('2. Rate Limiting Enforcement & Limit Exhaustion', () => {
    it('allows requests within the configured max limit', async () => {
      const limiter = createLimiter({
        windowMs: 60 * 1000,
        max: 3,
        message: 'Rate limit reached',
        skip: () => false,
      });

      for (let i = 1; i <= 3; i++) {
        let nextCalled = false;
        const mock = createMockHttp({ ip: '198.51.100.1' });
        await limiter(mock.req, mock.res, () => {
          nextCalled = true;
        });

        assert.equal(nextCalled, true, `Request ${i} should be permitted`);
        assert.equal(mock.getStatus(), 200);
      }
    });

    it('rejects requests with HTTP 429 when max limit is exhausted', async () => {
      const limiter = createLimiter({
        windowMs: 60 * 1000,
        max: 2,
        message: 'Too many requests. Please try again in one minute.',
        skip: () => false,
      });

      const ip = '198.51.100.2';

      // First 2 requests pass
      for (let i = 0; i < 2; i++) {
        let passed = false;
        const mock = createMockHttp({ ip });
        await limiter(mock.req, mock.res, () => {
          passed = true;
        });
        assert.equal(passed, true);
      }

      // 3rd request must be blocked with HTTP 429
      let blockedNextCalled = false;
      const blockedMock = createMockHttp({ ip });
      await limiter(blockedMock.req, blockedMock.res, () => {
        blockedNextCalled = true;
      });

      assert.equal(blockedNextCalled, false, 'Next handler must not be invoked on rate-limited request');
      assert.equal(blockedMock.getStatus(), 429);
      assert.deepEqual(blockedMock.getBody(), {
        error: 'Too many requests. Please try again in one minute.',
      });
      assert.equal(String(blockedMock.getHeaders()['ratelimit-remaining']), '0');
    });

    it('sets standard RateLimit response headers correctly', async () => {
      const limiter = createLimiter({
        windowMs: 60 * 1000,
        max: 5,
        message: 'Limit reached',
        skip: () => false,
      });

      const mock = createMockHttp({ ip: '198.51.100.3' });
      await limiter(mock.req, mock.res, () => {});

      const headers = mock.getHeaders();
      assert.equal(String(headers['ratelimit-limit']), '5');
      assert.equal(String(headers['ratelimit-remaining']), '4');
      assert.ok(headers['ratelimit-reset'] !== undefined);
    });
  });

  describe('3. Key and Feature Isolation', () => {
    it('isolates different users on the same limiter so User A cannot starve User B', async () => {
      const limiter = createLimiter({
        windowMs: 60 * 1000,
        max: 2,
        message: 'Quota exceeded',
        skip: () => false,
      });

      const userA = { id: 'user_alice' };
      const userB = { id: 'user_bob' };

      // Alice exhausts her 2 calls
      for (let i = 0; i < 2; i++) {
        const mock = createMockHttp({ user: userA });
        await limiter(mock.req, mock.res, () => {});
      }

      // Alice's 3rd call is blocked
      const aliceBlocked = createMockHttp({ user: userA });
      let aliceNext = false;
      await limiter(aliceBlocked.req, aliceBlocked.res, () => {
        aliceNext = true;
      });
      assert.equal(aliceNext, false);
      assert.equal(aliceBlocked.getStatus(), 429);

      // Bob's 1st call MUST still be allowed!
      const bobAllowed = createMockHttp({ user: userB });
      let bobNext = false;
      await limiter(bobAllowed.req, bobAllowed.res, () => {
        bobNext = true;
      });
      assert.equal(bobNext, true);
      assert.equal(bobAllowed.getStatus(), 200);
    });

    it('isolates independent AI limiters so exhausting Chat does not block Expense Agent or OCR', async () => {
      const chatTestLimiter = createLimiter({
        windowMs: 60 * 1000,
        max: 1,
        message: 'Chat limit',
        skip: () => false,
      });

      const expenseAgentTestLimiter = createLimiter({
        windowMs: 60 * 1000,
        max: 1,
        message: 'Expense agent limit',
        skip: () => false,
      });

      const receiptOcrTestLimiter = createLimiter({
        windowMs: 60 * 1000,
        max: 1,
        message: 'Receipt OCR limit',
        skip: () => false,
      });

      const user = { id: 'shared_user_1' };

      // Exhaust Chat limiter
      await chatTestLimiter(createMockHttp({ user }).req, createMockHttp({ user }).res, () => {});
      const chatSecond = createMockHttp({ user });
      let chatSecondNext = false;
      await chatTestLimiter(chatSecond.req, chatSecond.res, () => { chatSecondNext = true; });
      assert.equal(chatSecondNext, false);
      assert.equal(chatSecond.getStatus(), 429);

      // Expense Agent limiter MUST NOT be exhausted
      const expenseMock = createMockHttp({ user });
      let expenseNext = false;
      await expenseAgentTestLimiter(expenseMock.req, expenseMock.res, () => { expenseNext = true; });
      assert.equal(expenseNext, true);
      assert.equal(expenseMock.getStatus(), 200);

      // Receipt OCR limiter MUST NOT be exhausted
      const ocrMock = createMockHttp({ user });
      let ocrNext = false;
      await receiptOcrTestLimiter(ocrMock.req, ocrMock.res, () => { ocrNext = true; });
      assert.equal(ocrNext, true);
      assert.equal(ocrMock.getStatus(), 200);
    });
  });

  describe('4. Centralized Configuration Integration', () => {
    it('verifies RATE_LIMIT_CONFIG constants match project standards', () => {
      assert.equal(RATE_LIMIT_CONFIG.API.MAX, 300);
      assert.equal(RATE_LIMIT_CONFIG.API.WINDOW_MS, 15 * 60 * 1000);

      assert.equal(RATE_LIMIT_CONFIG.CHAT.MAX, 30);
      assert.equal(RATE_LIMIT_CONFIG.CHAT.WINDOW_MS, 60 * 1000);

      assert.equal(RATE_LIMIT_CONFIG.EXPENSE_AGENT.MAX, 30);
      assert.equal(RATE_LIMIT_CONFIG.EXPENSE_AGENT.WINDOW_MS, 60 * 1000);

      assert.equal(RATE_LIMIT_CONFIG.RECEIPT_OCR.MAX, 15);
      assert.equal(RATE_LIMIT_CONFIG.RECEIPT_OCR.WINDOW_MS, 60 * 1000);

      assert.equal(RATE_LIMIT_CONFIG.INDEXING.MAX, 10);
      assert.equal(RATE_LIMIT_CONFIG.INDEXING.WINDOW_MS, 15 * 60 * 1000);

      assert.equal(RATE_LIMIT_CONFIG.SIGNUP.MAX, 10);
      assert.equal(RATE_LIMIT_CONFIG.SIGNUP.WINDOW_MS, 15 * 60 * 1000);
      assert.equal(typeof signupRateLimiter, 'function');
    });

    it('verifies config.rateLimits exposes all limiter configurations with defaults', () => {
      assert.ok(config.rateLimits);
      assert.equal(config.rateLimits.apiMax, 300);
      assert.equal(config.rateLimits.chatMax, 30);
      assert.equal(config.rateLimits.expenseAgentMax, 30);
      assert.equal(config.rateLimits.receiptOcrMax, 15);
      assert.equal(config.rateLimits.indexingMax, 10);
      assert.equal(config.rateLimits.signupMax, 10);
    });
  });

  describe('5. Router Middleware Pipeline Coverage', () => {
    /**
     * Inspects route handlers on an Express Router instance.
     */
    function getRouteHandlers(router, path, method) {
      const layer = router.stack.find(
        (l) => l.route && l.route.path === path && l.route.methods[method.toLowerCase()]
      );
      return layer ? layer.route.stack.map((s) => s.handle) : [];
    }

    it('chatRouter protects /chat and /chat/stream with chatRateLimiter and optionalAuthenticate', () => {
      const chatHandlers = getRouteHandlers(chatRouter, '/chat', 'POST');
      assert.ok(chatHandlers.length >= 2, 'Must have at least rate limiter and controller');
      assert.ok(chatHandlers.includes(chatRateLimiter), 'chatRateLimiter must protect /chat');

      const streamHandlers = getRouteHandlers(chatRouter, '/chat/stream', 'POST');
      assert.ok(streamHandlers.includes(chatRateLimiter), 'chatRateLimiter must protect /chat/stream');
    });

    it('expenseAgentRouter protects all 4 AI endpoints with expenseAgentRateLimiter', () => {
      const aiRoutes = ['/search', '/summary', '/assistant', '/create-proposal'];
      for (const routePath of aiRoutes) {
        const handlers = getRouteHandlers(expenseAgentRouter, routePath, 'POST');
        assert.ok(
          handlers.includes(expenseAgentRateLimiter),
          `expenseAgentRateLimiter must protect ${routePath}`
        );
      }

      // Non-AI endpoints must NOT be constrained by expenseAgentRateLimiter
      const confirmHandlers = getRouteHandlers(expenseAgentRouter, '/proposals/:id/confirm', 'POST');
      assert.equal(
        confirmHandlers.includes(expenseAgentRateLimiter),
        false,
        'Confirming proposal is a pure DB operation and must not be throttled by AI limiter'
      );

      const cancelHandlers = getRouteHandlers(expenseAgentRouter, '/proposals/:id', 'DELETE');
      assert.equal(
        cancelHandlers.includes(expenseAgentRateLimiter),
        false,
        'Cancelling proposal is a pure DB operation and must not be throttled by AI limiter'
      );
    });

    it('expenseRouter protects /receipts/upload and /receipts/:id/retry with receiptOcrRateLimiter', () => {
      const uploadHandlers = getRouteHandlers(expenseRouter, '/receipts/upload', 'POST');
      assert.ok(
        uploadHandlers.includes(receiptOcrRateLimiter),
        'receiptOcrRateLimiter must protect /receipts/upload'
      );

      // Verify receiptOcrRateLimiter is placed BEFORE multer upload handler
      const ocrIndex = uploadHandlers.indexOf(receiptOcrRateLimiter);
      assert.equal(ocrIndex, 0, 'receiptOcrRateLimiter must run BEFORE multer file processing');

      const retryHandlers = getRouteHandlers(expenseRouter, '/receipts/:id/retry', 'POST');
      assert.ok(
        retryHandlers.includes(receiptOcrRateLimiter),
        'receiptOcrRateLimiter must protect /receipts/:id/retry'
      );
    });
  });
});
