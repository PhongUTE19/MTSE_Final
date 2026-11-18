import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import http from 'node:http';
import { orderConversationMessages } from '../../server/src/features/chatHistory/chatHistory.service.js';
import { createChatController } from '../../client/src/features/chat/chatController.js';
import { isUserScrolledUp } from '../../client/src/shared/hooks/useChatScroll.js';
import { parseSSEStream } from '../../client/src/features/chat/sseParser.js';
import { chatStream } from '../../server/src/features/chatAssistant/chatAssistant.controller.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readClientFile = (relPath) => fs.readFileSync(path.join(ROOT, 'client', 'src', relPath), 'utf8');

describe('Chatbot Conversation UI & Message Lifecycle Suite', () => {
  describe('1. Receipt Attachment as User Message Bubble', () => {
    it('creates a user-side receipt message with attachment metadata before calling receipt upload', () => {
      const expenseAssistantSource = readClientFile('features/expenseAssistant/ExpenseAssistant.jsx');
      const chatMessageItemSource = readClientFile('features/chat/ChatMessageItem.jsx');

      // User message is appended when processing starts (before upload completes)
      assert.match(expenseAssistantSource, /appendMessage\('user'/);
      assert.match(expenseAssistantSource, /toolName:\s*'receipt_attachment'/);
      assert.match(expenseAssistantSource, /attachmentType:\s*'receipt'/);
      assert.match(expenseAssistantSource, /previewUrl:\s*processing\.previewUrl/);

      // ChatMessageItem renders receipt attachment preview inside the user bubble
      assert.match(chatMessageItemSource, /receiptAttachment\.previewUrl/);
      assert.match(chatMessageItemSource, /receiptAttachment\.filename/);
    });
  });

  describe('2. Deterministic Message Ordering Across Refresh & Streaming', () => {
    it('places user message before its reply_to assistant message even when created_at is identical and assistant id sorts earlier', () => {
      const sameTimestamp = '2026-11-18T12:00:00.000Z';
      const rowsFromDb = [
        {
          id: '00000000-0000-4000-8000-000000000001',
          role: 'assistant',
          content: 'Working on it...',
          status: 'streaming',
          reply_to: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
          created_at: sameTimestamp,
        },
        {
          id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
          role: 'user',
          content: 'How much did I spend today?',
          status: 'completed',
          reply_to: null,
          created_at: sameTimestamp,
        },
        {
          id: '11111111-1111-4111-8111-111111111111',
          role: 'assistant',
          content: 'You spent 150,000 VND.',
          status: 'completed',
          reply_to: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          created_at: '2026-11-18T12:01:00.000Z',
        },
        {
          id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          role: 'user',
          content: 'What about yesterday?',
          status: 'completed',
          reply_to: null,
          created_at: '2026-11-18T12:01:00.000Z',
        },
      ];

      const ordered = orderConversationMessages(rowsFromDb);
      assert.deepEqual(
        ordered.map((r) => [r.role, r.content]),
        [
          ['user', 'How much did I spend today?'],
          ['assistant', 'Working on it...'],
          ['user', 'What about yesterday?'],
          ['assistant', 'You spent 150,000 VND.'],
        ]
      );
    });

    it('restores server-ordered messages without duplicating or reordering on refresh', async () => {
      const convId = 'conv-order-1';
      const controller = createChatController({
        historyApi: {
          listConversations: async () => ({
            conversations: [{ id: convId, title: 'Test', updatedAt: '2026-11-18T12:01:00.000Z' }],
          }),
          getConversation: async () => ({
            conversation: { id: convId, title: 'Test', updatedAt: '2026-11-18T12:01:00.000Z' },
            messages: [
              { id: 'u1', role: 'user', text: 'First question', status: 'completed' },
              { id: 'a1', role: 'assistant', text: 'Partial...', status: 'streaming', replyTo: 'u1' },
            ],
          }),
        },
      });

      await controller.loadUserConversations('user-1');
      const active = controller.getState().conversations.find((c) => c.id === convId);
      assert.equal(active.messages.length, 2);
      assert.deepEqual(
        active.messages.map((m) => m.role),
        ['user', 'assistant']
      );
    });
  });

  describe('3. Markdown Rendering, Streaming & Safe Sanitization', () => {
    it('supports bold, italic, headings, ordered/unordered lists, code, links, inverse mode, and safe sanitization without dangerouslySetInnerHTML', () => {
      const formattedSource = readClientFile('features/chat/FormattedMessageText.jsx');
      const messageItemSource = readClientFile('features/chat/ChatMessageItem.jsx');

      // User and Assistant messages both use FormattedMessageText
      assert.match(messageItemSource, /<FormattedMessageText text=\{item\.text\} isStreaming=\{false\} animate=\{false\} inverse \/>/);
      assert.match(messageItemSource, /isStreaming=\{Boolean\(item\?\.isStreaming\)\}/);

      // Markdown constructs supported
      assert.match(formattedSource, /<strong/);
      assert.match(formattedSource, /<em/);
      assert.match(formattedSource, /<ul/);
      assert.match(formattedSource, /<ol/);
      assert.match(formattedSource, /<pre/);
      assert.match(formattedSource, /<code/);
      assert.match(formattedSource, /<a\b/);
      assert.match(formattedSource, /sanitizeMarkdownHref/);

      // Renders formatted content even during streaming/reveal
      assert.match(formattedSource, /\{renderFormattedContent\(contentToRender, inverse\)\}/);

      // Never uses dangerouslySetInnerHTML and blocks javascript:/data: URLs
      assert.doesNotMatch(formattedSource, /dangerouslySetInnerHTML/);
      assert.match(formattedSource, /parsed\.protocol === 'http:' \|\| parsed\.protocol === 'https:' \|\| parsed\.protocol === 'mailto:'/);
    });
  });

  describe('4. Conversation Suggestions Visibility Before First User Message', () => {
    it('shows intro and suggestions only when conversation has loaded and contains zero user messages', () => {
      const chatConvSource = readClientFile('features/chat/ChatConversation.jsx');
      assert.match(chatConvSource, /export function shouldShowConversationIntro\(conversation\)/);
      assert.match(chatConvSource, /conversation\.persisted && conversation\.messagesLoaded === false/);
      assert.match(chatConvSource, /!messages\.some\(\(msg\) => msg\?\.role === 'user'\)/);
      assert.match(chatConvSource, /\{shouldShowConversationIntro\(active\) && \(/);
    });

    it('hides intro immediately when a user message is sent or when restoring an existing conversation', async () => {
      const convId = 'conv-intro-1';
      let resolveMessages;
      const messagesPromise = new Promise((resolve) => {
        resolveMessages = resolve;
      });

      const controller = createChatController({
        historyApi: {
          listConversations: async () => ({
            conversations: [{ id: convId, title: 'Existing', updatedAt: '2026-11-18T12:00:00.000Z' }],
          }),
          getConversation: () => messagesPromise,
        },
      });

      const loadPromise = controller.loadUserConversations('user-1');
      // Wait a microtask so listConversations settles and messagesLoaded is still false
      await Promise.resolve();
      await Promise.resolve();
      const loadingConv = controller.getState().conversations[0];
      assert.equal(loadingConv.persisted, true);
      assert.equal(loadingConv.messagesLoaded, false);

      resolveMessages({
        conversation: { id: convId, title: 'Existing', updatedAt: '2026-11-18T12:00:00.000Z' },
        messages: [{ id: 'u1', role: 'user', text: 'Hello' }],
      });
      await loadPromise;

      const loadedConv = controller.getState().conversations[0];
      assert.equal(loadedConv.messagesLoaded, true);
      assert.equal(loadedConv.messages.some((m) => m.role === 'user'), true);

      // Starting a genuinely new conversation creates an empty unpersisted conversation
      const fresh = controller.newConversation();
      assert.equal(fresh.persisted, false);
      assert.equal(fresh.messages.length, 0);
    });
  });

  describe('5. Instant User Messages, Composer Clearing, Scrolling & Drawer Layout', () => {
    it('disables typewriter reveal for user messages and non-animated text', () => {
      const revealSource = readClientFile('shared/hooks/useTextReveal.js');
      const formattedSource = readClientFile('features/chat/FormattedMessageText.jsx');
      const messageItemSource = readClientFile('features/chat/ChatMessageItem.jsx');

      assert.match(revealSource, /if \(!isStreaming && !animate\)/);
      assert.match(formattedSource, /const instant = !animate \|\| isStreaming \|\| streamed;/);
      assert.match(messageItemSource, /<FormattedMessageText text=\{item\.text\} isStreaming=\{false\} animate=\{false\} inverse \/>/);
    });

    it('clears composer input immediately on submission and marks post-acceptance errors in chatController', () => {
      const composerSource = readClientFile('features/chat/ChatComposer.jsx');
      const controllerSource = readClientFile('features/chat/chatController.js');

      const clearIdx = composerSource.indexOf("setMessage('')");
      const sendIdx = composerSource.indexOf('onSendMessage?.(trimmed)');
      assert.ok(clearIdx !== -1 && sendIdx !== -1 && clearIdx < sendIdx);
      assert.match(composerSource, /if \(!err\?\.messageAccepted\)/);
      assert.match(controllerSource, /err\.messageAccepted = true/);
      assert.match(controllerSource, /requestError\.messageAccepted = true/);
    });

    it('enforces scrollable height chain, non-intrusive auto-scroll, wide tool container, and consistent drawer spacing', () => {
      const chatbotSource = readClientFile('features/chat/Chatbot.jsx');
      const convSource = readClientFile('features/chat/ChatConversation.jsx');
      const messageItemSource = readClientFile('features/chat/ChatMessageItem.jsx');
      const composerSource = readClientFile('features/chat/ChatComposer.jsx');
      const scrollSource = readClientFile('shared/hooks/useChatScroll.js');

      assert.match(chatbotSource, /h-dvh/);
      assert.match(chatbotSource, /px-4 py-3 border-b border-border/);
      assert.match(convSource, /flex-1 min-h-0 overflow-y-auto overflow-x-hidden/);
      assert.match(convSource, /p-4 pb-5/);
      assert.match(messageItemSource, /'assistant-wide'/);
      assert.match(composerSource, /p-3 px-4/);
      assert.match(scrollSource, /requestAnimationFrame/);

      // Auto-scroll respects manual upward scrolling
      assert.equal(isUserScrolledUp({ scrollHeight: 1000, scrollTop: 500, clientHeight: 400 }), true);
      assert.equal(isUserScrolledUp({ scrollHeight: 1000, scrollTop: 580, clientHeight: 400 }), false);
    });
  });

  describe('6. Context Menu, Per-Conversation Isolation, Reconciliation & Real Incremental SSE Timing', () => {
    it('removes X delete button from ChatHistoryItem and implements reusable ContextMenu with Rename & Delete', () => {
      const itemSource = readClientFile('features/chat/ChatHistoryItem.jsx');
      const tabSource = readClientFile('features/chat/ChatHistoryTab.jsx');
      const menuSource = readClientFile('composites/overlays/ContextMenu.jsx');

      assert.doesNotMatch(itemSource, />\s*x\s*</);
      assert.match(itemSource, /onContextMenu/);
      assert.match(itemSource, /isRenaming/);
      assert.match(tabSource, /<ContextMenu/);
      assert.match(tabSource, /label:\s*'Rename'/);
      assert.match(tabSource, /label:\s*'Delete'/);

      assert.match(menuSource, /role="menu"/);
      assert.match(menuSource, /role="menuitem"/);
      assert.match(menuSource, /Escape/);
      assert.match(menuSource, /mousedown/);
      assert.match(menuSource, /VIEWPORT_MARGIN_PX/);
    });

    it('isolates generation state per conversation, supports concurrent streams, and stops only the intended conversation', async () => {
      const streams = new Map();
      const controller = createChatController({
        onSendMessageStream: (text, _history, { conversationId, signal, onEvent }) =>
          new Promise((resolve, reject) => {
            streams.set(conversationId, { onEvent, resolve, reject, signal });
            signal?.addEventListener('abort', () => {
              const err = new Error('Aborted');
              err.name = 'AbortError';
              reject(err);
            });
          }),
      });

      await controller.loadUserConversations(null);
      const convA = controller.newConversation();
      const sendAPromise = controller.sendMessage('Question in A');

      // Conversation A is busy/streaming
      assert.equal(controller.getState().activeId, convA.id);
      assert.equal(controller.getState().busy, true);
      assert.equal(controller.getState().streaming, true);

      // Create & switch to Conversation B: must be idle & usable while A streams
      const convB = controller.newConversation();
      assert.equal(controller.getState().activeId, convB.id);
      assert.equal(controller.getState().busy, false);
      assert.equal(controller.getState().streaming, false);

      // Emit delta in A while B is active -> A updates without affecting B
      await streams.get(convA.id).onEvent('delta', { text: 'Answer A ' });
      let stateA = controller.getState().conversations.find((c) => c.id === convA.id);
      assert.equal(stateA.messages[1].text, 'Answer A ');
      assert.equal(controller.getState().busy, false);

      // Start streaming in B too, then stop only B
      const sendBPromise = controller.sendMessage('Question in B');
      assert.equal(controller.getState().busy, true);
      controller.stopStreaming();
      await sendBPromise;
      assert.equal(controller.getState().busy, false);

      // Switch back to A -> A is still streaming!
      await controller.selectConversation(convA.id);
      assert.equal(controller.getState().busy, true);
      assert.equal(controller.getState().streaming, true);

      // Duplicate done or post-done delta does not duplicate content in A
      await streams.get(convA.id).onEvent('done', { answer: 'Answer A complete.' });
      await streams.get(convA.id).onEvent('delta', { text: 'SHOULD_BE_IGNORED' });
      await streams.get(convA.id).onEvent('done', { answer: 'DUPLICATE_DONE' });
      streams.get(convA.id).resolve();
      await sendAPromise;

      stateA = controller.getState().conversations.find((c) => c.id === convA.id);
      assert.equal(stateA.messages.length, 2);
      assert.equal(stateA.messages[1].text, 'Answer A complete.');
      assert.equal(controller.getState().busy, false);
    });

    it('renames conversation in-place preserving ID and calls updateConversation API', async () => {
      const updatedCalls = [];
      const controller = createChatController({
        historyApi: {
          listConversations: async () => ({
            conversations: [{ id: 'conv-r1', title: 'Old Title', updatedAt: '2026-11-18T12:00:00.000Z' }],
          }),
          getConversation: async () => ({
            conversation: { id: 'conv-r1', title: 'Old Title' },
            messages: [{ id: 'u1', role: 'user', text: 'Hello' }],
          }),
          updateConversation: async (id, body) => {
            updatedCalls.push({ id, body });
            return { conversation: { id, title: body.title } };
          },
        },
      });

      await controller.loadUserConversations('user-1');
      await controller.renameConversation('conv-r1', 'Monthly Budget');
      assert.deepEqual(updatedCalls, [{ id: 'conv-r1', body: { title: 'Monthly Budget' } }]);
      assert.equal(controller.getState().conversations[0].title, 'Monthly Budget');
      assert.equal(controller.getState().conversations.length, 1);
    });

    it('streams SSE deltas incrementally over HTTP before the delayed provider finishes and bypasses typewriter delay on streamed messages', async () => {
      const formattedSource = readClientFile('features/chat/FormattedMessageText.jsx');
      assert.match(formattedSource, /const instant = !animate \|\| isStreaming \|\| streamed;/);

      let tProviderChunk1 = null;
      let tProviderEnd = null;
      let tSseDelta1 = null;
      let tSseDone = null;

      // Real HTTP server wrapping chatStream controller with a delayed async-generator mock provider
      const server = http.createServer(async (req, res) => {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        req.body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        req.user = { id: 'user-sse-test', token: 'tok' };
        req.app = {
          locals: {
            enableChatStreamPersistence: false,
            trackSseConnection: () => {},
          },
        };
        const originalEnd = res.end.bind(res);
        res.end = (...args) => originalEnd(...args);

        // Inject a delayed provider stream via orchestrateUnifiedChatStream seam?
        // Instead, emit directly through chatStream's orchestrator? Let's test via chatAssistantService or mock provider!
        await chatStream(req, res, (err) => {
          if (!res.headersSent) {
            res.statusCode = err?.statusCode || 500;
            res.end(JSON.stringify({ error: err?.message || 'Error' }));
          }
        });
      });

      // Use orchestrateUnifiedChatStream directly over HTTP SSE to measure real Express/HTTP/SSE incremental flushing
      const { orchestrateUnifiedChatStream } = await import('../../server/src/features/chatAssistant/assistantOrchestrator.js');

      const sseServer = http.createServer(async (req, res) => {
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders?.();

        const sendEvent = (event, data) => {
          res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        };

        await orchestrateUnifiedChatStream(
          { id: 'user-sse', token: 'tok' },
          'Explain my spending',
          sendEvent,
          {
            enablePersistence: false,
            trustedHistory: [],
            toolTurnStreamRunner: async () =>
              (async function* delayedProvider() {
                await new Promise((r) => setTimeout(r, 25));
                tProviderChunk1 = Date.now();
                yield { type: 'text', text: 'First chunk ' };
                await new Promise((r) => setTimeout(r, 120));
                yield { type: 'text', text: 'second chunk.' };
                tProviderEnd = Date.now();
                yield {
                  type: 'turn_complete',
                  text: 'First chunk second chunk.',
                  functionCalls: [],
                  usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, usageSource: 'provider_reported' },
                };
              })(),
          }
        );
        res.end();
      });

      await new Promise((resolve) => sseServer.listen(0, '127.0.0.1', resolve));
      const { port } = sseServer.address();

      try {
        const events = [];
        const response = await fetch(`http://127.0.0.1:${port}/`, { method: 'POST' });
        await parseSSEStream(response.body, {
          onEvent: (eventType, data) => {
            if (eventType === 'delta' && tSseDelta1 === null) {
              tSseDelta1 = Date.now();
            }
            if (eventType === 'done') {
              tSseDone = Date.now();
            }
            events.push({ eventType, data });
          },
        });

        assert.ok(tProviderChunk1 !== null && tProviderEnd !== null);
        assert.ok(tSseDelta1 !== null && tSseDone !== null);
        assert.ok(
          tSseDelta1 < tProviderEnd,
          `Expected first SSE delta (${tSseDelta1}) to arrive before provider finished (${tProviderEnd})`
        );
        assert.ok(events.some((e) => e.eventType === 'delta' && e.data.text.includes('First chunk')));
        assert.ok(events.some((e) => e.eventType === 'done' && e.data.answer === 'First chunk second chunk.'));
      } finally {
        await new Promise((resolve) => sseServer.close(resolve));
        server.close();
      }
    });
  });

  describe('7. Chatbot Tool Dialog Portal, Retry Cleanup, and Empty Conversations', () => {
    const createMemoryStorage = () => {
      const store = new Map();
      return {
        getItem: (key) => (store.has(key) ? store.get(key) : null),
        setItem: (key, val) => store.set(key, String(val)),
        removeItem: (key) => store.delete(key),
      };
    };

    const createMockHistoryApi = (overrides = {}) => ({
      listConversations: async () => ({ conversations: [] }),
      getConversation: async (id) => ({ conversation: { id, title: 'Chat' }, messages: [] }),
      createConversation: async ({ id, title }) => ({ conversation: { id, title } }),
      updateConversation: async (id, { title }) => ({ conversation: { id, title } }),
      deleteConversation: async (id) => ({ deleted: true, id }),
      appendMessage: async (_id, msg) => ({ message: msg }),
      ...overrides,
    });

    it('renders ToolProposalResult Add Transaction dialog via document.body portal with Backdrop + Modal size="xl"', () => {
      const proposalSource = readClientFile('features/expenseAssistant/ToolProposalResult.jsx');
      assert.match(proposalSource, /createPortal\(dialogContent, document\.body\)/);
      assert.match(proposalSource, /<Backdrop open=\{true\}/);
      assert.match(proposalSource, /<Modal[\s\S]*size="xl"/);
      assert.match(proposalSource, /<TransactionDraftReview/);
      assert.match(proposalSource, /useModalAccessibility/);
    });

    it('removes only the failed Assistant bubble on retry and preserves message order without accumulating stale bubbles', async () => {
      let attempt = 0;
      const controller = createChatController({
        namespace: 'test-retry-cleanup',
        storage: createMemoryStorage(),
        historyApi: createMockHistoryApi({
          listConversations: async () => ({
            conversations: [{ id: 'conv-r', title: 'Retry chat', updatedAt: '2026-11-18T00:00:00Z' }],
          }),
          getConversation: async () => ({
            conversation: { id: 'conv-r', title: 'Retry chat', updatedAt: '2026-11-18T00:00:00Z' },
            messages: [
              { id: 'u0', role: 'user', text: 'First question', status: 'completed' },
              { id: 'a0', role: 'assistant', text: 'First answer', status: 'completed' },
            ],
          }),
        }),
        onSendMessageStream: async (_text, _history, { onEvent }) => {
          attempt += 1;
          if (attempt <= 2) {
            throw new Error(`Stream error attempt ${attempt}`);
          }
          await onEvent('delta', { text: 'Recovered answer' });
          await onEvent('done', { answer: 'Recovered answer' });
        },
      });

      await controller.loadUserConversations('user-1');

      await assert.rejects(() => controller.sendMessage('Second question'), /Stream error attempt 1/);
      let msgs = controller.getState().conversations[0].messages;
      assert.equal(msgs.length, 4);
      const firstFailedId = msgs[3].id;
      assert.equal(msgs[3].status, 'failed');

      // Second attempt also fails: first failed bubble must be removed, only 1 failed bubble exists
      await assert.rejects(() => controller.retryMessage(firstFailedId), /Stream error attempt 2/);
      msgs = controller.getState().conversations[0].messages;
      assert.equal(msgs.length, 4);
      assert.equal(msgs.some((m) => m.id === firstFailedId), false);
      const secondFailedId = msgs[3].id;
      assert.equal(msgs[3].status, 'failed');
      assert.equal(msgs[2].text, 'Second question');
      assert.equal(msgs[1].id, 'a0');

      // Third attempt succeeds: failed bubble replaced in-place with completed answer
      await controller.retryMessage(secondFailedId);
      msgs = controller.getState().conversations[0].messages;
      assert.deepEqual(
        msgs.map((m) => [m.role, m.text, m.status]),
        [
          ['user', 'First question', 'completed'],
          ['assistant', 'First answer', 'completed'],
          ['user', 'Second question', 'completed'],
          ['assistant', 'Recovered answer', 'completed'],
        ]
      );
    });

    it('keeps empty conversations temporary, excludes them from Chat History, and deduplicates first-message persistence', async () => {
      const storage = createMemoryStorage();
      let createCalls = 0;
      const createdIds = [];
      const historyApi = createMockHistoryApi({
        listConversations: async () => ({
          conversations: [{ id: 'conv-saved', title: 'Saved chat', updatedAt: '2026-11-18T00:00:00Z' }],
        }),
        getConversation: async () => ({
          conversation: { id: 'conv-saved', title: 'Saved chat', updatedAt: '2026-11-18T00:00:00Z' },
          messages: [{ id: 'm1', role: 'user', text: 'Saved', status: 'completed' }],
        }),
        createConversation: async ({ id, title }) => {
          createCalls += 1;
          createdIds.push(id);
          await new Promise((resolve) => setTimeout(resolve, 25));
          return { conversation: { id, title, updatedAt: '2026-11-18T00:00:01Z' } };
        },
      });

      const controller = createChatController({
        namespace: 'test-empty-conv',
        storage,
        historyApi,
        onSendMessage: async () => ({ answer: 'Ok' }),
      });

      await controller.loadUserConversations('user-1');

      // Opening multiple new conversations must not accumulate empty entries or call createConversation
      const draft1 = controller.newConversation();
      const draft2 = controller.newConversation();
      assert.equal(draft1.id, draft2.id);
      assert.equal(draft1.persisted, false);
      assert.equal(createCalls, 0);

      // LocalStorage cache must not persist empty unpersisted conversations
      const cachedRaw = storage.getItem('spendwise:test-empty-conv:user-1') || '[]';
      const cached = JSON.parse(cachedRaw);
      assert.equal(cached.some((c) => c.id === draft1.id), false);

      // Switching away prunes the empty unpersisted conversation
      await controller.selectConversation('conv-saved');
      assert.equal(controller.getState().conversations.some((c) => c.id === draft1.id), false);

      // Chatbot & ChatHistoryTab filter out unpersisted empty conversations from sidebar history
      const tabSource = readClientFile('features/chat/ChatHistoryTab.jsx');
      const chatbotSource = readClientFile('features/chat/Chatbot.jsx');
      assert.match(tabSource, /visibleConversations/);
      assert.match(chatbotSource, /conversations\.filter/);

      // Submitting first message persists conversation exactly once even under concurrent append
      const draft3 = controller.newConversation();
      await Promise.all([
        controller.appendMessage('user', 'First question'),
        controller.appendMessage('assistant', 'First reply'),
      ]);
      assert.equal(createCalls, 1);
      assert.deepEqual(createdIds, [draft3.id]);
      const persistedConv = controller.getState().conversations.find((c) => c.id === draft3.id);
      assert.equal(persistedConv?.persisted, true);
    });
  });

  describe('8. Text Overflow Fade Treatment and Active Conversation Deletion', () => {
    it('defines mask-based text-overflow-fade utilities and wires OverflowText/Text/TableCell across UI areas', () => {
      const indexCss = readClientFile('index.css');
      assert.match(indexCss, /\.text-overflow-fade\s*\{/);
      assert.match(indexCss, /\.text-overflow-fade-active\s*\{/);
      assert.match(indexCss, /mask-image:\s*linear-gradient\(to right/);

      const overflowHook = readClientFile('shared/hooks/useOverflowFade.js');
      assert.match(overflowHook, /el\.scrollWidth > el\.clientWidth \+ 1/);

      const overflowTextSource = readClientFile('primitives/typography/OverflowText.jsx');
      assert.match(overflowTextSource, /text-overflow-fade-active/);
      assert.match(overflowTextSource, /text-overflow-fade/);

      const textSource = readClientFile('primitives/typography/Text.jsx');
      assert.match(textSource, /useOverflowFade/);
      assert.match(textSource, /text-overflow-fade-active/);
      // Multi-line Text without truncate must retain wrapping
      assert.match(textSource, /const truncateClass = truncate/);

      const cellSource = readClientFile('primitives/table/TableCell.jsx');
      assert.match(cellSource, /useOverflowFade/);
      assert.match(cellSource, /text-overflow-fade-active/);

      assert.match(readClientFile('features/chat/ChatHistoryItem.jsx'), /<OverflowText/);
      assert.match(readClientFile('layouts/WorkspaceSidebar.jsx'), /<OverflowText/);
      assert.match(readClientFile('features/aiUsage/BreakdownList.jsx'), /<OverflowText/);
      assert.match(readClientFile('features/transaction/TransactionTable.jsx'), /truncate/);
      assert.match(readClientFile('features/transactionDraft/DraftsTable.jsx'), /truncate/);
      assert.match(readClientFile('features/document/DocumentTable.jsx'), /<TableCell truncate/);
    });

    it('deleting the active conversation creates a new unpersisted empty conversation without switching to other history', async () => {
      const createMemoryStorage = () => {
        const store = new Map();
        return {
          getItem: (key) => (store.has(key) ? store.get(key) : null),
          setItem: (key, val) => store.set(key, String(val)),
          removeItem: (key) => store.delete(key),
        };
      };

      const deletedIds = [];
      const controller = createChatController({
        namespace: 'test-delete-active',
        storage: createMemoryStorage(),
        historyApi: {
          listConversations: async () => ({
            conversations: [
              { id: 'conv-active', title: 'Active chat', updatedAt: '2026-11-18T02:00:00Z' },
              { id: 'conv-other', title: 'Older chat', updatedAt: '2026-11-18T01:00:00Z' },
            ],
          }),
          getConversation: async (id) => ({
            conversation: { id, title: id === 'conv-active' ? 'Active chat' : 'Older chat' },
            messages: [{ id: `m-${id}`, role: 'user', text: 'Hello', status: 'completed' }],
          }),
          deleteConversation: async (id) => {
            deletedIds.push(id);
            return { deleted: true, id };
          },
          createConversation: async ({ id, title }) => ({ conversation: { id, title } }),
          updateConversation: async (id, { title }) => ({ conversation: { id, title } }),
          appendMessage: async (_id, msg) => ({ message: msg }),
        },
      });

      await controller.loadUserConversations('user-1');
      assert.equal(controller.getState().activeId, 'conv-active');

      // Delete active conversation -> must start a brand new unpersisted empty conversation, NOT conv-other
      await controller.removeConversation('conv-active');
      const stateAfterActiveDelete = controller.getState();
      assert.deepEqual(deletedIds, ['conv-active']);
      assert.notEqual(stateAfterActiveDelete.activeId, 'conv-active');
      assert.notEqual(stateAfterActiveDelete.activeId, 'conv-other');
      const replacement = stateAfterActiveDelete.conversations.find((c) => c.id === stateAfterActiveDelete.activeId);
      assert.equal(replacement?.persisted, false);
      assert.deepEqual(replacement?.messages, []);
      // Other conversation must remain intact
      assert.ok(stateAfterActiveDelete.conversations.some((c) => c.id === 'conv-other'));

      // Deleting non-active conversation keeps activeId unchanged and does not create extra conversations
      const countBefore = stateAfterActiveDelete.conversations.length;
      await controller.removeConversation('conv-other');
      const stateAfterNonActiveDelete = controller.getState();
      assert.equal(stateAfterNonActiveDelete.activeId, replacement.id);
      assert.equal(stateAfterNonActiveDelete.conversations.length, countBefore - 1);
      assert.equal(stateAfterNonActiveDelete.conversations.some((c) => c.id === 'conv-other'), false);
    });

    it('handles streaming deletion isolation, late SSE events, deletion failures, and repeated delete calls safely', async () => {
      const streams = new Map();
      let failDelete = true;
      let deleteCalls = 0;

      const controller = createChatController({
        namespace: 'test-delete-races',
        historyApi: {
          listConversations: async () => ({
            conversations: [
              { id: 'conv-1', title: 'Streaming chat', updatedAt: '2026-11-18T02:00:00Z' },
              { id: 'conv-2', title: 'Background chat', updatedAt: '2026-11-18T01:00:00Z' },
            ],
          }),
          getConversation: async (id) => ({
            conversation: { id, title: id },
            messages: [{ id: `u-${id}`, role: 'user', text: 'Hi', status: 'completed' }],
          }),
          deleteConversation: async (id) => {
            deleteCalls += 1;
            if (failDelete) {
              throw new Error('Server delete failed');
            }
            await new Promise((resolve) => setTimeout(resolve, 20));
            return { deleted: true, id };
          },
          createConversation: async ({ id, title }) => ({ conversation: { id, title } }),
          updateConversation: async (id, { title }) => ({ conversation: { id, title } }),
          appendMessage: async (_id, msg) => ({ message: msg }),
        },
        onSendMessageStream: (_text, _history, { conversationId, signal, onEvent }) =>
          new Promise((resolve, reject) => {
            streams.set(conversationId, { onEvent, resolve, reject, signal });
            signal?.addEventListener('abort', () => {
              const err = new Error('Aborted');
              err.name = 'AbortError';
              reject(err);
            });
          }),
      });

      await controller.loadUserConversations('user-1');

      // Start stream in conv-2, then switch back and start stream in conv-1
      await controller.selectConversation('conv-2');
      const stream2Promise = controller.sendMessage('Question 2');
      await controller.selectConversation('conv-1');
      const stream1Promise = controller.sendMessage('Question 1');

      // Failed deletion preserves conv-1 as active and surfaces error without creating replacement
      await assert.rejects(() => controller.removeConversation('conv-1'), /Server delete failed/);
      assert.equal(controller.getState().activeId, 'conv-1');
      assert.equal(controller.getState().error, 'Server delete failed');
      assert.equal(streams.get('conv-1').signal.aborted, false);

      // Now allow deletion to succeed and trigger concurrent duplicate removeConversation('conv-1') calls
      failDelete = false;
      deleteCalls = 0;
      await Promise.all([
        controller.removeConversation('conv-1'),
        controller.removeConversation('conv-1'),
      ]);
      assert.equal(deleteCalls, 1);

      const afterState = controller.getState();
      const replacementId = afterState.activeId;
      assert.notEqual(replacementId, 'conv-1');
      assert.notEqual(replacementId, 'conv-2');
      assert.equal(afterState.busy, false);
      assert.equal(afterState.streaming, false);

      // Stream 1 was aborted, Stream 2 remains alive
      assert.equal(streams.get('conv-1').signal.aborted, true);
      assert.equal(streams.get('conv-2').signal.aborted, false);
      await stream1Promise;

      // Late SSE events for deleted conv-1 must not touch replacement conversation
      await streams.get('conv-1').onEvent('delta', { text: 'Late stale chunk' });
      const replacementConv = controller.getState().conversations.find((c) => c.id === replacementId);
      assert.deepEqual(replacementConv?.messages, []);

      // Finish conv-2 cleanly
      await streams.get('conv-2').onEvent('done', { answer: 'Background done' });
      streams.get('conv-2').resolve();
      await stream2Promise;
      const conv2 = controller.getState().conversations.find((c) => c.id === 'conv-2');
      assert.equal(conv2.messages[conv2.messages.length - 1].text, 'Background done');

      // ChatComposer keys on active?.id so deleted conversation's input is not inherited
      assert.match(readClientFile('features/chat/ChatConversation.jsx'), /<ChatComposer[\s\S]*key=\{active\?\.id \|\| 'default'\}/);
    });
  });
});
