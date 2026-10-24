import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import express from '../../server/node_modules/express/index.js';

import chatRouter from '../../server/src/features/chat/chat.routes.js';
import adminRoute from '../../server/src/routes/adminRoute.js';
import { errorHandler } from '../../server/src/shared/middleware/errorHandler.js';
import { removeDocument } from '../../server/src/features/documents/documents.service.js';
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

  // Các case bên dưới kiểm tra validation của admin routes, nên cấp đúng
  // identity admin thay vì bị chặn ở middleware authentication trước đó.
  before(() => setTokenVerifierForTests(async (token) => (
    token === 'integration-admin-token'
      ? { id: 'admin-a', app_metadata: { role: 'admin' } }
      : null
  )));
  after(() => setTokenVerifierForTests(null));

  // Helper to start ephemeral Express server for route integration tests
  const startTestServer = () => new Promise((resolve) => {
    app = express();
    app.use(express.json());
    app.use('/api/user', chatRouter);
    app.use('/api/admin', adminRoute);
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
      const res = await fetch(`${baseUrl}/api/user/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      const res = await fetch(`${baseUrl}/api/admin/documents/${maliciousParam}`, { headers: adminHeaders });

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
      const res = await fetch(`${baseUrl}/api/admin/chunks?limit=2&offset=1&q=tuition`, { headers: adminHeaders });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.limit, 2);
      assert.equal(data.offset, 1);
      assert.ok(Array.isArray(data.chunks));

      // Clamped query string (negative / invalid values)
      const resClamped = await fetch(`${baseUrl}/api/admin/chunks?limit=-10&offset=invalid`, { headers: adminHeaders });
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
      const res = await fetch(`${baseUrl}/api/user/chat/stream`, {
        method: 'POST',
        headers: adminHeaders,
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

  it('parsed and sanitized values from validateRequest middleware reach controller cleanly', async () => {
    await startTestServer();
    const testDocFilename = 'integration_temp_doc';
    try {
      // POST document without .md extension in filename
      const res = await fetch(`${baseUrl}/api/admin/documents`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          filename: testDocFilename,
          content: '## Integration Section\nValidated content reaching controller.',
          overwrite: true,
        }),
      });

      assert.equal(res.status, 201);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.filename, `${testDocFilename}.md`);
    } finally {
      // Clean up test document
      try {
        await removeDocument(`${testDocFilename}.md`);
      } catch {
        // Ignore cleanup error
      }
      await stopTestServer();
    }
  });

  it('all route rejection responses maintain uniform { error: message } compatibility with HTTP 400', async () => {
    await startTestServer();
    try {
      const badRoutes = [
        { path: '/api/user/chat', method: 'POST', body: { message: null }, expected: SERVER_MESSAGES.ERRORS.QUERY_REQUIRED },
        { path: '/api/admin/prompt', method: 'PUT', body: { prompt: 'short' }, expected: SERVER_MESSAGES.ERRORS.PROMPT_TOO_SHORT },
        { path: '/api/admin/documents', method: 'POST', body: { filename: '', content: '## Section\nContent' }, expected: SERVER_MESSAGES.ERRORS.FILENAME_REQUIRED },
      ];

      for (const route of badRoutes) {
        const res = await fetch(`${baseUrl}${route.path}`, {
          method: route.method,
          headers: route.path.startsWith('/api/admin') ? adminHeaders : { 'Content-Type': 'application/json' },
          body: JSON.stringify(route.body),
        });
        assert.equal(res.status, 400, `Expected 400 for ${route.path}`);
        const data = await res.json();
        assert.deepEqual(data, { error: route.expected });
      }
    } finally {
      await stopTestServer();
    }
  });
});
