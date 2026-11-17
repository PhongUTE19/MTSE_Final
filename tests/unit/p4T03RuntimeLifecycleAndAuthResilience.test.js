import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import {
  apiRequest,
  resetUnauthorizedHandlerForTests,
} from '../../client/src/shared/services/apiClient.js';
import { sendChatMessageStream } from '../../client/src/features/chat/chatApi.js';
import { createShutdownManager } from '../../server/src/shared/lifecycle.js';
import { inspectStartupConfig, logStartupDiagnostics } from '../../server/src/config.js';

function createSseStream(chunks) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

describe('P4-T03 Runtime Lifecycle & Frontend Auth Resilience Suite', () => {
  describe('1. F4-04 Frontend SSE Authentication Resilience', () => {
    function setupWindowAndFetch(t, fetchImpl) {
      const originalFetch = globalThis.fetch;
      const originalWindow = globalThis.window;
      const originalCustomEvent = globalThis.CustomEvent;

      const events = [];
      const mockWindow = new EventTarget();
      mockWindow.addEventListener('spendwise:unauthorized', (e) => events.push(e));

      globalThis.window = mockWindow;
      if (typeof globalThis.CustomEvent === 'undefined') {
        globalThis.CustomEvent = class CustomEvent extends Event {
          constructor(type, init = {}) {
            super(type, init);
            this.detail = init.detail;
          }
        };
      }
      globalThis.fetch = fetchImpl;
      resetUnauthorizedHandlerForTests();

      t.after(() => {
        globalThis.fetch = originalFetch;
        globalThis.window = originalWindow;
        globalThis.CustomEvent = originalCustomEvent;
        resetUnauthorizedHandlerForTests();
      });

      return { events };
    }

    it('streams SSE events successfully on HTTP 200 without triggering unauthorized handling', async (t) => {
      const { events } = setupWindowAndFetch(t, async (_url, init) => {
        assert.equal(init.headers.get('Accept'), 'text/event-stream');
        assert.equal(init.headers.get('Content-Type'), 'application/json');
        return new Response(
          createSseStream([
            'event: delta\ndata: {"text":"Hello "}\n\n',
            'event: done\ndata: {"answer":"Hello world"}\n\n',
          ]),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
        );
      });

      const received = [];
      await sendChatMessageStream('Hi', [], {
        onEvent: (event, data) => received.push({ event, data }),
      });

      assert.equal(received.length, 2);
      assert.deepEqual(received[0], { event: 'delta', data: { text: 'Hello ' } });
      assert.deepEqual(received[1], { event: 'done', data: { answer: 'Hello world' } });
      assert.equal(events.length, 0);
    });

    it('triggers shared unauthorized handling once on HTTP 401 without retrying and preserves error message', async (t) => {
      let fetchCalls = 0;
      const { events } = setupWindowAndFetch(t, async () => {
        fetchCalls++;
        return new Response(JSON.stringify({ error: 'Session expired.' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      await assert.rejects(
        () => sendChatMessageStream('Hi', []),
        (err) => err instanceof Error && err.message === 'Session expired.' && err.status === 401
      );

      assert.equal(fetchCalls, 1);
      assert.equal(events.length, 1);

      // Debounced guard prevents duplicate unauthorized dispatch on an immediately following 401
      await assert.rejects(() => apiRequest('/api/transactions'), /Unauthorized|status 401|Session expired/);
      assert.equal(events.length, 1);
    });

    it('does not trigger unauthorized handling on HTTP 403 or HTTP 500', async (t) => {
      const { events } = setupWindowAndFetch(t, async (url) => {
        if (String(url).includes('chat-assistant')) {
          return new Response(JSON.stringify({ error: 'Admin access required.' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response('Bad Gateway', { status: 502 });
      });

      await assert.rejects(
        () => sendChatMessageStream('Hi', []),
        (err) => err.message === 'Admin access required.' && err.status === 403
      );
      assert.equal(events.length, 0);
    });

    it('preserves fallback error message on non-JSON HTTP 500 without triggering unauthorized handling', async (t) => {
      const { events } = setupWindowAndFetch(t, async () => new Response('Internal error', { status: 500 }));

      await assert.rejects(
        () => sendChatMessageStream('Hi', []),
        (err) => err.message === 'Failed to stream response from the Assistant.' && err.status === 500
      );
      assert.equal(events.length, 0);
    });

    it('does not trigger unauthorized handling when aborted via AbortSignal', async (t) => {
      const controller = new AbortController();
      const { events } = setupWindowAndFetch(t, async (_url, init) => {
        assert.equal(init.signal, controller.signal);
        const abortErr = new Error('The operation was aborted.');
        abortErr.name = 'AbortError';
        throw abortErr;
      });

      controller.abort();
      await assert.rejects(
        () => sendChatMessageStream('Hi', [], { signal: controller.signal }),
        (err) => err.name === 'AbortError'
      );
      assert.equal(events.length, 0);
    });
  });

  describe('2. F4-05 Express Graceful Shutdown Lifecycle', () => {
    it('closes HTTP listener idempotently, runs cleanup once even when a task fails, and does not force-exit on success', async () => {
      const server = http.createServer((_req, res) => {
        res.writeHead(200);
        res.end('ok');
      });
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

      const cleanupOrder = [];
      let forceExited = false;
      const fakeProcess = new EventEmitter();
      fakeProcess.exitCode = undefined;
      fakeProcess.exit = () => {
        forceExited = true;
      };

      const logs = [];
      const manager = createShutdownManager({
        server,
        gracePeriodMs: 100,
        forceExitTimeoutMs: 100,
        processRef: fakeProcess,
        logger: {
          log: (m) => logs.push(m),
          warn: (m) => logs.push(m),
          error: (m) => logs.push(m),
        },
        cleanupTasks: [
          { name: 'first', run: async () => { cleanupOrder.push('first'); } },
          { name: 'failing', run: async () => { cleanupOrder.push('failing'); throw new Error('boom'); } },
          { name: 'third', run: async () => { cleanupOrder.push('third'); } },
        ],
        onForceExit: () => {
          forceExited = true;
        },
      });

      const p1 = manager.shutdown('SIGTERM');
      const p2 = manager.shutdown('SIGINT');
      assert.equal(p1, p2);

      const result = await p1;
      assert.equal(server.listening, false);
      assert.deepEqual(cleanupOrder, ['first', 'failing', 'third']);
      assert.equal(result.cleanupErrors.length, 1);
      assert.equal(fakeProcess.exitCode, 1);
      assert.equal(forceExited, false);
    });

    it('allows in-flight HTTP request to complete within grace period', async () => {
      let releaseResponse;
      const server = http.createServer((_req, res) => {
        releaseResponse = () => {
          res.writeHead(200);
          res.end('finished');
        };
      });
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const { port } = server.address();

      const fakeProcess = new EventEmitter();
      const manager = createShutdownManager({
        server,
        gracePeriodMs: 500,
        forceExitTimeoutMs: 500,
        processRef: fakeProcess,
        logger: { log() {}, warn() {}, error() {} },
      });

      const reqPromise = fetch(`http://127.0.0.1:${port}/test`);
      // Wait briefly until request reaches server handler
      await new Promise((resolve) => {
        const check = () => (releaseResponse ? resolve() : setTimeout(check, 5));
        check();
      });

      const shutdownPromise = manager.shutdown('SIGTERM');
      releaseResponse();

      const res = await reqPromise;
      assert.equal(res.status, 200);
      assert.equal(await res.text(), 'finished');

      const result = await shutdownPromise;
      assert.equal(result.timedOut, false);
      assert.equal(server.listening, false);
    });

    it('terminates lingering SSE streams after grace period and runs AbortController cleanup', async () => {
      let sseAbortController = null;
      const server = http.createServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write('event: token\ndata: {"text":"hi"}\n\n');
        sseAbortController = new AbortController();
        manager.trackSseConnection(res, sseAbortController);
      });
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const { port } = server.address();

      const fakeProcess = new EventEmitter();
      const manager = createShutdownManager({
        server,
        gracePeriodMs: 25,
        forceExitTimeoutMs: 500,
        processRef: fakeProcess,
        logger: { log() {}, warn() {}, error() {} },
      });

      const res = await fetch(`http://127.0.0.1:${port}/sse`);
      const reader = res.body.getReader();
      await reader.read(); // Ensure SSE stream is open and tracked
      assert.equal(manager.getActiveSseCount(), 1);

      const result = await manager.shutdown('SIGTERM');
      assert.equal(result.timedOut, true);
      assert.equal(sseAbortController.signal.aborted, true);
      assert.equal(manager.getActiveSseCount(), 0);
      assert.equal(server.listening, false);
    });

    it('registers SIGTERM and SIGINT listeners at most once and cleans them up on unregister', () => {
      const fakeProcess = new EventEmitter();
      const manager = createShutdownManager({
        server: null,
        processRef: fakeProcess,
        logger: { log() {}, warn() {}, error() {} },
      });

      manager.registerSignalHandlers();
      manager.registerSignalHandlers();
      assert.equal(fakeProcess.listenerCount('SIGTERM'), 1);
      assert.equal(fakeProcess.listenerCount('SIGINT'), 1);

      manager.unregisterSignalHandlers();
      assert.equal(fakeProcess.listenerCount('SIGTERM'), 0);
      assert.equal(fakeProcess.listenerCount('SIGINT'), 0);
    });

    it('preserves normal HTTP keep-alive socket reuse before shutdown without closing idle connections', async (t) => {
      const seenSockets = new Set();
      const server = http.createServer((_req, res) => {
        seenSockets.add(_req.socket);
        res.writeHead(200, { Connection: 'keep-alive' });
        res.end('ok');
      });
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const { port } = server.address();

      let closeIdleCalls = 0;
      const origCloseIdle = server.closeIdleConnections.bind(server);
      server.closeIdleConnections = () => {
        closeIdleCalls++;
        return origCloseIdle();
      };

      const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
      const fakeProcess = new EventEmitter();
      const manager = createShutdownManager({
        server,
        gracePeriodMs: 200,
        forceExitTimeoutMs: 200,
        processRef: fakeProcess,
        logger: { log() {}, warn() {}, error() {} },
      });
      t.after(() => agent.destroy());

      for (let i = 0; i < 3; i++) {
        const body = await new Promise((resolve, reject) => {
          const req = http.request(
            { hostname: '127.0.0.1', port, path: `/ping-${i}`, agent },
            (res) => {
              let data = '';
              res.on('data', (c) => { data += c; });
              res.on('end', () => resolve(data));
            }
          );
          req.on('error', reject);
          req.end();
        });
        assert.equal(body, 'ok');
      }

      assert.equal(seenSockets.size, 1, 'Expected all 3 requests to reuse one keep-alive socket');
      assert.equal(closeIdleCalls, 0, 'closeIdleConnections must not be called before shutdown');

      const result = await manager.shutdown('SIGTERM');
      assert.equal(result.timedOut, false);
      assert.ok(closeIdleCalls >= 1, 'closeIdleConnections should run during shutdown');
      assert.equal(server.listening, false);
    });

    it('keeps active SSE stream alive during grace period and aborts it only after grace period expires', async () => {
      let sseRes = null;
      let sseAbortController = null;
      const server = http.createServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write('event: delta\ndata: {"text":"first"}\n\n');
        sseRes = res;
        sseAbortController = new AbortController();
        manager.trackSseConnection(res, sseAbortController);
      });
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const { port } = server.address();

      const fakeProcess = new EventEmitter();
      const manager = createShutdownManager({
        server,
        gracePeriodMs: 120,
        forceExitTimeoutMs: 500,
        processRef: fakeProcess,
        logger: { log() {}, warn() {}, error() {} },
      });

      const res = await fetch(`http://127.0.0.1:${port}/sse`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const firstChunk = await reader.read();
      assert.ok(decoder.decode(firstChunk.value).includes('first'));

      const shutdownPromise = manager.shutdown('SIGTERM');

      // Inside grace period: SSE connection must still be alive and able to flush events
      await new Promise((r) => setTimeout(r, 20));
      assert.equal(sseAbortController.signal.aborted, false);
      assert.equal(manager.getActiveSseCount(), 1);
      sseRes.write('event: delta\ndata: {"text":"during-grace"}\n\n');
      const secondChunk = await reader.read();
      assert.ok(decoder.decode(secondChunk.value).includes('during-grace'));

      // After grace period expires: lingering SSE stream is aborted and closed
      const result = await shutdownPromise;
      assert.equal(result.timedOut, true);
      assert.equal(sseAbortController.signal.aborted, true);
      assert.equal(manager.getActiveSseCount(), 0);
      assert.equal(server.listening, false);
    });
  });

  describe('3. F4-05 Startup Configuration Diagnostics', () => {
    it('distinguishes missing required config from optional services and never logs secret values', () => {
      const result = inspectStartupConfig({
        aiProvider: 'gemini',
        embeddingProvider: 'gemini',
        dbProvider: 'supabase',
        geminiApiKey: '',
        supabaseUrl: 'https://proj.supabase.co',
        supabaseAnonKey: 'anon-secret-value',
        supabaseServiceKey: '',
        qdrantUrl: '',
        trustProxy: '',
        corsOrigin: '',
      });

      assert.deepEqual(result.missingRequired, ['GEMINI_API_KEY', 'SUPABASE_SECRET_KEY']);
      assert.deepEqual(result.unconfiguredOptional, ['QDRANT_URL', 'TRUST_PROXY', 'CORS_ORIGIN']);

      const logged = [];
      logStartupDiagnostics(
        {
          aiProvider: 'gemini',
          embeddingProvider: 'gemini',
          dbProvider: 'supabase',
          geminiApiKey: 'super-secret-gemini-key',
          supabaseUrl: 'https://proj.supabase.co',
          supabaseAnonKey: 'anon-secret-value',
          supabaseServiceKey: 'service-role-secret-value',
          qdrantUrl: '',
          trustProxy: '1',
          corsOrigin: 'https://app.example.com',
        },
        {
          info: (...args) => logged.push(args.join(' ')),
          warn: (...args) => logged.push(args.join(' ')),
        }
      );

      const output = logged.join('\n');
      assert.ok(output.includes('QDRANT_URL'));
      assert.ok(!output.includes('super-secret-gemini-key'));
      assert.ok(!output.includes('anon-secret-value'));
      assert.ok(!output.includes('service-role-secret-value'));
    });
  });
});
