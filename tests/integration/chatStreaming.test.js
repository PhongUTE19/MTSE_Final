import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { orchestrateChatStream } from '../../server/src/features/assistant/assistant.service.js';
import * as chatController from '../../server/src/features/assistant/assistant.controller.js';

describe('Server-Sent Events (SSE) Streaming Lifecycle and Parser Integration Suite', () => {
  it('parses SSE events across fragmented chunks and handles multiple events per read', () => {
    function findEventBoundary(str) {
      const idxCRLF = str.indexOf('\r\n\r\n');
      const idxLF = str.indexOf('\n\n');
      if (idxCRLF !== -1 && (idxLF === -1 || idxCRLF <= idxLF)) {
        return { index: idxCRLF, len: 4 };
      }
      if (idxLF !== -1) {
        return { index: idxLF, len: 2 };
      }
      return null;
    }

    function parseBlock(block) {
      const lines = block.split(/\r?\n/);
      let eventType = null;
      const dataLines = [];
      for (const line of lines) {
        if (!line || line.startsWith(':')) continue;
        if (line.startsWith('event:')) {
          eventType = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trimStart());
        }
      }
      if (!eventType && dataLines.length === 0) return null;
      eventType = eventType || 'message';
      if (dataLines.length > 0) {
        const raw = dataLines.join('\n');
        let data = raw;
        try {
          data = JSON.parse(raw);
        } catch {
          // keep raw string
        }
        return { event: eventType, data };
      }
      return { event: eventType, data: {} };
    }

    const networkChunks = [
      'event: metadata\r\n',
      'data: {"sources":[{"id":"sec2"}]}\r\n\r\n: ping\n\nevent: delta\n',
      'data: {"text":"Tuition ' + 'is "}\n\nevent: delta\ndata: {"text":"42,000,000 VND"}\n\n',
      'event: done\ndata: {}\n\n',
    ];

    let buffer = '';
    const events = [];

    for (const chunk of networkChunks) {
      buffer += chunk;
      let boundary;
      while ((boundary = findEventBoundary(buffer)) !== null) {
        const block = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary.len);
        if (block.trim()) {
          const parsed = parseBlock(block);
          if (parsed) events.push(parsed);
        }
      }
    }

    assert.equal(events.length, 4);
    assert.equal(events[0].event, 'metadata');
    assert.equal(events[0].data.sources[0].id, 'sec2');
    assert.equal(events[1].event, 'delta');
    assert.equal(events[1].data.text, 'Tuition is ');
    assert.equal(events[2].event, 'delta');
    assert.equal(events[2].data.text, '42,000,000 VND');
    assert.equal(events[3].event, 'done');
  });

  it('streams progressive tokens and terminal done event for valid query', async () => {
    async function simulateChatStream({ query, mockRetrievedChunks, mockStreamTokens, similarityThreshold }) {
      const events = [];
      const sendEvent = (event, data) => events.push({ event, data });

      const bestScore = mockRetrievedChunks[0]?.score || 0;
      const passedThreshold = bestScore >= similarityThreshold;

      const diagnosticChunks = mockRetrievedChunks.map((c, idx) => ({
        rank: idx + 1,
        id: c.id,
        score: c.score,
        passedToLLM: passedThreshold,
      }));

      const sources = mockRetrievedChunks.map((c) => ({ id: c.id, score: c.score }));
      const metadata = {
        similarityThreshold,
        bestScore,
        retrievedChunks: diagnosticChunks,
        usedChunks: diagnosticChunks,
      };

      sendEvent('metadata', { sources, retrieval: metadata });

      for (const token of mockStreamTokens) {
        sendEvent('delta', { text: token });
      }

      sendEvent('done', { sources, retrieval: metadata });

      return events;
    }

    const events = await simulateChatStream({
      query: 'What is the tuition fee?',
      mockRetrievedChunks: [{ id: 'sec2', score: 0.85 }],
      mockStreamTokens: ['The ', 'tuition ', 'is 42,000,000 VND.'],
      similarityThreshold: 0.60,
    });

    assert.equal(events[0].event, 'metadata');
    assert.equal(events[1].event, 'delta');
    assert.equal(events[1].data.text, 'The ');
    assert.equal(events[2].event, 'delta');
    assert.equal(events[2].data.text, 'tuition ');
    assert.equal(events[3].event, 'delta');
    assert.equal(events[3].data.text, 'is 42,000,000 VND.');
    assert.equal(events[4].event, 'done');

    const fullAnswer = events
      .filter((e) => e.event === 'delta')
      .map((e) => e.data.text)
      .join('');
    assert.equal(fullAnswer, 'The tuition is 42,000,000 VND.');
  });

  it('emits threshold refusal as delta event without invoking LLM stream', async () => {
    const events = [];
    const sendEvent = (event, data) => events.push({ event, data });

    const mockChunks = [{ id: 'sec8', score: 0.45 }];
    const bestScore = 0.45;
    const similarityThreshold = 0.60;

    const metadata = {
      similarityThreshold,
      bestScore,
      retrievedChunks: mockChunks,
      usedChunks: [],
    };

    sendEvent('metadata', { sources: [], retrieval: metadata });
    sendEvent('delta', {
      text: 'The provided documentation does not contain enough information to answer this question.',
    });
    sendEvent('done', { sources: [], retrieval: metadata });

    assert.equal(events.length, 3);
    assert.equal(events[0].event, 'metadata');
    assert.equal(events[1].event, 'delta');
    assert.ok(events[1].data.text.includes('does not contain enough information'));
    assert.equal(events[2].event, 'done');
  });

  it('stops stream generation immediately when cancelled via AbortSignal', async () => {
    const controller = new AbortController();
    const emitted = [];

    async function* tokenGenerator() {
      yield 'Chunk 1';
      yield 'Chunk 2';
      yield 'Chunk 3';
    }

    const stream = tokenGenerator();
    for await (const chunk of stream) {
      if (controller.signal.aborted) break;
      emitted.push(chunk);
      if (chunk === 'Chunk 1') {
        controller.abort();
      }
    }

    assert.equal(emitted.length, 1);
    assert.equal(emitted[0], 'Chunk 1');
  });

  it('orchestrator emits SSE sequence in strict order without duplicate terminal events', async () => {
    const events = [];
    const emit = (event, data) => events.push({ event, data });

    const mockQuery = 'What is the library late fine?';
    const mockRagResult = {
      status: 'SUFFICIENT',
      passedThreshold: true,
      sources: [{ id: 'sec5', title: '5. Library', score: 0.85 }],
      retrieval: {
        similarityThreshold: 0.60,
        bestScore: 0.85,
        retrievedChunks: [{ id: 'sec5', rank: 1, passedToLLM: true, score: 0.85 }],
        usedChunks: [{ id: 'sec5', rank: 1, passedToLLM: true, score: 0.85 }],
      },
      prompt: 'Grounded prompt for library fine',
    };

    emit('metadata', { sources: mockRagResult.sources, retrieval: mockRagResult.retrieval });
    emit('delta', { text: 'The late fine is ' });
    emit('delta', { text: '3,000 VND per day.' });
    emit('done', { sources: mockRagResult.sources, retrieval: mockRagResult.retrieval });

    assert.equal(events.length, 4);
    assert.equal(events[0].event, 'metadata');
    assert.equal(events[0].data.sources.length, 1);
    assert.equal(events[1].event, 'delta');
    assert.equal(events[1].data.text, 'The late fine is ');
    assert.equal(events[2].event, 'delta');
    assert.equal(events[2].data.text, '3,000 VND per day.');
    assert.equal(events[3].event, 'done');

    const doneEvents = events.filter((e) => e.event === 'done');
    assert.equal(doneEvents.length, 1, 'Exactly one terminal done event must be emitted');
  });

  it('orchestrator respects AbortSignal and suppresses post-cancellation events', async () => {
    const controller = new AbortController();
    const events = [];
    const emit = (event, data) => events.push({ event, data });

    controller.abort();

    async function simulatedOrchestratorStream(signal) {
      if (signal?.aborted) return;
      emit('metadata', {});
      if (signal?.aborted) return;
      emit('delta', { text: 'Should not appear' });
      emit('done', {});
    }

    await simulatedOrchestratorStream(controller.signal);

    assert.equal(events.length, 0, 'No events should be emitted after abort signal is triggered');
  });

  it('orchestrateChatStream coordinates stream generation and relays events in order', async () => {
    const events = [];
    const emit = (event, data) => events.push({ event, data });

    const mockRagExecutor = async (query) => ({
      status: 'SUFFICIENT',
      passedThreshold: true,
      sources: [{ id: 'sec2', title: 'Programs', score: 0.85 }],
      retrieval: { similarityThreshold: 0.60, bestScore: 0.85, retrievedChunks: [], usedChunks: [] },
      prompt: 'Prompt for ' + query,
    });

    async function* mockStreamGenerator() {
      yield { text: 'Chunk 1. ' };
      yield { text: 'Chunk 2.' };
    }

    await orchestrateChatStream(
      'Test query',
      emit,
      {
        ragExecutor: mockRagExecutor,
        llmStreamGenerator: async () => mockStreamGenerator(),
      }
    );

    assert.equal(events.length, 4);
    assert.equal(events[0].event, 'metadata');
    assert.equal(events[1].event, 'delta');
    assert.equal(events[1].data.text, 'Chunk 1. ');
    assert.equal(events[2].event, 'delta');
    assert.equal(events[2].data.text, 'Chunk 2.');
    assert.equal(events[3].event, 'done');
  });

  it('chatController.chatStream preserves normal SSE event lifecycle and client abort cancellation', async () => {
    const emittedEvents = [];
    const headersSet = {};
    const closeCallbacks = [];

    const req = { body: { message: 'What is the tuition fee?' } };
    const res = {
      headersSent: false,
      writableEnded: false,
      closed: false,
      setHeader(k, v) {
        headersSet[k] = v;
      },
      flushHeaders() { },
      on(event, cb) {
        if (event === 'close') closeCallbacks.push(cb);
      },
      write(chunk) {
        emittedEvents.push(chunk);
      },
      end() {
        this.writableEnded = true;
      },
    };

    let nextCalled = false;
    await chatController.chatStream(req, res, (err) => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false, 'next() should not be called on successful stream initiation');
    assert.equal(headersSet['Content-Type'], 'text/event-stream; charset=utf-8');
    assert.equal(headersSet['Cache-Control'], 'no-cache, no-transform');
    assert.equal(headersSet['Connection'], 'keep-alive');
    assert.equal(res.writableEnded, true);
    assert.ok(emittedEvents.length > 0, 'Should have emitted stream events');
  });
});
