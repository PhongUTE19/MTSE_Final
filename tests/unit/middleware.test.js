import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chatRequestSchema } from '../../server/src/features/chat/chat.schemas.js';
import {
  getValidatedData,
  validateRequest,
  authenticate,
  optionalAuthenticate,
  authorize,
  requireRole,
  notFoundHandler,
  errorHandler,
  apiRateLimiter,
  chatRateLimiter,
  expenseAgentRateLimiter,
  receiptOcrRateLimiter,
  indexingRateLimiter,
  createLimiter,
  resolveRateLimitKey,
} from '../../server/src/shared/middleware/index.js';

import {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  TooManyRequestsError,
} from '../../server/src/shared/errors/index.js';
import { HTTP_STATUS } from '../../server/src/constants/index.js';
import { setTokenVerifierForTests } from '../../server/src/shared/middleware/authenticate.js';

describe('Shared Middleware Suite', () => {
  describe('1. getValidatedData Standardized Consumption', () => {
    it('retrieves pre-validated data from res.locals.validated when present', () => {
      const res = {
        locals: {
          validated: {
            body: { message: 'Verified' },
          },
        },
      };

      const result = getValidatedData(res, 'body', chatRequestSchema, { message: 'Ignored' });
      assert.deepStrictEqual(result, { message: 'Verified' });
    });

    it('falls back to synchronous validate() when res.locals.validated is absent', () => {
      const res = {};
      const result = getValidatedData(res, 'body', chatRequestSchema, { message: 'Fallback' });
      assert.deepStrictEqual(result, { message: 'Fallback' });
    });

    it('throws custom errorClass on fallback validation failure', () => {
      class CustomError extends Error {
        constructor(msg, status) {
          super(msg);
          this.status = status;
        }
      }

      const res = {};
      assert.throws(
        () => getValidatedData(res, 'body', chatRequestSchema, { message: '' }, CustomError),
        (err) => err instanceof CustomError && err.status === 400
      );
    });

    it('returns raw fallbackData if no schema is provided', () => {
      const res = {};
      const raw = { foo: 'bar' };
      const result = getValidatedData(res, 'query', null, raw);
      assert.deepStrictEqual(result, raw);
    });
  });

  describe('2. validateRequest Middleware', () => {
    it('populates res.locals.validated and invokes next without error', () => {
      const req = { body: { message: 'Valid query' }, params: {}, query: {} };
      const res = { locals: {} };
      let nextCalled = false;

      const middleware = validateRequest({ body: chatRequestSchema });
      middleware(req, res, (err) => {
        assert.equal(err, undefined);
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
      assert.deepStrictEqual(res.locals.validated.body, { message: 'Valid query' });
    });

    it('forwards ValidationError to next() when payload is invalid', () => {
      const req = { body: { message: '' }, params: {}, query: {} };
      const res = { locals: {} };
      let passedError = null;

      const middleware = validateRequest({ body: chatRequestSchema });
      middleware(req, res, (err) => {
        passedError = err;
      });

      assert.ok(passedError instanceof ValidationError);
      assert.equal(passedError.statusCode, 400);
    });
  });


  describe('3. authenticate & optionalAuthenticate Middleware', () => {
    it('authenticate: rejects missing authorization header with UnauthorizedError', async () => {
      const req = { headers: {} };
      let err;
      await authenticate(req, {}, (e) => { err = e; });

      assert.ok(err instanceof UnauthorizedError);
      assert.equal(err.statusCode, HTTP_STATUS.UNAUTHORIZED);
    });

    it('authenticate: rejects non-Bearer header format with UnauthorizedError', async () => {
      const req = { headers: { authorization: 'Basic 12345' } };
      let err;
      await authenticate(req, {}, (e) => { err = e; });

      assert.ok(err instanceof UnauthorizedError);
      assert.equal(err.statusCode, HTTP_STATUS.UNAUTHORIZED);
    });

    it('authenticate: verifies a Supabase identity and ignores user_metadata roles', async () => {
      setTokenVerifierForTests(async () => ({ id: 'user-1', email: 'user@example.com', app_metadata: {}, user_metadata: { role: 'admin' } }));
      const req = { headers: { authorization: 'Bearer test-valid-jwt-token' } };
      let nextCalled = false;
      await authenticate(req, {}, (e) => {
        assert.equal(e, undefined);
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
      assert.ok(req.user);
      assert.equal(req.user.token, 'test-valid-jwt-token');
      assert.equal(req.user.role, 'user');
      setTokenVerifierForTests(null);
    });

    it('optionalAuthenticate: only populates req.user after verification', async () => {
      setTokenVerifierForTests(async () => ({ id: 'user-2', email: 'optional@example.com', app_metadata: { role: 'admin' } }));
      const reqWithToken = { headers: { authorization: 'Bearer opt-token' } };
      await optionalAuthenticate(reqWithToken, {}, () => {});
      assert.equal(reqWithToken.user?.token, 'opt-token');
      assert.equal(reqWithToken.user?.role, 'admin');

      const reqWithoutToken = { headers: {} };
      let nextCalled = false;
      await optionalAuthenticate(reqWithoutToken, {}, () => { nextCalled = true; });
      assert.equal(nextCalled, true);
      assert.equal(reqWithoutToken.user, undefined);
      setTokenVerifierForTests(null);
    });
  });

  describe('4. authorize Middleware', () => {
    it('rejects with UnauthorizedError if req.user is absent', () => {
      const req = {};
      const guard = authorize('admin');
      let err;
      guard(req, {}, (e) => { err = e; });

      assert.ok(err instanceof UnauthorizedError);
      assert.equal(err.statusCode, HTTP_STATUS.UNAUTHORIZED);
    });

    it('rejects with ForbiddenError if user role is not permitted', () => {
      const req = { user: { role: 'user' } };
      const guard = authorize('admin');
      let err;
      guard(req, {}, (e) => { err = e; });

      assert.ok(err instanceof ForbiddenError);
      assert.equal(err.statusCode, HTTP_STATUS.FORBIDDEN);
    });

    it('allows access when user role matches allowed roles', () => {
      const req = { user: { role: 'admin' } };
      const guard = requireRole('admin', 'editor');
      let nextCalled = false;
      guard(req, {}, (e) => {
        assert.equal(e, undefined);
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
    });
  });

  describe('5. notFoundHandler Middleware', () => {
    it('passes NotFoundError to next() with accurate route path', () => {
      const req = { method: 'POST', originalUrl: '/api/unknown-endpoint' };
      let capturedError;
      notFoundHandler(req, {}, (err) => {
        capturedError = err;
      });

      assert.ok(capturedError instanceof NotFoundError);
      assert.equal(capturedError.statusCode, HTTP_STATUS.NOT_FOUND);
      assert.match(capturedError.message, /Route not found: POST \/api\/unknown-endpoint/);
    });
  });

  describe('6. errorHandler Middleware', () => {
    it('maps operational errors to their defined status code and message', () => {
      const error = new NotFoundError('Custom document not found.');
      const req = { method: 'GET', originalUrl: '/api/admin/documents/missing.md' };
      let sentStatus = null;
      let sentBody = null;

      const res = {
        headersSent: false,
        status(code) {
          sentStatus = code;
          return this;
        },
        json(data) {
          sentBody = data;
        },
      };

      errorHandler(error, req, res, () => {});

      assert.equal(sentStatus, HTTP_STATUS.NOT_FOUND);
      assert.deepStrictEqual(sentBody, { error: 'Custom document not found.' });
    });

    it('sanitizes unexpected internal 500 errors to avoid leaking stack traces', () => {
      const fatalError = new Error('Database password was leaked: secret123');
      const req = { method: 'POST', originalUrl: '/api/user/chat' };
      let sentStatus = null;
      let sentBody = null;

      const res = {
        headersSent: false,
        status(code) {
          sentStatus = code;
          return this;
        },
        json(data) {
          sentBody = data;
        },
      };

      errorHandler(fatalError, req, res, () => {});

      assert.equal(sentStatus, HTTP_STATUS.INTERNAL_SERVER_ERROR);
      assert.equal(sentBody.error, 'An unexpected error occurred.');
    });

    it('delegates to default Express handler if headersSent is true', () => {
      const res = { headersSent: true };
      let nextCalledWith = null;

      errorHandler(new Error('Mid-stream failure'), {}, res, (err) => {
        nextCalledWith = err;
      });

      assert.ok(nextCalledWith);
      assert.equal(nextCalledWith.message, 'Mid-stream failure');
    });
  });

  describe('7. Security & Rate Limiting Middleware', () => {
    it('exports configured rate limiter middleware instances', () => {
      assert.equal(typeof apiRateLimiter, 'function');
      assert.equal(typeof chatRateLimiter, 'function');
      assert.equal(typeof expenseAgentRateLimiter, 'function');
      assert.equal(typeof receiptOcrRateLimiter, 'function');
      assert.equal(typeof indexingRateLimiter, 'function');
      assert.equal(typeof createLimiter, 'function');
      assert.equal(typeof resolveRateLimitKey, 'function');
    });

    it('skips rate limiting in test environment without blocking requests', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      let nextCalled = false;
      const req = { ip: '127.0.0.1', headers: {} };
      const res = { setHeader: () => {} };

      await chatRateLimiter(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
      process.env.NODE_ENV = originalEnv;
    });
  });
});
