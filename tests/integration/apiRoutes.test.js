import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import express from '../../server/node_modules/express/index.js';

import chatRouter from '../../server/src/features/chatAssistant/chatAssistant.route.js';
import transactionRouter from '../../server/src/features/transaction/transaction.route.js';
import receiptRouter from '../../server/src/features/receipt/receipt.route.js';
import expenseAssistantRouter from '../../server/src/features/expenseAssistant/expenseAssistant.route.js';
import adminRoute from '../../server/src/routes/adminRoute.js';
import knowledgeBaseRouter from '../../server/src/features/knowledgeBase/knowledgeBase.route.js';
import { errorHandler } from '../../server/src/shared/middleware/errorHandler.js';
import { notFoundHandler } from '../../server/src/shared/middleware/notFoundHandler.js';
import { SERVER_MESSAGES, PAGINATION_LIMITS } from '../../server/src/constants/index.js';
import { setTokenVerifierForTests } from '../../server/src/shared/middleware/authenticate.js';

describe('Express Route -> Validation Middleware -> Controller Integration Pipeline Suite', () => {
  let app;
  let server;
  let baseUrl;
  const adminHeaders = {
    'Content-Type': 'application/json',
    Authorization: 'Bearer integration-admin-token',
  };
  const userHeaders = {
    'Content-Type': 'application/json',
    Authorization: 'Bearer integration-user-token',
  };

  // The test cases below verify route validation, so grant verified identities
  // rather than being blocked by the authentication or authorization middleware.
  before(() => setTokenVerifierForTests(async (token) => {
    if (token === 'integration-admin-token') {
      return { id: 'admin-a', app_metadata: { role: 'admin' } };
    }
    if (token === 'integration-user-token') {
      return { id: 'user-a', app_metadata: { role: 'user' } };
    }
    return null;
  }));
  after(() => setTokenVerifierForTests(null));

  // Helper to start ephemeral Express server matching server.js mount order
  const startTestServer = () => new Promise((resolve) => {
    app = express();
    app.use(express.json());
    app.use('/api/admin', adminRoute);
    app.use('/api/chat-assistant', chatRouter);
    app.use('/api', transactionRouter);
    app.use('/api/receipt', receiptRouter);
    app.use('/api/expense-assistant', expenseAssistantRouter);
    app.get('/api/health', (_req, res) => {
      res.json({ status: 'ok', indexedChunks: 0 });
    });
    app.use(notFoundHandler);
    app.use(errorHandler);

    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  const stopTestServer = () => new Promise((resolve) => {
    if (server) {
      server.close(() => resolve());
    } else {
      resolve();
    }
  });

  it('route-level validation middleware catches invalid chat query and returns 400 ValidationError JSON', async () => {
    await startTestServer();
    try {
      const res = await fetch(`${baseUrl}/api/chat-assistant`, {
        method: 'POST',
        headers: userHeaders,
        body: JSON.stringify({ message: '   ' }),
      });

      assert.equal(res.status, 400);
      assert.equal(res.headers.get('content-type')?.includes('application/json'), true);
      const data = await res.json();
      assert.deepEqual(data, { error: SERVER_MESSAGES.ERRORS.QUERY_REQUIRED });
    } finally {
      await stopTestServer();
    }
  });

  it('route-level validation rejects invalid params and path-traversal attempts before reaching controller', async () => {
    await startTestServer();
    try {
      const maliciousParam = encodeURIComponent('../academic.md');
      const res = await fetch(`${baseUrl}/api/admin/document/${maliciousParam}`, { headers: adminHeaders });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.deepEqual(data, { error: SERVER_MESSAGES.ERRORS.INVALID_FILENAME });
    } finally {
      await stopTestServer();
    }
  });

  it('Express 5 query handling parses and defaults parameters into res.locals.validated without mutating req.query', async () => {
    await startTestServer();
    try {
      // Valid numeric query string
      const res = await fetch(`${baseUrl}/api/admin/knowledge-base/chunks?limit=2&offset=1&q=tuition`, { headers: adminHeaders });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.limit, 2);
      assert.equal(data.offset, 1);
      assert.ok(Array.isArray(data.chunks));

      // Clamped query string (negative / invalid values)
      const resClamped = await fetch(`${baseUrl}/api/admin/knowledge-base/chunks?limit=-10&offset=invalid`, { headers: adminHeaders });
      assert.equal(resClamped.status, 200);
      const clampedData = await resClamped.json();
      assert.equal(clampedData.limit, PAGINATION_LIMITS.DEFAULT_LIMIT);
      assert.equal(clampedData.offset, PAGINATION_LIMITS.DEFAULT_OFFSET);
    } finally {
      await stopTestServer();
    }
  });

  it('pre-stream validation rejects invalid SSE requests with HTTP 400 JSON before any stream headers are sent', async () => {
    await startTestServer();
    try {
      const res = await fetch(`${baseUrl}/api/chat-assistant/stream`, {
        method: 'POST',
        headers: userHeaders,
        body: JSON.stringify({ message: '' }),
      });

      assert.equal(res.status, 400);
      // Stream headers must NOT be sent; response must be regular JSON
      const contentType = res.headers.get('content-type');
      assert.ok(contentType?.includes('application/json'), `Expected JSON content-type but got ${contentType}`);
      assert.equal(contentType?.includes('text/event-stream'), false);

      const data = await res.json();
      assert.deepEqual(data, { error: SERVER_MESSAGES.ERRORS.QUERY_REQUIRED });
    } finally {
      await stopTestServer();
    }
  });

  it('read-only admin document and system-prompt inspection endpoints succeed for verified admins', async () => {
    await startTestServer();
    try {
      const listRes = await fetch(`${baseUrl}/api/admin/document`, { headers: adminHeaders });
      assert.equal(listRes.status, 200);
      const listData = await listRes.json();
      assert.ok(Array.isArray(listData.documents));
      assert.ok(listData.documents.some((doc) => doc.filename === 'spendwise_user_guide.md'));

      const readRes = await fetch(`${baseUrl}/api/admin/document/spendwise_user_guide.md`, { headers: adminHeaders });
      assert.equal(readRes.status, 200);
      const readData = await readRes.json();
      assert.equal(readData.filename, 'spendwise_user_guide.md');
      assert.ok(readData.content.length > 0);

      const promptRes = await fetch(`${baseUrl}/api/admin/system-prompt`, { headers: adminHeaders });
      assert.equal(promptRes.status, 200);
      const promptData = await promptRes.json();
      assert.ok(promptData.prompt.includes('SpendWise'));
    } finally {
      await stopTestServer();
    }
  });

  it('removed admin document and system-prompt mutation endpoints return 404 while re-index remains mounted', async () => {
    await startTestServer();
    try {
      const removedRoutes = [
        { path: '/api/admin/document', method: 'POST', body: { filename: 'test.md', content: '## Section\nBody' } },
        { path: '/api/admin/document/spendwise_user_guide.md', method: 'PUT', body: { content: '## Section\nBody' } },
        { path: '/api/admin/document/spendwise_user_guide.md', method: 'DELETE' },
        { path: '/api/admin/system-prompt', method: 'PUT', body: { prompt: 'A'.repeat(30) } },
        { path: '/api/admin/system-prompt/reset', method: 'POST' },
      ];

      for (const route of removedRoutes) {
        const res = await fetch(`${baseUrl}${route.path}`, {
          method: route.method,
          headers: adminHeaders,
          body: route.body ? JSON.stringify(route.body) : undefined,
        });
        assert.equal(res.status, 404, `Expected 404 for ${route.method} ${route.path}`);
      }

      // Verify POST /api/admin/knowledge-base/index remains mounted and protected
      const reindexLayer = knowledgeBaseRouter.stack.find(
        (layer) => layer.route && layer.route.path === '/index' && layer.route.methods.post
      );
      assert.ok(reindexLayer, 'POST /index must remain mounted on knowledgeBaseRouter');
      const unauthReindex = await fetch(`${baseUrl}/api/admin/knowledge-base/index`, { method: 'POST' });
      assert.equal(unauthReindex.status, 401);
    } finally {
      await stopTestServer();
    }
  });

  it('all route rejection responses maintain uniform { error: message } compatibility with HTTP 400', async () => {
    await startTestServer();
    try {
      const badRoutes = [
        { path: '/api/chat-assistant', method: 'POST', body: { message: null }, expected: SERVER_MESSAGES.ERRORS.QUERY_REQUIRED },
        { path: '/api/admin/document/..%2Fsecret.md', method: 'GET', expected: SERVER_MESSAGES.ERRORS.INVALID_FILENAME },
      ];

      for (const route of badRoutes) {
        const res = await fetch(`${baseUrl}${route.path}`, {
          method: route.method,
          headers: route.path.startsWith('/api/admin') ? adminHeaders : userHeaders,
          body: route.body ? JSON.stringify(route.body) : undefined,
        });
        assert.equal(res.status, 400, `Expected 400 for ${route.path}`);
        const data = await res.json();
        assert.deepEqual(data, { error: route.expected });
      }
    } finally {
      await stopTestServer();
    }
  });

  it('Admin can load /api/health and Knowledge Base read-only APIs without 403 while User-only and Admin-only boundaries hold', async () => {
    await startTestServer();
    try {
      // 1. Admin on /home and /admin/knowledge-base calls /api/health (must NOT be intercepted by transactionRouter)
      const adminHealth = await fetch(`${baseUrl}/api/health`, { headers: adminHeaders });
      assert.equal(adminHealth.status, 200, 'Admin health check must succeed with 200');
      assert.deepEqual(await adminHealth.json(), { status: 'ok', indexedChunks: 0 });

      const userHealth = await fetch(`${baseUrl}/api/health`, { headers: userHeaders });
      assert.equal(userHealth.status, 200, 'User health check must succeed with 200');

      // 2. Admin can load Knowledge Base read-only data (documents, chunks)
      const adminDocs = await fetch(`${baseUrl}/api/admin/document`, { headers: adminHeaders });
      assert.equal(adminDocs.status, 200);
      const adminChunks = await fetch(`${baseUrl}/api/admin/knowledge-base/chunks?limit=10&offset=0`, { headers: adminHeaders });
      assert.equal(adminChunks.status, 200);

      // 3. Guest is denied Admin APIs (401) and User-only finance APIs (401)
      const guestDocs = await fetch(`${baseUrl}/api/admin/document`);
      assert.equal(guestDocs.status, 401);
      const guestIndex = await fetch(`${baseUrl}/api/admin/knowledge-base/index`, { method: 'POST' });
      assert.equal(guestIndex.status, 401);

      // 4. User is denied Admin APIs (403)
      const userDocs = await fetch(`${baseUrl}/api/admin/document`, { headers: userHeaders });
      assert.equal(userDocs.status, 403);
      const userIndex = await fetch(`${baseUrl}/api/admin/knowledge-base/index`, { method: 'POST', headers: userHeaders });
      assert.equal(userIndex.status, 403);

      // 5. Admin is still denied all 4 User-only finance/chat APIs (403)
      const adminTx = await fetch(`${baseUrl}/api/transaction`, { headers: adminHeaders });
      assert.equal(adminTx.status, 403);
      const adminReceipt = await fetch(`${baseUrl}/api/receipt`, { headers: adminHeaders });
      assert.equal(adminReceipt.status, 403);
      const adminExpenseAi = await fetch(`${baseUrl}/api/expense-assistant`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ message: 'List spending' }),
      });
      assert.equal(adminExpenseAi.status, 403);
      const adminChat = await fetch(`${baseUrl}/api/chat-assistant`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ message: 'Hello' }),
      });
      assert.equal(adminChat.status, 403);
    } finally {
      await stopTestServer();
    }
  });
});
