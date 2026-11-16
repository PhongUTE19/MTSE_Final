import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildHistoryPayload } from '../../client/src/features/chat/chatHistory.js';
import { pushOverlay, isTopmostOverlay, clearOverlayStack } from '../../client/src/shared/utils/overlayStack.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readSource = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

describe('FE-FIX-03: Chatbot Proposal Lifecycle and Conversation State Management', () => {
  beforeEach(() => {
    clearOverlayStack();
  });

  describe('1. ToolProposalResult Draft Lifecycle States (ToolProposalResult.jsx)', () => {
    const proposalResultSource = readSource('client/src/features/expenseAssistant/ToolProposalResult.jsx');

    it('tracks confirmed, rejected, and pending_review states cleanly', () => {
      assert.match(proposalResultSource, /result\?\.draft\?\.status \|\| result\?\.status \|\| 'pending_review'/);
      assert.match(proposalResultSource, /if \(localStatus === 'confirmed'\)/);
      assert.match(proposalResultSource, /if \(localStatus === 'rejected'\)/);
    });

    it('surfaces confirm and reject errors via actionError and rethrows for TransactionDraftReview', () => {
      assert.match(proposalResultSource, /setActionError\(err\?\.message \|\| 'Failed to confirm transaction\.'\)/);
      assert.match(proposalResultSource, /setActionError\(err\?\.message \|\| 'Failed to discard proposal\.'\)/);
      assert.match(proposalResultSource, /throw err;/);
    });
  });

  describe('2. History Payload 1000-Character Constraint (chatHistory.js)', () => {
    it('returns empty array when messages is empty or invalid', () => {
      assert.deepEqual(buildHistoryPayload(null), []);
      assert.deepEqual(buildHistoryPayload([]), []);
    });

    it('filters out non-user/non-assistant roles and empty text', () => {
      const input = [
        { role: 'system', text: 'You are an assistant.' },
        { role: 'user', text: 'Hello' },
        { role: 'tool', text: 'result' },
        { role: 'assistant', text: '   ' },
        { role: 'assistant', text: 'Hi there!' },
      ];
      const output = buildHistoryPayload(input);
      assert.equal(output.length, 2);
      assert.deepEqual(output, [
        { role: 'user', text: 'Hello' },
        { role: 'assistant', text: 'Hi there!' },
      ]);
    });

    it('clamps each turn text to at most 1000 characters', () => {
      const longMessage = 'A'.repeat(1500);
      const input = [
        { role: 'user', text: 'Normal text' },
        { role: 'assistant', text: longMessage },
      ];
      const output = buildHistoryPayload(input);
      assert.equal(output.length, 2);
      assert.equal(output[0].text, 'Normal text');
      assert.equal(output[1].text.length, 1000);
      assert.equal(output[1].text, 'A'.repeat(1000));
    });

    it('limits output to at most 8 items by default', () => {
      const input = Array.from({ length: 15 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        text: `Message ${i}`,
      }));
      const output = buildHistoryPayload(input);
      assert.equal(output.length, 8);
      assert.equal(output[output.length - 1].text, 'Message 14');
    });
  });

  describe('3. TransactionDraftReview Component Architecture & Loading States', () => {
    const cardSource = readSource('client/src/composites/transactions/TransactionDraftReview.jsx');

    it('supports separate isConfirming and isRejecting props', () => {
      assert.match(cardSource, /isConfirming\s*=\s*false/);
      assert.match(cardSource, /isRejecting\s*=\s*false/);
    });

    it('differentiates saving vs discarding loading states', () => {
      assert.match(cardSource, /const\s+isSaving\s*=\s*isConfirming\s*\|\|\s*internalAction\s*===\s*'saving'\s*\|\|\s*\(busy\s*&&\s*!isRejecting\)/);
      assert.match(cardSource, /const\s+isDiscarding\s*=\s*isRejecting\s*\|\|\s*internalAction\s*===\s*'rejecting'/);
      assert.match(cardSource, /const\s+isAnyBusy\s*=\s*isSaving\s*\|\|\s*isDiscarding/);
    });

    it('attaches isDiscarding loading state only to reject button and isSaving to confirm button', () => {
      assert.match(cardSource, /loading=\{isDiscarding\}/);
      assert.match(cardSource, /loading=\{isSaving\}/);
      assert.match(cardSource, /disabled=\{isAnyBusy\}/);
    });
  });

  describe('4. ExpenseAssistant State Isolation and Draft Lifecycle Handling', () => {
    const assistantSource = readSource('client/src/features/expenseAssistant/ExpenseAssistant.jsx');

    it('delegates draft confirmation and rejection to onConfirmDraft and onRejectDraft', () => {
      assert.match(assistantSource, /onConfirmDraft/);
      assert.match(assistantSource, /onRejectDraft/);
    });

    it('closes in-flight receipt when activeId changes', () => {
      assert.match(assistantSource, /if\s*\(activeIdRef\.current\s*!==\s*assistant\.activeId\)\s*\{/);
      assert.match(assistantSource, /closeReceipt\(\)/);
    });

    it('passes sendingConversationId context during onSendMessage', () => {
      assert.match(assistantSource, /const sendingConversationId = context\?\.conversationId \|\| activeIdRef\.current;/);
      assert.match(assistantSource, /onAsk\(text, history, \{ conversationId: sendingConversationId \}\)/);
    });
  });

  describe('5. useChat / createChatController Conversation Isolation, Deletion, and Message Guard', () => {
    const useChatSource = readSource('client/src/features/chat/useChat.js');

    it('useChat delegates conversation state management to createChatController', () => {
      assert.match(useChatSource, /createChatController/);
    });

    it('clears error whenever activeId changes', async () => {
      const { createChatController } = await import('../../client/src/features/chat/chatController.js');
      const controller = createChatController({
        storage: null,
        historyApi: {
          listConversations: async () => ({
            conversations: [
              { id: 'c1', title: 'One', updatedAt: '2026-11-17T00:00:00Z' },
              { id: 'c2', title: 'Two', updatedAt: '2026-11-17T00:00:00Z' },
            ],
          }),
          getConversation: async () => ({ conversation: {}, messages: [] }),
        },
      });
      await controller.loadUserConversations('user-1');
      controller.setError('Previous error');
      await controller.selectConversation('c2');
      assert.equal(controller.getState().error, '');
    });

    it('does not reset activeId when deleting an inactive conversation', async () => {
      const { createChatController } = await import('../../client/src/features/chat/chatController.js');
      const controller = createChatController({
        storage: null,
        historyApi: {
          listConversations: async () => ({
            conversations: [
              { id: 'c1', title: 'One', updatedAt: '2026-11-17T00:00:00Z' },
              { id: 'c2', title: 'Two', updatedAt: '2026-11-17T00:00:00Z' },
            ],
          }),
          getConversation: async () => ({ conversation: {}, messages: [] }),
          deleteConversation: async () => ({ deleted: true }),
        },
      });
      await controller.loadUserConversations('user-1');
      assert.equal(controller.getState().activeId, 'c1');
      await controller.removeConversation('c2');
      assert.equal(controller.getState().activeId, 'c1');
      assert.deepEqual(controller.getState().conversations.map((c) => c.id), ['c1']);
    });

    it('enforces 1000-character limit check before sending message in sendMessage', async () => {
      const { createChatController } = await import('../../client/src/features/chat/chatController.js');
      let sent = false;
      const controller = createChatController({
        storage: null,
        historyApi: { listConversations: async () => ({ conversations: [] }) },
        onSendMessage: async () => { sent = true; return { answer: 'ok' }; },
      });
      await controller.loadUserConversations('user-1');
      await controller.sendMessage('a'.repeat(1001));
      assert.equal(sent, false);
      assert.match(controller.getState().error, /1000/);
    });

    it('formats history using buildHistoryPayload and associates async response with targetConversationId', async () => {
      const { createChatController } = await import('../../client/src/features/chat/chatController.js');
      let capturedHistory = null;
      let capturedContext = null;
      const controller = createChatController({
        storage: null,
        historyApi: {
          listConversations: async () => ({
            conversations: [
              { id: 'c1', title: 'One', updatedAt: '2026-11-17T00:00:00Z' },
              { id: 'c2', title: 'Two', updatedAt: '2026-11-17T00:00:00Z' },
            ],
          }),
          getConversation: async (id) => ({
            conversation: { id },
            messages: id === 'c1' ? [{ id: 'm1', role: 'user', text: 'Prior turn' }] : [],
          }),
          appendMessage: async (_id, msg) => ({ message: msg }),
          updateConversation: async (_id, patch) => ({ conversation: patch }),
        },
        onSendMessage: async (_text, history, context) => {
          capturedHistory = history;
          capturedContext = context;
          await controller.selectConversation('c2');
          return { answer: 'Reply for c1' };
        },
      });

      await controller.loadUserConversations('user-1');
      await controller.sendMessage('Follow up');
      assert.deepEqual(capturedHistory, [{ role: 'user', text: 'Prior turn' }]);
      assert.equal(capturedContext.conversationId, 'c1');
      const c1 = controller.getState().conversations.find((c) => c.id === 'c1');
      assert.equal(c1.messages.at(-1).text, 'Reply for c1');
    });
  });

  describe('6. ChatComposer Maximum Length Constraint', () => {
    const composerSource = readSource('client/src/features/chat/ChatComposer.jsx');

    it('applies maxLength={1000} to TextArea', () => {
      assert.match(composerSource, /maxLength=\{1000\}/);
    });
  });

  describe('7. Overlay Stack Escape Coordination Between PushDrawer and ConfirmDialog', () => {
    it('prioritizes nested ConfirmDialog over PushDrawer in the overlay stack', () => {
      const pushDrawerOverlay = { id: 'push-drawer', dismissible: true };
      const confirmDialogOverlay = { id: 'confirm-dialog', dismissible: true };

      // 1. PushDrawer is opened
      const popDrawer = pushOverlay(pushDrawerOverlay);
      assert.equal(isTopmostOverlay(pushDrawerOverlay), true);

      // 2. User initiates conversation deletion: ConfirmDialog opens
      const popConfirm = pushOverlay(confirmDialogOverlay);

      // ConfirmDialog is now topmost; PushDrawer is NOT topmost
      assert.equal(isTopmostOverlay(confirmDialogOverlay), true);
      assert.equal(isTopmostOverlay(pushDrawerOverlay), false);

      // 3. User cancels or confirms ConfirmDialog -> ConfirmDialog pops
      popConfirm();

      // PushDrawer is once again topmost
      assert.equal(isTopmostOverlay(pushDrawerOverlay), true);

      // 4. PushDrawer closes
      popDrawer();
      assert.equal(isTopmostOverlay(pushDrawerOverlay), true); // Empty stack returns true
    });
  });
});
