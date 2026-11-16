import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateToolTurnStream } from '../../server/src/shared/integrations/ai/providers/geminiProvider.js';
import { createStreamingTextFilter } from '../../server/src/features/chatAssistant/assistantResponse.js';
import { orchestrateUnifiedChatStream } from '../../server/src/features/chatAssistant/assistantOrchestrator.js';
import { SERVER_MESSAGES } from '../../server/src/constants/index.js';

const USER = { id: 'user-p3-t04', token: 'jwt-p3-t04' };

function basePersistenceOpts(overrides = {}) {
  return {
    enablePersistence: true,
    findOwnedConversation: async () => ({ id: 'conv-1', user_id: USER.id }),
    listConversationMessages: async () => [],
    beginStreamTurn: async (_u, args) => ({
      conversation_id: args.conversationId,
      user_message_id: args.userMessageId,
      assistant_message_id: args.assistantMessageId,
      status: 'streaming',
      is_duplicate: false,
    }),
    updateStreamingCheckpoint: async (_u, p) => ({ id: p.messageId, status: 'streaming' }),
    finalizeStreamMessage: async (_u, p) => ({ id: p.messageId, status: p.status }),
    usageRecorder: () => {},
    ...overrides,
  };
}

describe('P3-T04 Streaming Lifecycle & Response Integrity Suite', () => {
  describe('1. Multi-Chunk & Multi-Part Accumulation', () => {
    it('accumulates multiple text chunks, multi-part candidate chunks, and multi-chunk rawAssistantContent in order', async () => {
      const mockAi = {
        models: {
          generateContentStream: async () => (async function* () {
            yield {}; // empty chunk
            yield {
              candidates: [{
                content: {
                  role: 'model',
                  parts: [{ text: 'Part A ' }, { text: 'Part B.' }],
                },
              }],
            };
            yield {
              candidates: [{
                content: {
                  role: 'model',
                  parts: [{ functionCall: { id: 'fc-1', name: 'search_knowledge_base', args: { query: 'receipts' } } }],
                },
                finishReason: 'STOP',
              }],
              usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
            };
          })(),
        },
      };

      const stream = await generateToolTurnStream({ prompt: 'Hi', ai: mockAi });
      const items = [];
      for await (const item of stream) items.push(item);

      const textDeltas = items.filter((i) => i.type === 'text').map((i) => i.text);
      assert.deepEqual(textDeltas, ['Part A Part B.']);

      const complete = items.find((i) => i.type === 'turn_complete');
      assert.equal(complete.text, 'Part A Part B.');
      assert.equal(complete.functionCalls.length, 1);
      assert.equal(complete.functionCalls[0].name, 'search_knowledge_base');
      assert.equal(complete.rawAssistantContent.role, 'model');
      assert.equal(complete.rawAssistantContent.parts.length, 3);
      assert.equal(complete.rawAssistantContent.parts[0].text, 'Part A ');
      assert.equal(complete.rawAssistantContent.parts[2].functionCall.name, 'search_knowledge_base');
    });
  });

  describe('2. Streaming Sanitization & Split Citation Handling', () => {
    it('buffers split citations character-by-character, keeps valid [S1], and strips invalid [S99]', () => {
      const sourcesMap = new Map([
        ['S1', { sourceId: 'S1', id: 'doc_1', title: 'Guide', source: 'guide.md' }],
      ]);
      const filter = createStreamingTextFilter({ sourcesMap });
      const input = 'Para 1 [S1].\n\n- Item [S99]\n- Item 2';

      const deltas = [];
      for (const ch of input) {
        const out = filter.push(ch);
        if (out) {
          assert.ok(!out.includes('[S99]'), 'Invalid citation must never appear in emitted delta');
          deltas.push(out);
        }
      }
      const tail = filter.flush();
      if (tail) deltas.push(tail);

      const joined = deltas.join('').trim();
      assert.equal(joined, 'Para 1 [S1].\n\n- Item\n- Item 2');
    });

    it('suppresses leaked system prompt signatures split across chunks', () => {
      const filter = createStreamingTextFilter({ sourcesMap: new Map() });
      const d1 = filter.push('You are the SpendWise ');
      const d2 = filter.push('Assistant and these are Strict rules:');
      const tail = filter.flush();
      const combined = `${d1}${d2}${tail}`;
      assert.equal(filter.hasLeaked(), true);
      assert.ok(!combined.includes('Strict rules:'));
    });

    it('streams RAG answer with split [S99] stripped consistently in deltas, done.answer, and persisted content', async () => {
      const events = [];
      const persisted = [];

      await orchestrateUnifiedChatStream(
        USER,
        'What does SpendWise say about receipt processing?',
        (type, data) => events.push({ type, data }),
        {
          ...basePersistenceOpts({
            finalizeStreamMessage: async (_u, p) => {
              persisted.push(p);
              return { id: p.messageId, status: p.status };
            },
          }),
          retrieverFn: async () => [
            { id: 'sec5', title: '5. Receipts', sectionTitle: 'Receipts', source: 'guide.md', score: 0.9, content: '5 MB max.' },
          ],
          toolTurnStreamRunner: async ({ prompt }) => {
            const hasToolResp = prompt.some((m) => m.parts?.some((p) => p.functionResponse));
            if (!hasToolResp) {
              return (async function* () {
                yield {
                  type: 'turn_complete',
                  text: '',
                  functionCalls: [{ id: 'c1', name: 'search_knowledge_base', args: { query: 'receipt processing' } }],
                };
              })();
            }
            return (async function* () {
              for (const part of ['Receipts allow 5 MB [S', '1] and ', 'not [S', '99', '].\n\n- JPG\n- PNG']) {
                yield { type: 'text', text: part };
              }
              yield {
                type: 'turn_complete',
                text: 'Receipts allow 5 MB [S1] and not [S99].\n\n- JPG\n- PNG',
                functionCalls: [],
              };
            })();
          },
        }
      );

      const deltas = events.filter((e) => e.type === 'delta').map((e) => e.data.text);
      for (const d of deltas) {
        assert.ok(!d.includes('[S99]'));
      }
      const done = events.find((e) => e.type === 'done');
      assert.ok(done);
      assert.equal(done.data.answer, 'Receipts allow 5 MB [S1] and not .\n\n- JPG\n- PNG');
      assert.equal(done.data.sources.length, 1);
      assert.equal(done.data.sources[0].sourceId, 'S1');
      assert.equal(persisted[0].status, 'completed');
      assert.equal(persisted[0].content, done.data.answer);
      assert.equal(events.filter((e) => e.type === 'done' || e.type === 'error').length, 1);
    });

    it('never restores invalid citations when stripping leaves empty response', async () => {
      const events = [];
      const persisted = [];
      await orchestrateUnifiedChatStream(
        USER,
        'How much did I spend?',
        (type, data) => events.push({ type, data }),
        {
          ...basePersistenceOpts({
            finalizeStreamMessage: async (_u, p) => {
              persisted.push(p);
              return { id: p.messageId, status: p.status };
            },
          }),
          toolTurnStreamRunner: async () => (async function* () {
            yield { type: 'text', text: '[S99]' };
            yield { type: 'turn_complete', text: '[S99]', functionCalls: [] };
          })(),
        }
      );

      const done = events.find((e) => e.type === 'done');
      assert.ok(done);
      assert.equal(done.data.answer, SERVER_MESSAGES.ERRORS.AI_RESPONSE_EMPTY);
      assert.ok(!done.data.answer.includes('[S99]'));
      assert.equal(persisted[0].content, SERVER_MESSAGES.ERRORS.AI_RESPONSE_EMPTY);
    });
  });

  describe('3. SSE Lifecycle, Terminal Guards & Persistence Consistency', () => {
    it('emits at most one terminal event and never emits deltas/sources after error or finalization failure', async () => {
      const events = [];
      await orchestrateUnifiedChatStream(
        USER,
        'How much did I spend?',
        (type, data) => events.push({ type, data }),
        {
          ...basePersistenceOpts({
            finalizeStreamMessage: async (_u, p) => {
              if (p.status === 'completed') return null; // Simulate conflict / already finalized
              return { id: p.messageId, status: p.status };
            },
          }),
          toolTurnStreamRunner: async () => (async function* () {
            yield { type: 'text', text: 'Valid answer' };
            yield { type: 'turn_complete', text: 'Valid answer', functionCalls: [] };
          })(),
        }
      );

      const terminals = events.filter((e) => e.type === 'done' || e.type === 'error');
      assert.equal(terminals.length, 1);
      assert.equal(terminals[0].type, 'error');
    });
  });
});
