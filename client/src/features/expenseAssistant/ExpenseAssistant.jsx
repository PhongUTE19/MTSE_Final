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
  onAskStream,
  drafts = [],
  draftsLoading = false,
  onCreateDraft,
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
  const stagedReceiptIdsRef = useRef(new Set());

  const handleReceiptUpload = onReceiptUpload || receiptApi?.upload;

  const stageProposalDraft = async (proposalPayload, { conversationId: convId } = {}) => {
    const proposalData = proposalPayload?.proposal || proposalPayload?.draft || proposalPayload;
    if (!proposalData) return null;
    const localDraftId = proposalPayload?.draftId || crypto.randomUUID();
    const normalizedToolResult = {
      draftId: localDraftId,
      sourceType: 'assistant_proposal',
      sourceRef: proposalPayload?.sourceRef || convId || null,
      draft: proposalData,
    };
    if (onCreateDraft) {
      await onCreateDraft({
        id: localDraftId,
        sourceType: 'assistant_proposal',
        sourceRef: normalizedToolResult.sourceRef,
        originalData: proposalData,
        reviewedData: proposalData,
      });
    }
    return normalizedToolResult;
  };

  const assistant = useChat({
    userId,
    namespace: 'expense-assistant',
    onSendMessageStream: onAskStream || null,
    onProposal: stageProposalDraft,
    onSendMessage: async (text, history, context) => {
      const sendingConversationId = context?.conversationId || activeIdRef.current;
      const response = await onAsk(text, history, { conversationId: sendingConversationId });
      const isProposalTool = response?.toolName === 'propose_transaction' || response?.toolName === 'create_transaction';
      const proposalData = response?.toolResult?.proposal || response?.proposal || response?.toolResult?.draft || null;

      if (isProposalTool && proposalData) {
        const normalizedToolResult = await stageProposalDraft(
          {
            draftId: response?.toolResult?.draftId,
            sourceRef: response?.toolResult?.sourceRef || sendingConversationId,
            proposal: proposalData,
          },
          { conversationId: sendingConversationId }
        );
        return {
          ...response,
          toolResult: normalizedToolResult,
        };
      }
      return response;
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

  // Persist stateless receipt extraction + Blob in local IndexedDB on upload
  useEffect(() => {
    const draft = receipt?.draft;
    if (!draft?.id || !onCreateDraft || stagedReceiptIdsRef.current.has(draft.id)) {
      return;
    }
    stagedReceiptIdsRef.current.add(draft.id);
    onCreateDraft({
      id: draft.id,
      sourceType: 'receipt_extraction',
      originalData: draft.originalData || receipt.extraction || {},
      reviewedData: draft.reviewedData || draft.originalData || receipt.extraction || {},
      warnings: draft.warnings || receipt.warnings || [],
      receiptBlob: receipt.file || null,
      fileMeta: draft.fileMeta || {
        filename: receipt.file?.name || 'receipt.png',
        mimeType: receipt.file?.type || 'image/png',
        size: receipt.file?.size || null,
      },
      aiModel: draft.aiModel || null,
      promptVersion: draft.promptVersion || null,
    }).catch((err) => {
      setError(err?.message || 'Failed to stage receipt draft locally.');
    });
  }, [receipt, onCreateDraft, setError]);

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
            drafts={drafts}
            draftsLoading={draftsLoading}
            onCreateDraft={onCreateDraft}
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
