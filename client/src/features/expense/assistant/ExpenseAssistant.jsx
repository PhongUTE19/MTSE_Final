import React, { useRef, useState } from 'react';
import ReceiptReview from '../../receipts/ReceiptReview';
import TransactionProposalCard from './TransactionProposalCard';
import ExpenseToolResult from './ExpenseToolResult';
import { ChatDrawer, useChat } from '../../chat';
import { WalletSparklesIcon } from '../../../shared/components/Icons';
import { ASSISTANT_LABELS, ASSISTANT_QUICK_ACTIONS } from './expenseAssistantLabels';
import { MAX_RECEIPT_SIZE_BYTES, RECEIPT_ACCEPTED_TYPES } from '../expenseConstants';

/**
 * Floating Expense AI Assistant popup overlay in the bottom-right corner.
 * Thin domain composition wrapping the generic FloatingAssistant with expense-specific
 * tool rendering, proposal confirmations, and receipt review attachments.
 */
export default function ExpenseAssistant({
  userId,
  onAsk,
  onConfirmProposal,
  onCancelProposal,
  onReceiptUpload,
  onReceiptConfirm,
  onReceiptDiscard,
  onTransactionsChanged,
  onOpenChange,
}) {
  const [proposal, setProposal] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const imageInputRef = useRef(null);

  const assistant = useChat({
    userId,
    namespace: 'expense-assistant',
    onSendMessage: async (text, history) => {
      const response = await onAsk(text, history);
      if (response?.proposal || response?.toolName === 'create_transaction') {
        setProposal(response.proposal || response.toolResult?.proposal || null);
      }
      return response;
    },
    onOpenChange,
  });

  const { busy, setBusy, setError, appendMessage } = assistant;

  async function handleConfirmProposal(transaction) {
    if (!proposal) return;
    setBusy(true);
    try {
      await onConfirmProposal(proposal.id, transaction);
      setProposal(null);
      appendMessage('assistant', ASSISTANT_LABELS.TRANSACTION_SAVED);
      await onTransactionsChanged();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCancelProposal() {
    if (!proposal) return;
    setBusy(true);
    try {
      await onCancelProposal(proposal.id);
      setProposal(null);
      appendMessage('assistant', ASSISTANT_LABELS.PROPOSAL_CANCELLED);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleAttachReceipt(file) {
    const previewUrl = URL.createObjectURL(file);
    setBusy(true);
    setError('');
    try {
      const response = await onReceiptUpload(file);
      setReceipt({
        id: response.receipt.id,
        file,
        previewUrl,
        draft: response.receipt.extraction,
      });
    } catch (requestError) {
      URL.revokeObjectURL(previewUrl);
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmReceipt(transaction) {
    if (!receipt) return;
    await onReceiptConfirm(receipt.id, transaction);
    URL.revokeObjectURL(receipt.previewUrl);
    setReceipt(null);
    appendMessage('assistant', ASSISTANT_LABELS.RECEIPT_SAVED);
    await onTransactionsChanged();
  }

  async function handleDiscardReceipt() {
    if (!receipt) return;
    await onReceiptDiscard(receipt.id);
    URL.revokeObjectURL(receipt.previewUrl);
    setReceipt(null);
    appendMessage('assistant', ASSISTANT_LABELS.RECEIPT_DISCARDED);
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!RECEIPT_ACCEPTED_TYPES.includes(file.type) || file.size > MAX_RECEIPT_SIZE_BYTES) {
      setError(ASSISTANT_LABELS.RECEIPT_RESTRICTION);
      return;
    }

    handleAttachReceipt(file);
  }

  return (
    <>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={handleFileChange}
      />

      <ChatDrawer
        assistant={assistant}
        title={ASSISTANT_LABELS.HEADER_TITLE}
        subtitle={ASSISTANT_LABELS.HEADER_SUBTITLE}
        avatarIcon={<WalletSparklesIcon />}
        welcomeQuestion={ASSISTANT_LABELS.WELCOME_QUESTION}
        quickActions={ASSISTANT_QUICK_ACTIONS}
        composerPlaceholder={ASSISTANT_LABELS.INPUT_PLACEHOLDER}
        sendLabel={ASSISTANT_LABELS.SEND_BUTTON}
        deleteConfirmPrompt={ASSISTANT_LABELS.DELETE_CONVERSATION_CONFIRM}
        toolLabel="Function"
        renderToolResult={(item) => <ExpenseToolResult message={item} />}
        renderBeforeComposer={() => (
          <>
            {proposal && (
              <TransactionProposalCard
                proposal={proposal}
                onConfirm={handleConfirmProposal}
                onCancel={handleCancelProposal}
                busy={busy}
              />
            )}

            {receipt && (
              <ReceiptReview
                file={receipt.file}
                previewUrl={receipt.previewUrl}
                draft={receipt.draft}
                onConfirm={handleConfirmReceipt}
                onDiscard={handleDiscardReceipt}
              />
            )}
          </>
        )}
        renderAttachmentAction={() => (
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            aria-label={ASSISTANT_LABELS.ADD_RECEIPT_LABEL}
            title={ASSISTANT_LABELS.ATTACH_RECEIPT}
            disabled={busy}
          >
            +
          </button>
        )}
      />
    </>
  );
}
