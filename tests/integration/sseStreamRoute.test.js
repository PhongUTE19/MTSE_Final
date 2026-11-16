import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import chatAssistantRouter from '../../server/src/features/chatAssistant/chatAssistant.route.js';
import { setTokenVerifierForTests } from '../../server/src/shared/middleware/authenticate.js';
import { setAIClientForTests } from '../../server/src/shared/integrations/ai/index.js';

function dispatchSSE(router, { headers = {}, body } = {}) {
  return new Promise((resolve) => {
    const req = new EventEmitter();
    req.method = 'POST';
    req.url = '/stream';
    req.originalUrl = '/api/chat-assistant/stream';
    req.headers = headers;
    req.body = body;
    req.query = {};
    req.params = {};
    req.app = { locals: { enableChatStreamPersistence: false } };

    const chunks = [];
    const responseHeaders = {};
    const res = new EventEmitter();
    Object.assign(res, {
      locals: {},
      headersSent: false,
      writableEnded: false,
      closed: false,
      statusCode: 200,
      setHeader(k, v) { responseHeaders[k.toLowerCase()] = v; },
      flushHeaders() { this.headersSent = true; },
      write(chunk) { chunks.push(String(chunk)); },
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.headersSent = true; this.writableEnded = true; resolve({ status: this.statusCode, headers: responseHeaders, json: payload, raw: '' }); },
      end() { this.writableEnded = true; resolve({ status: this.statusCode, headers: responseHeaders, raw: chunks.join('') }); },
    });

    router.handle(req, res, (err) => {
      if (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
      }
    });
  });
}

describe('P2-T13 Real End-to-End SSE Route Integration Suite (6.3)', () => {
  it('streams meta -> deltas -> proposal -> done with valid SSE framing and headers', async (t) => {
    setTokenVerifierForTests(async (token) => (token === 'u-token' ? { id: 'u1', app_metadata: { role: 'user' } } : null));
    let turn = 0;
    setAIClientForTests({
      models: {
        generateContentStream: async () => (async function* () {
          turn += 1;
          if (turn === 1) {
            yield { functionCalls: [{ name: 'propose_transaction', args: { type: 'expense', amount: 50000, date: '2026-11-17', category: 'Food & dining', merchant: 'Highlands' } }] };
            return;
          }
          yield { text: 'Ready ' };
          yield { text: 'to review.' };
        })(),
      },
    });
    t.after(() => {
      setTokenVerifierForTests(null);
      setAIClientForTests(null);
    });

    const res = await dispatchSSE(chatAssistantRouter, {
      headers: { authorization: 'Bearer u-token' },
      body: { message: 'Log 50k coffee today' },
    });

    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/event-stream/);
    assert.equal(res.headers['cache-control'], 'no-cache, no-transform');

    const frames = res.raw.split('\n\n').filter(Boolean);
    const eventNames = frames.map((f) => f.match(/^event:\s*(\S+)/m)?.[1]);
    assert.equal(eventNames[0], 'meta');
    assert.ok(eventNames.includes('proposal'));
    assert.equal(eventNames.filter((n) => n === 'delta').length, 2);
    assert.equal(eventNames[eventNames.length - 1], 'done');
  });

  it('emits error event and never emits done when provider fails mid-stream', async (t) => {
    setTokenVerifierForTests(async (token) => (token === 'u-token' ? { id: 'u1', app_metadata: { role: 'user' } } : null));
    setAIClientForTests({
      models: {
        generateContentStream: async () => (async function* () {
          yield { text: 'Partial ' };
          throw new Error('Upstream AI error with secret sk-test-123');
        })(),
      },
    });
    t.after(() => {
      setTokenVerifierForTests(null);
      setAIClientForTests(null);
    });

    const res = await dispatchSSE(chatAssistantRouter, {
      headers: { authorization: 'Bearer u-token' },
      body: { message: 'How much did I spend?' },
    });

    const frames = res.raw.split('\n\n').filter(Boolean);
    const eventNames = frames.map((f) => f.match(/^event:\s*(\S+)/m)?.[1]);
    assert.equal(eventNames[0], 'meta');
    assert.ok(eventNames.includes('delta'));
    assert.ok(eventNames.includes('error'));
    assert.equal(eventNames.includes('done'), false);
    assert.doesNotMatch(res.raw, /sk-test-123/);
  });

  it('handles Express disconnect before completion without emitting done and ignores repeated close after end', async (t) => {
    setTokenVerifierForTests(async (token) => (token === 'u-token' ? { id: 'u1', app_metadata: { role: 'user' } } : null));
    let seenAbortCount = 0;
    setAIClientForTests({
      models: {
        generateContentStream: async (req) => {
          req.config?.abortSignal?.addEventListener('abort', () => { seenAbortCount += 1; });
          return (async function* () {
            yield { text: 'Chunk 1 ' };
            await new Promise((r) => setTimeout(r, 30));
            yield { text: 'Chunk 2' };
          })();
        },
      },
    });
    t.after(() => {
      setTokenVerifierForTests(null);
      setAIClientForTests(null);
    });

    // Normal completion: res.emit('close') after end must not trigger abort
    const normalRes = await dispatchSSE(chatAssistantRouter, {
      headers: { authorization: 'Bearer u-token' },
      body: { message: 'How much did I spend?' },
    });
    assert.equal(seenAbortCount, 0);
    assert.match(normalRes.raw, /event: done/);

    // Early client disconnect: triggers abort exactly once and suppresses done
    const earlyResult = await new Promise((resolve) => {
      const req = new EventEmitter();
      req.method = 'POST';
      req.url = '/stream';
      req.originalUrl = '/api/chat-assistant/stream';
      req.headers = { authorization: 'Bearer u-token' };
      req.body = { message: 'How much did I spend?' };
      req.query = {};
      req.params = {};
      req.app = { locals: { enableChatStreamPersistence: false } };

      const chunks = [];
      const res = new EventEmitter();
      Object.assign(res, {
        locals: {},
        headersSent: false,
        writableEnded: false,
        closed: false,
        statusCode: 200,
        setHeader() {},
        flushHeaders() { this.headersSent = true; },
        write(chunk) {
          chunks.push(String(chunk));
          if (String(chunk).includes('event: delta')) {
            res.emit('close');
            res.emit('close'); // Repeated close must trigger abort once
          }
        },
        end() { this.writableEnded = true; resolve(chunks.join('')); },
      });
      chatAssistantRouter.handle(req, res, () => {});
    });

    assert.equal(seenAbortCount, 1);
    assert.doesNotMatch(earlyResult, /event: done/);
  });
});
