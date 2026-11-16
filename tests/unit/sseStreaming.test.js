import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateToolTurnStream } from '../../server/src/shared/integrations/ai/providers/geminiProvider.js';
import {
  loadServerAuthoritativeHistory,
  registerStreamAttempt,
} from '../../server/src/features/chatAssistant/assistantPersistence.js';
import { finalizeStreamMessage } from '../../server/src/features/chatHistory/chatHistory.repository.js';
import { setChatHistoryClientFactoryForTests } from '../../server/src/features/chatHistory/chatHistory.repository.js';
import { createSSEParser, parseSSEStream } from '../../client/src/features/chat/sseParser.js';
import { createChatController } from '../../client/src/features/chat/chatController.js';
import { orchestrateUnifiedChatStream } from '../../server/src/features/chatAssistant/assistantOrchestrator.js';

const USER = { id: 'user-1', token: 'token-1' };

describe('P2-T13 Provider Streaming, Persistence, SSE Parser & Controller Suite', () => {
  describe('1. Gemini Provider Streaming (6.1)', () => {
    it('streams incremental text chunks, skips empty chunks, captures usageMetadata and functionCalls', async () => {
      const mockAi = {
        models: {
          generateContentStream: async () => (async function* () {
            yield { text: '' };
            yield { text: 'Hello ' };
            yield { text: 'world', usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 2, totalTokenCount: 12 } };
            yield { functionCalls: [{ id: 'fc-1', name: 'search_knowledge_base', args: { query: 'receipts' } }] };
          })(),
        },
      };

      const stream = await generateToolTurnStream({ prompt: 'Hi', ai: mockAi });
      const events = [];
      for await (const item of stream) events.push(item);

      assert.deepEqual(events.filter((e) => e.type === 'text').map((e) => e.text), ['Hello ', 'world']);
      const complete = events.find((e) => e.type === 'turn_complete');
      assert.equal(complete.text, 'Hello world');
      assert.equal(complete.tokenUsage.totalTokens, 12);
      assert.equal(complete.functionCalls[0].id, 'fc-1');
    });

    it('propagates AbortError on client cancellation and provider errors', async () => {
      const ac = new AbortController();
      const mockAi = {
        models: {
          generateContentStream: async () => (async function* () {
            yield { text: 'Part 1 ' };
            ac.abort();
            yield { text: 'Part 2' };
          })(),
        },
      };

      const stream = await generateToolTurnStream({ prompt: 'Hi', signal: ac.signal, ai: mockAi });
      const received = [];
      await assert.rejects(async () => {
        for await (const ev of stream) received.push(ev);
      }, /aborted/i);
      assert.equal(received.length, 1);

      const errAi = {
        models: {
          generateContentStream: async () => { throw new Error('Gemini 500'); },
        },
      };
      await assert.rejects(() => generateToolTurnStream({ prompt: 'Hi', ai: errAi, maxRetries: 0 }), /Gemini 500/);
    });
  });

  describe('2. Server-Authoritative Persistence & Conditional Lifecycle (6.2)', () => {
    it('loads only user and completed assistant messages from DB', async () => {
      const history = await loadServerAuthoritativeHistory(USER, 'conv-1', {
        findOwnedConversation: async () => ({ id: 'conv-1', user_id: USER.id }),
        listConversationMessages: async () => [
          { id: 'm1', role: 'user', content: 'Question 1', status: 'completed' },
          { id: 'm2', role: 'assistant', content: 'Answer 1', status: 'completed' },
          { id: 'm3', role: 'assistant', content: 'Partial...', status: 'aborted' },
          { id: 'm4', role: 'assistant', content: '', status: 'failed' },
          { id: 'm5', role: 'assistant', content: 'Still running', status: 'streaming' },
        ],
      });

      assert.deepEqual(history, [
        { role: 'user', text: 'Question 1' },
        { role: 'assistant', text: 'Answer 1' },
      ]);
    });

    it('registers stream attempt atomically via RPC and enforces conditional streaming->terminal update', async (t) => {
      const reg = await registerStreamAttempt(
        USER,
        { conversationId: 'conv-1', userMessageId: 'u-1', userContent: 'Hi', assistantMessageId: 'a-1', requestId: 'req-1' },
        {
          beginStreamTurn: async (_u, args) => ({
            conversation_id: args.conversationId,
            user_message_id: args.userMessageId,
            assistant_message_id: args.assistantMessageId,
            status: 'streaming',
            is_duplicate: false,
          }),
        }
      );
      assert.equal(reg.is_duplicate, false);

      const eqCalls = [];
      setChatHistoryClientFactoryForTests(() => ({
        from: () => ({
          update: () => ({
            eq(col, val) { eqCalls.push([col, val]); return this; },
            select: () => ({
              maybeSingle: async () => ({ data: null, error: null }), // Simulates already-aborted row
            }),
          }),
        }),
      }));
      t.after(() => setChatHistoryClientFactoryForTests(null));

      const res = await finalizeStreamMessage(USER, {
        messageId: 'a-1',
        requestId: 'req-1',
        status: 'completed',
        content: 'Delayed completion',
      });
      assert.equal(res, null);
      assert.ok(eqCalls.some(([c, v]) => c === 'status' && v === 'streaming'));
      assert.ok(eqCalls.some(([c, v]) => c === 'request_id' && v === 'req-1'));
    });
  });

  describe('3. Frontend SSE Parser (6.4)', () => {
    it('handles multi-event chunks, split events, CRLF, UTF-8 multibyte splits, and unknown events', async () => {
      const events = [];
      const parser = createSSEParser((event, data) => events.push({ event, data }));

      // Split "₫" (3 UTF-8 bytes) across two chunks + CRLF + unknown event
      const full = new TextEncoder().encode(
        'event: meta\r\ndata: {"requestId":"r1"}\r\n\r\n' +
        'event: unknown_evt\ndata: {"ignored":true}\n\n' +
        'event: delta\ndata: {"text":"50,000 ₫"}\n\n' +
        'event: done\ndata: {"status":"completed"}\n\n'
      );
      const splitPoint = new TextDecoder().decode(full).indexOf('₫');
      const byteSplit = new TextEncoder().encode(new TextDecoder().decode(full).slice(0, splitPoint)).length + 1;

      parser.push(full.slice(0, byteSplit));
      parser.push(full.slice(byteSplit));
      parser.finish();

      assert.deepEqual(events.map((e) => e.event), ['meta', 'delta', 'done']);
      assert.equal(events[1].data.text, '50,000 ₫');
    });

    it('rejects malformed JSON, trailing incomplete frames, and unexpected EOF', async () => {
      const p1 = createSSEParser(() => {});
      assert.throws(() => p1.push('event: delta\ndata: {bad json\n\n'), /Malformed SSE JSON/);

      const p2 = createSSEParser(() => {});
      p2.push('event: delta\ndata: {"text":"hi"}');
      assert.throws(() => p2.finish(), /incomplete SSE frame/);

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('event: meta\ndata: {"requestId":"r1"}\n\n'));
          controller.close();
        },
      });
      await assert.rejects(() => parseSSEStream(stream, { onEvent: () => {} }), /unexpectedly before completion/);
    });
  });

  describe('4. Frontend Streaming Controller, Stop & Retry (6.5)', () => {
    it('streams deltas incrementally, supports AbortController Stop, and retries without duplicating user message', async () => {
      const states = [];
      const seenRequests = [];
      let shouldAbort = true;

      const controller = createChatController({
        storage: null,
        historyApi: {
          listConversations: async () => ({ conversations: [] }),
          getConversation: async () => ({ messages: [] }),
        },
        onStateChange: (s) => states.push(s),
        onSendMessageStream: async (text, _history, { requestId, userMessageId, retryOfMessageId, signal, onEvent }) => {
          seenRequests.push({ text, requestId, userMessageId, retryOfMessageId });
          await onEvent('meta', { requestId, userMessageId, assistantMessageId: `ast-${seenRequests.length}` });
          await onEvent('delta', { text: 'Partial ' });

          if (shouldAbort) {
            shouldAbort = false;
            controller.stopStreaming();
            const err = new Error('Aborted');
            err.name = 'AbortError';
            throw err;
          }

          await onEvent('delta', { text: 'complete.' });
          await onEvent('sources', { sources: [{ sourceId: 'S1', title: 'Policy' }] });
          await onEvent('done', { status: 'completed', answer: 'Partial complete.', sources: [{ sourceId: 'S1', title: 'Policy' }] });
        },
      });

      await controller.loadUserConversations('u1');
      await controller.sendMessage('What is the policy?');

      let msgs = controller.getState().conversations[0].messages;
      assert.equal(msgs.filter((m) => m.role === 'user').length, 1);
      assert.equal(msgs[1].status, 'aborted');
      assert.equal(msgs[1].text, 'Partial ');

      await controller.retryMessage(msgs[1].id);
      msgs = controller.getState().conversations[0].messages;
      assert.equal(msgs.filter((m) => m.role === 'user').length, 1);
      assert.equal(seenRequests[0].userMessageId, seenRequests[1].userMessageId);
      assert.notEqual(seenRequests[0].requestId, seenRequests[1].requestId);
      assert.equal(msgs[2].status, 'completed');
      assert.equal(msgs[2].text, 'Partial complete.');
      assert.equal(msgs[2].sources[0].title, 'Policy');
    });
  });

  describe('5. Partial Persistence, Checkpoint, Recovery & Streaming Tool Safety', () => {
    const basePersistenceOpts = () => ({
      enablePersistence: true,
      findOwnedConversation: async () => ({ id: 'c1', user_id: USER.id }),
      listConversationMessages: async () => [],
      beginStreamTurn: async (_u, args) => ({
        conversation_id: args.conversationId,
        user_message_id: args.userMessageId,
        assistant_message_id: args.assistantMessageId,
        status: 'streaming',
        is_duplicate: false,
      }),
    });

    it('writes checkpoints at 400-char intervals and fails loudly if checkpoint throws', async () => {
      const checkpoints = [];
      const finalized = [];
      const events = [];
      const longChunk = 'A'.repeat(420);

      await orchestrateUnifiedChatStream(USER, 'How much did I spend?', (e, d) => events.push({ e, d }), {
        ...basePersistenceOpts(),
        updateStreamingCheckpoint: async (_u, p) => { checkpoints.push(p.content); return { id: p.messageId }; },
        finalizeStreamMessage: async (_u, p) => { finalized.push(p); return { id: p.messageId, status: p.status }; },
        toolTurnStreamRunner: async () => (async function* () {
          yield { type: 'text', text: longChunk };
          yield { type: 'turn_complete', text: longChunk, functionCalls: [] };
        })(),
      });

      assert.equal(checkpoints.length, 1);
      assert.equal(finalized[0].status, 'completed');
      assert.ok(events.some((x) => x.e === 'done'));

      // Checkpoint failure must fail the attempt and never emit done
      const errEvents = [];
      const errFinalized = [];
      await orchestrateUnifiedChatStream(USER, 'How much did I spend?', (e, d) => errEvents.push({ e, d }), {
        ...basePersistenceOpts(),
        updateStreamingCheckpoint: async () => { throw new Error('Checkpoint DB write failed'); },
        finalizeStreamMessage: async (_u, p) => { errFinalized.push(p); return { id: p.messageId }; },
        toolTurnStreamRunner: async () => (async function* () {
          yield { type: 'text', text: longChunk };
          yield { type: 'turn_complete', text: longChunk, functionCalls: [] };
        })(),
      });
      assert.equal(errFinalized[0].status, 'failed');
      assert.equal(errEvents.some((x) => x.e === 'done'), false);
      assert.ok(errEvents.some((x) => x.e === 'error'));
    });

    it('handles abort between checkpoints, provider failure after partial output, finalization failure, and empty output', async () => {
      // 1. Abort between checkpoints retains partial text in aborted status
      const ac = new AbortController();
      const abortedFinal = [];
      await orchestrateUnifiedChatStream(USER, 'How much did I spend?', () => {}, {
        ...basePersistenceOpts(),
        signal: ac.signal,
        updateStreamingCheckpoint: async () => ({ id: 'a1' }),
        finalizeStreamMessage: async (_u, p) => { abortedFinal.push(p); return { id: p.messageId }; },
        toolTurnStreamRunner: async () => (async function* () {
          yield { type: 'text', text: 'Partial text ' };
          ac.abort();
          yield { type: 'text', text: 'Should not persist' };
        })(),
      });
      assert.equal(abortedFinal[0].status, 'aborted');
      assert.equal(abortedFinal[0].content, 'Partial text ');

      // 2. Finalization failure after generation succeeds emits error, never done
      const finErrEvents = [];
      const finErrCalls = [];
      await orchestrateUnifiedChatStream(USER, 'How much did I spend?', (e, d) => finErrEvents.push({ e, d }), {
        ...basePersistenceOpts(),
        updateStreamingCheckpoint: async () => ({ id: 'a1' }),
        finalizeStreamMessage: async (_u, p) => {
          finErrCalls.push(p.status);
          if (p.status === 'completed') return null; // Simulate conditional update conflict
          return { id: p.messageId };
        },
        toolTurnStreamRunner: async () => (async function* () {
          yield { type: 'text', text: 'Answer' };
          yield { type: 'turn_complete', text: 'Answer', functionCalls: [] };
        })(),
      });
      assert.deepEqual(finErrCalls, ['completed', 'failed']);
      assert.equal(finErrEvents.some((x) => x.e === 'done'), false);
      assert.ok(finErrEvents.some((x) => x.e === 'error'));

      // 3. Empty output falls back to non-empty validated text
      const emptyFinal = [];
      await orchestrateUnifiedChatStream(USER, 'How much did I spend?', () => {}, {
        ...basePersistenceOpts(),
        finalizeStreamMessage: async (_u, p) => { emptyFinal.push(p); return { id: p.messageId }; },
        toolTurnStreamRunner: async () => (async function* () {
          yield { type: 'turn_complete', text: '', functionCalls: [] };
        })(),
      });
      assert.equal(emptyFinal[0].status, 'completed');
      assert.ok(emptyFinal[0].content.trim().length > 0);
    });

    it('prevents subsequent tool execution after abort and never emits functionCalls as delta text', async () => {
      const ac = new AbortController();
      const executed = [];
      const events = [];
      await orchestrateUnifiedChatStream(USER, 'How much did I spend and search Highlands?', (e, d) => events.push({ e, d }), {
        signal: ac.signal,
        getSpendingSummary: async () => {
          executed.push('get_spending_summary');
          ac.abort();
          return { totalExpense: 50000 };
        },
        listTransactions: async () => {
          executed.push('search_transactions');
          return { items: [], total: 0 };
        },
        toolTurnStreamRunner: async () => (async function* () {
          yield {
            type: 'turn_complete',
            text: '',
            functionCalls: [
              { id: 'c1', name: 'get_spending_summary', args: { from: '2026-11-01', to: '2026-11-17' } },
              { id: 'c2', name: 'search_transactions', args: { merchant: 'Highlands' } },
            ],
          };
        })(),
      });

      assert.deepEqual(executed, ['get_spending_summary']);
      assert.equal(events.some((x) => x.e === 'delta'), false);
      assert.equal(events.some((x) => x.e === 'done'), false);
    });
  });
});
