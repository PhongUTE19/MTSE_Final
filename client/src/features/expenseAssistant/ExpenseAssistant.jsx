import React, { useEffect, useRef } from 'react';
import { TransactionDraftReview } from '../../composites/transactions/index.js';
import ExpenseToolResult from './ExpenseToolResult.jsx';
import { Chatbot, useChat } from '../chat/index.js';
import Button from '../../primitives/buttons/Button.jsx';
import FileInput from '../../primitives/inputs/FileInput.jsx';
import { WalletSparklesIcon } from '../../primitives/display/Icons.jsx';
import { ASSISTANT_LABELS, ASSISTANT_QUICK_ACTIONS } from './expenseAssistantLabels.js';
import { RECEIPT_ACCEPT_ATTR } from '../../shared/transactions/expenseConstants.js';

/**
 * Expense AI Assistant push drawer integration for the SpendWise workspace.
 * Domain composition wrapping the generic Chatbot with expense-specific
 * tool rendering, transaction draft reviews, and receipt upload attachments.
 */
export default function ExpenseAssistant({
  userId,
  onAsk,
  onConfirmDraft,
  onRejectDraft,
  onSaveDraft,
  onReceiptUpload,
  useReceiptUpload: useReceiptUploadProp,
  receiptApi,
  onTransactionsChanged,
  onOpenChange,
}) {
  const imageInputRef = useRef(null);
  const activeIdRef = useRef('');

  const handleReceiptUpload = onReceiptUpload || receiptApi?.upload;

  const assistant = useChat({
    userId,
    namespace: 'expense-assistant',
    onSendMessage: async (text, history, context) => {
      const sendingConversationId = context?.conversationId || activeIdRef.current;
      return onAsk(text, history, { conversationId: sendingConversationId });
    },
    onOpenChange,
  });

  const { busy, setBusy, setError, appendMessage } = assistant;

  const useUpload = useReceiptUploadProp;
  const {
    receipt,
    closeReceipt,
    uploadFile: handleAttachReceipt,
  } = useUpload
    ? useUpload({
        upload: handleReceiptUpload,
        validationMessage: ASSISTANT_LABELS.RECEIPT_RESTRICTION,
        reportActionErrors: false,
        onError: setError,
        onUploadStart: () => setBusy(true),
        onUploadSettled: () => setBusy(false),
      })
    : { receipt: null, closeReceipt: () => {}, uploadFile: () => {} };

  // Reset in-flight receipt state when switching conversations
  useEffect(() => {
    if (activeIdRef.current !== assistant.activeId) {
      activeIdRef.current = assistant.activeId;
      closeReceipt();
    }
  }, [assistant.activeId, closeReceipt]);

  async function handleConfirmReceipt(payload) {
    if (!receipt) return;
    const draftId = receipt.draft?.id;
    if (onConfirmDraft && draftId) {
      await onConfirmDraft(draftId, payload);
    }
    closeReceipt();
    appendMessage('assistant', ASSISTANT_LABELS.RECEIPT_SAVED);
    await onTransactionsChanged?.();
  }

  async function handleDiscardReceipt() {
    if (!receipt) return;
    const draftId = receipt.draft?.id;
    if (onRejectDraft && draftId) {
      await onRejectDraft(draftId);
    }
    closeReceipt();
    appendMessage('assistant', ASSISTANT_LABELS.RECEIPT_DISCARDED);
    await onTransactionsChanged?.();
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    handleAttachReceipt(file);
  }

  return (
    <>
      <FileInput
        ref={imageInputRef}
        accept={RECEIPT_ACCEPT_ATTR}
        hidden
        onChange={handleFileChange}
      />

      <Chatbot
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
        renderToolResult={(item) => (
          <ExpenseToolResult
            message={item}
            onConfirmDraft={onConfirmDraft}
            onRejectDraft={onRejectDraft}
            onSaveDraft={onSaveDraft}
            onTransactionsChanged={onTransactionsChanged}
          />
        )}
        renderBeforeComposer={() => (
          <>
            {receipt && (
              <TransactionDraftReview
                key={receipt.id || receipt.draft?.id}
                draft={receipt.draft || receipt.extraction}
                previewUrl={receipt.previewUrl}
                fileName={receipt.file?.name}
                fileSize={receipt.file?.size}
                onConfirm={handleConfirmReceipt}
                onReject={handleDiscardReceipt}
                title="Review extracted details"
                subtitle="AI extraction is a draft. Check every field before saving."
              />
            )}
          </>
        )}
        renderAttachmentAction={({ busy: attachmentBusy } = {}) => (
          <Button
            type="button"
            variant="secondary"
            onClick={() => imageInputRef.current?.click()}
            aria-label={ASSISTANT_LABELS.ADD_RECEIPT_LABEL}
            title={ASSISTANT_LABELS.ATTACH_RECEIPT}
            disabled={busy || attachmentBusy}
          >
            +
          </Button>
        )}
      />
    </>
  );
}
