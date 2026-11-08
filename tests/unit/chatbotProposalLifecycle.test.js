import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isProposalExpiredOrMissing } from '../../client/src/features/expense/assistant/proposalUtils.js';
import { buildHistoryPayload } from '../../client/src/features/chat/chatHistory.js';
import { pushOverlay, isTopmostOverlay, clearOverlayStack } from '../../client/src/shared/utils/overlayStack.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readSource = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

describe('FE-FIX-03: Chatbot Proposal Lifecycle and Conversation State Management', () => {
  beforeEach(() => {
    clearOverlayStack();
  });

  describe('1. Proposal Expiration and Missing Error Detection (proposalUtils.js)', () => {
    it('detects 404 Not Found error as expired or missing', () => {
      const err = new Error('Transaction proposal was not found.');
      err.status = 404;
      assert.equal(isProposalExpiredOrMissing(err), true);
    });

    it('detects 409 Conflict error as already processed / stale', () => {
      const err = new Error('Transaction proposal has already been processed.');
      err.status = 409;
      assert.equal(isProposalExpiredOrMissing(err), true);
    });

    it('detects 400 Expired proposal error', () => {
      const err = new Error('Transaction proposal has expired. Please create a new one.');
      err.status = 400;
      assert.equal(isProposalExpiredOrMissing(err), true);
    });

    it('detects expiration message even without numeric status code', () => {
      assert.equal(isProposalExpiredOrMissing(new Error('This proposal has expired.')), true);
      assert.equal(isProposalExpiredOrMissing(new Error('Transaction proposal was not found.')), true);
      assert.equal(isProposalExpiredOrMissing(new Error('Transaction proposal has already been processed.')), true);
    });

    it('does NOT treat validation or generic errors as expired/missing', () => {
      const valErr = new Error('Amount must be a positive number.');
      valErr.status = 400;
      assert.equal(isProposalExpiredOrMissing(valErr), false);

      const netErr = new Error('Network error. Failed to fetch.');
      netErr.status = 500;
      assert.equal(isProposalExpiredOrMissing(netErr), false);

      assert.equal(isProposalExpiredOrMissing(null), false);
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

  describe('3. TransactionProposalCard Component Architecture & Loading States', () => {
    const cardSource = readSource('client/src/features/expense/assistant/TransactionProposalCard.jsx');

    it('supports separate isConfirming and isCancelling props', () => {
      assert.match(cardSource, /isConfirming\s*=\s*false/);
      assert.match(cardSource, /isCancelling\s*=\s*false/);
    });

    it('differentiates saving vs discarding loading states', () => {
      assert.match(cardSource, /const\s+isSaving\s*=\s*isConfirming\s*\|\|\s*\(busy\s*&&\s*!isCancelling\)/);
      assert.match(cardSource, /const\s+isDiscarding\s*=\s*isCancelling/);
      assert.match(cardSource, /const\s+isAnyBusy\s*=\s*isSaving\s*\|\|\s*isDiscarding/);
    });

    it('attaches isDiscarding loading state only to cancel button and isSaving to confirm button', () => {
      assert.match(cardSource, /loading=\{isDiscarding\}/);
      assert.match(cardSource, /loading=\{isSaving\}/);
      assert.match(cardSource, /disabled=\{isAnyBusy\}/);
    });
  });

  describe('4. ExpenseAssistant State Isolation and Expiration Handling', () => {
    const assistantSource = readSource('client/src/features/expense/assistant/ExpenseAssistant.jsx');

    it('imports and utilizes isProposalExpiredOrMissing', () => {
      assert.match(assistantSource, /import\s*\{\s*isProposalExpiredOrMissing\s*\}\s*from\s*['"]\.\/proposalUtils(\.js)?['"]/);
    });

    it('defines distinct isConfirmingProposal and isCancellingProposal state variables', () => {
      assert.match(assistantSource, /const\s*\[isConfirmingProposal,\s*setIsConfirmingProposal\]\s*=\s*useState\(false\)/);
      assert.match(assistantSource, /const\s*\[isCancellingProposal,\s*setIsCancellingProposal\]\s*=\s*useState\(false\)/);
    });

    it('clears proposal, resets loading states, and closes receipt when activeId changes', () => {
      assert.match(assistantSource, /if\s*\(activeIdRef\.current\s*!==\s*assistant\.activeId\)\s*\{/);
      assert.match(assistantSource, /setProposal\(null\)/);
      assert.match(assistantSource, /setIsConfirmingProposal\(false\)/);
      assert.match(assistantSource, /setIsCancellingProposal\(false\)/);
      assert.match(assistantSource, /closeReceipt\(\)/);
    });

    it('clears proposal when isProposalExpiredOrMissing is true in handleConfirmProposal', () => {
      assert.match(assistantSource, /if\s*\(isProposalExpiredOrMissing\(requestError\)\)\s*\{\s*setProposal\(null\)/);
    });

    it('clears proposal when isProposalExpiredOrMissing is true in handleCancelProposal', () => {
      assert.match(assistantSource, /async function handleCancelProposal\(\)/);
      assert.match(assistantSource, /if\s*\(isProposalExpiredOrMissing\(requestError\)\)\s*\{\s*[\s\S]*?setProposal\(null\)/);
    });

    it('protects against cross-conversation async responses during onSendMessage', () => {
      assert.match(assistantSource, /if\s*\(activeIdRef\.current\s*===\s*sendingConversationId\)/);
    });
  });

  describe('5. useChat Conversation Isolation, Deletion, and Message Guard', () => {
    const useChatSource = readSource('client/src/features/chat/useChat.js');

    it('clears error whenever activeId changes', () => {
      assert.match(useChatSource, /useEffect\(\(\)\s*=>\s*\{\s*setError\(''\);\s*\},?\s*\[activeId\]\)/);
    });

    it('does not reset activeId or change tab when deleting an inactive conversation', () => {
      assert.match(useChatSource, /if\s*\(id\s*===\s*activeId\)\s*\{[\s\S]*?setActiveId\(next\.id\);[\s\S]*?setTab\('chat'\);[\s\S]*?\}\s*else\s*\{\s*setConversations\(remaining\);\s*\}/);
    });

    it('enforces 1000-character limit check before sending message in sendMessage', () => {
      assert.match(useChatSource, /trimmed\.length\s*>\s*1000/);
      assert.match(useChatSource, /setError\(['"].*1000.*['"]\)/);
    });

    it('formats history using buildHistoryPayload', () => {
      assert.match(useChatSource, /const\s+history\s*=\s*buildHistoryPayload\(active\.messages,\s*8,\s*1000\)/);
    });

    it('safely associates async messages with targetConversationId', () => {
      assert.match(useChatSource, /const\s+targetConversationId\s*=\s*active\.id/);
      assert.match(useChatSource, /appendMessageToConversation\(targetConversationId,\s*'user',\s*trimmed\)/);
      assert.match(useChatSource, /appendMessageToConversation\(targetConversationId,\s*'assistant'/);
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
