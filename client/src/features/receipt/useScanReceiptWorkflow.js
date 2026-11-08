import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { receiptApi } from './receiptApi.js';
import { useReceiptUpload } from './useReceiptUpload.js';

/**
 * Coordinates the receipt scanning workflow:
 * - Loading failed receipts and pending receipt_extraction drafts
 * - Uploading new receipts via useReceiptUpload
 * - Resuming, discarding, retrying, and confirming drafts
 */
export function useScanReceiptWorkflow({
  drafts = [],
  onConfirmDraft,
  onRejectDraft,
  reloadDrafts,
  draftsHook = null,
  receiptsVersion = 0,
  notifyTransactionsChanged,
  onTransactionSaved,
  reportError,
  toast,
}) {
  const resolvedDrafts = useMemo(() => {
    return draftsHook?.drafts || drafts || [];
  }, [draftsHook?.drafts, drafts]);

  const handleConfirmDraft = draftsHook?.confirmDraft || onConfirmDraft;
  const handleRejectDraft = draftsHook?.rejectDraft || onRejectDraft;
  const handleReloadDrafts = draftsHook?.loadDrafts || draftsHook?.reloadDrafts || reloadDrafts;

  const [failedReceipts, setFailedReceipts] = useState([]);
  const [activeReview, setActiveReview] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);

  const loadFailedReceipts = useCallback(async () => {
    try {
      const result = await receiptApi.listReceipts();
      const failed = (result?.receipts || []).filter((item) => item.status === 'failed');
      setFailedReceipts(failed);
    } catch (requestError) {
      console.warn('[ScanReceiptView] Failed to load receipt history:', requestError.message);
    }
  }, []);

  const refreshState = useCallback(async () => {
    await Promise.all([
      loadFailedReceipts(),
      handleReloadDrafts?.(),
    ]);
  }, [loadFailedReceipts, handleReloadDrafts]);

  const pendingReceiptDrafts = useMemo(() => {
    return resolvedDrafts.filter(
      (d) => d.sourceType === 'receipt_extraction' && d.status === 'pending_review'
    );
  }, [resolvedDrafts]);

  const {
    receipt: inFlightReceipt,
    processing: processingReceipt,
    uploadFile,
    showReceipt,
    beginAction,
    isCurrentAction,
  } = useReceiptUpload({
    upload: receiptApi.upload,
    validationMessage: 'Upload a JPG, PNG, or WebP file up to 5 MB.',
    reportActionErrors: true,
    onError: reportError,
    onUploadFailed: refreshState,
  });

  useEffect(() => {
    if (inFlightReceipt && !activeReview) {
      const draft = inFlightReceipt.draft;
      if (!draft || !draft.id) {
        reportError('No transaction draft was created for this receipt. Please retry.');
        refreshState();
        return;
      }
      const draftData = draft.reviewedData || draft.originalData || draft;
      setActiveReview({
        id: draft.id,
        receiptId: inFlightReceipt.id,
        fileName: inFlightReceipt.file?.name || (draftData.merchant ? `${draftData.merchant} Receipt` : 'Receipt'),
        fileSize: inFlightReceipt.file?.size || null,
        previewUrl: inFlightReceipt.previewUrl,
        localPreview: inFlightReceipt.localPreview,
        draft,
      });
      refreshState();
    }
  }, [inFlightReceipt, activeReview, refreshState, reportError]);

  useEffect(() => {
    refreshState();
  }, [refreshState]);

  const lastReceiptsVersionRef = useRef(receiptsVersion);
  useEffect(() => {
    if (receiptsVersion > 0 && receiptsVersion !== lastReceiptsVersionRef.current) {
      lastReceiptsVersionRef.current = receiptsVersion;
      refreshState();
    }
  }, [receiptsVersion, refreshState]);

  async function handleFileUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || processingReceipt || activeReview) return;
    await uploadFile(file);
  }

  async function resumeDraftReview(draft) {
    if (processingReceipt || activeReview || pendingAction) return;
    const actionId = beginAction();
    try {
      setPendingAction({ id: draft.id, type: 'resume' });
      reportError('');

      let previewUrl = null;
      const receiptId = draft.receiptId;
      if (receiptId) {
        try {
          const preview = await receiptApi.previewReceipt(receiptId);
          previewUrl = preview?.url || null;
        } catch {
          // Preview is best effort
        }
      }

      if (!isCurrentAction(actionId)) return;

      const draftData = draft.reviewedData || draft.originalData || {};
      setActiveReview({
        id: draft.id,
        receiptId,
        fileName: draftData.merchant ? `${draftData.merchant} Receipt` : 'Receipt',
        previewUrl,
        localPreview: false,
        draft,
      });
    } catch (err) {
      if (isCurrentAction(actionId)) {
        reportError(err.message);
      }
    } finally {
      if (isCurrentAction(actionId)) {
        setPendingAction(null);
      }
    }
  }

  async function discardDraft(draft) {
    if (processingReceipt || activeReview || pendingAction) return;
    try {
      setPendingAction({ id: draft.id, type: 'discard' });
      reportError('');
      if (handleRejectDraft) {
        await handleRejectDraft(draft.id);
      }
      toast.info('Receipt draft discarded.');
      await refreshState();
    } catch (err) {
      reportError(err.message);
    } finally {
      setPendingAction(null);
    }
  }

  async function retryFailedReceipt(failedItem) {
    if (processingReceipt || activeReview || pendingAction) return;
    const actionId = beginAction();
    try {
      setPendingAction({ id: failedItem.id, type: 'retry' });
      reportError('');

      const result = await receiptApi.retryReceipt(failedItem.id);
      const preview = await receiptApi.previewReceipt(failedItem.id);

      if (!isCurrentAction(actionId)) return;

      const newDraft = result?.receipt?.draft;
      if (!newDraft || !newDraft.id) {
        reportError('Receipt extraction did not produce a draft. Please retry.');
        await refreshState();
        return;
      }
      setActiveReview({
        id: newDraft.id,
        receiptId: result.receipt.id,
        fileName: failedItem.filename || 'Receipt',
        previewUrl: preview?.url || null,
        localPreview: false,
        draft: newDraft,
      });
      await refreshState();
    } catch (err) {
      if (isCurrentAction(actionId)) {
        reportError(err.message);
        await refreshState();
      }
    } finally {
      if (isCurrentAction(actionId)) {
        setPendingAction(null);
      }
    }
  }

  async function handleReviewConfirm(finalValues) {
    if (!activeReview) return;
    const draftId = activeReview.draft?.id;
    if (!draftId) {
      reportError('No transaction draft found for this receipt.');
      return;
    }
    if (handleConfirmDraft) {
      await handleConfirmDraft(draftId, finalValues);
    }
    notifyTransactionsChanged?.();
    await onTransactionSaved?.();
    toast.success('Receipt confirmed and transaction saved.');
    setActiveReview(null);
    showReceipt(null);
    await refreshState();
  }

  async function handleReviewDiscard() {
    if (!activeReview) return;
    const draftId = activeReview.draft?.id;
    if (handleRejectDraft && draftId) {
      try {
        await handleRejectDraft(draftId);
      } catch (err) {
        console.warn('[ScanReceiptView] Failed to reject draft on discard:', err.message);
      }
    }
    toast.info('Receipt draft discarded.');
    setActiveReview(null);
    showReceipt(null);
    await refreshState();
  }

  return {
    failedReceipts,
    pendingReceiptDrafts,
    activeReview,
    pendingAction,
    processingReceipt,
    handleFileUpload,
    resumeDraftReview,
    discardDraft,
    retryFailedReceipt,
    handleReviewConfirm,
    handleReviewDiscard,
  };
}
