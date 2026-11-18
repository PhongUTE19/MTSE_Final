import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useConfirm, useToast, useWorkspace } from '../../app/providers/index.js';
import { TransactionDraftReview } from '../../composites/transactions/index.js';
import Alert from '../../composites/feedback/Alert.jsx';
import Button from '../../primitives/buttons/Button.jsx';
import { Inline, Stack } from '../../primitives/layout/index.js';
import {
  buildReceiptReviewForm,
  validateTransactionData,
} from '../../shared/transactions/transactionFieldsUtils.js';
import DraftsTable from './DraftsTable.jsx';
import { getDraftSourceLabel, isReceiptDraft } from './draftStorage.js';
import { useTransactionDrafts } from './useTransactionDrafts.js';

const SAVE_DEBOUNCE_MS = 250;

/**
 * Unified Drafts page displaying both Receipt and Manual TransactionDraft records
 * stored in user-scoped IndexedDB, with persistent editing, confirmation, and discard.
 */
export default function DraftsPage({ draftsHook: injectedDraftsHook = null }) {
  const outletContext = useOutletContext() || {};
  const { confirm } = useConfirm();
  const { toast } = useToast();
  const { notifyTransactionsChanged, notifyReceiptsChanged } = useWorkspace();
  const reportError = outletContext.setError || outletContext.onError;

  const internalDraftsHook = useTransactionDrafts({ autoFetch: !injectedDraftsHook });
  const draftsHook = injectedDraftsHook || internalDraftsHook;

  const {
    drafts,
    loading,
    error,
    saveDraft,
    confirmDraft,
    rejectDraft,
    getPreviewUrl,
    releasePreviewUrl,
  } = draftsHook;

  const [editingState, setEditingState] = useState(null);
  const [busyDraftId, setBusyDraftId] = useState(null);
  const saveTimerRef = useRef(null);
  const pendingSaveRef = useRef(null);
  const saveChainRef = useRef(Promise.resolve());

  const clearPendingTimer = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  const persistDraftEdits = useCallback(
    (draftId, values) => {
      saveChainRef.current = saveChainRef.current
        .catch(() => {})
        .then(() => saveDraft(draftId, values));
      return saveChainRef.current;
    },
    [saveDraft]
  );

  const flushPendingSave = useCallback(async () => {
    clearPendingTimer();
    const pending = pendingSaveRef.current;
    pendingSaveRef.current = null;
    if (pending) {
      await persistDraftEdits(pending.draftId, pending.values);
    }
    await saveChainRef.current.catch(() => {});
  }, [clearPendingTimer, persistDraftEdits]);

  useEffect(() => {
    return () => {
      clearPendingTimer();
      if (pendingSaveRef.current) {
        const { draftId, values } = pendingSaveRef.current;
        pendingSaveRef.current = null;
        persistDraftEdits(draftId, values).catch(() => {});
      }
    };
  }, [clearPendingTimer, persistDraftEdits]);

  const closeEditor = useCallback(async () => {
    await flushPendingSave();
    setEditingState((prev) => {
      if (prev?.draft?.id) {
        releasePreviewUrl?.(prev.draft.id, 'drafts-review');
      }
      return null;
    });
  }, [flushPendingSave, releasePreviewUrl]);

  const openEditor = useCallback(
    (draft, initialError = '') => {
      if (!draft) return;
      const isReceipt = isReceiptDraft(draft);
      const hasBlob =
        typeof Blob === 'undefined'
          ? Boolean(draft.receiptBlob)
          : draft.receiptBlob instanceof Blob;
      const previewUrl =
        isReceipt && hasBlob ? getPreviewUrl?.(draft, 'drafts-review') || null : null;
      const data = draft.reviewedData || draft.originalData || {};

      setEditingState({
        draft,
        previewUrl,
        fileName:
          draft.fileMeta?.filename ||
          (data.merchant ? `${data.merchant} Receipt` : isReceipt ? 'Receipt' : ''),
        fileSize: draft.fileMeta?.size || draft.receiptBlob?.size || null,
        error: initialError,
      });
    },
    [getPreviewUrl]
  );

  const handleDraftFieldChange = useCallback(
    (nextValues) => {
      setEditingState((prev) => {
        if (!prev?.draft) return prev;
        const draftId = prev.draft.id;
        pendingSaveRef.current = { draftId, values: nextValues };
        clearPendingTimer();
        saveTimerRef.current = setTimeout(() => {
          const pending = pendingSaveRef.current;
          pendingSaveRef.current = null;
          if (pending) {
            persistDraftEdits(pending.draftId, pending.values).catch((err) => {
              reportError?.(err?.message || 'Failed to save draft changes.');
            });
          }
        }, SAVE_DEBOUNCE_MS);

        return {
          ...prev,
          error: '',
          draft: {
            ...prev.draft,
            reviewedData: nextValues,
          },
        };
      });
    },
    [clearPendingTimer, persistDraftEdits, reportError]
  );

  const handleConfirmFromReview = useCallback(
    async (finalValues) => {
      if (!editingState?.draft?.id) return;
      const draftId = editingState.draft.id;
      await flushPendingSave();
      await confirmDraft(draftId, finalValues);
      releasePreviewUrl?.(draftId, 'drafts-review');
      notifyTransactionsChanged?.();
      notifyReceiptsChanged?.();
      toast.success('Draft confirmed and saved to ledger.');
      setEditingState(null);
    },
    [
      editingState,
      flushPendingSave,
      confirmDraft,
      releasePreviewUrl,
      notifyTransactionsChanged,
      notifyReceiptsChanged,
      toast,
    ]
  );

  const handleDiscardFromReview = useCallback(async () => {
    if (!editingState?.draft?.id) return;
    const draftId = editingState.draft.id;
    clearPendingTimer();
    pendingSaveRef.current = null;
    await rejectDraft(draftId);
    releasePreviewUrl?.(draftId, 'drafts-review');
    toast.info('Draft discarded.');
    setEditingState(null);
  }, [editingState, clearPendingTimer, rejectDraft, releasePreviewUrl, toast]);

  const handleRowConfirm = useCallback(
    async (draft) => {
      const formValues = buildReceiptReviewForm(draft.reviewedData || draft.originalData || {});
      const validation = validateTransactionData(formValues, { locale: 'en' });
      if (!validation.isValid) {
        openEditor(draft, validation.error);
        return;
      }

      setBusyDraftId(draft.id);
      try {
        await confirmDraft(draft.id, {
          ...formValues,
          amount: validation.amount,
          merchant: (formValues.merchant || '').trim(),
          items: formValues.items || [],
        });
        notifyTransactionsChanged?.();
        notifyReceiptsChanged?.();
        toast.success('Draft confirmed and saved to ledger.');
      } catch (err) {
        const message = err?.message || 'Failed to confirm draft.';
        reportError?.(message);
        toast.error(message);
      } finally {
        setBusyDraftId(null);
      }
    },
    [confirmDraft, notifyTransactionsChanged, notifyReceiptsChanged, openEditor, reportError, toast]
  );

  const handleRowDiscard = useCallback(
    async (draft) => {
      const data = draft.reviewedData || draft.originalData || {};
      const title = data.merchant || `${getDraftSourceLabel(draft)} draft`;
      const isConfirmed = await confirm({
        title: 'Discard Draft',
        message: `Discard "${title}"? This removes the local draft and does not affect confirmed transactions.`,
        confirmText: 'Discard',
        cancelText: 'Cancel',
        variant: 'danger',
      });
      if (!isConfirmed) return;

      setBusyDraftId(draft.id);
      try {
        await rejectDraft(draft.id);
        toast.info('Draft discarded.');
      } catch (err) {
        const message = err?.message || 'Failed to discard draft.';
        reportError?.(message);
        toast.error(message);
      } finally {
        setBusyDraftId(null);
      }
    },
    [confirm, rejectDraft, reportError, toast]
  );

  return (
    <Stack gap="lg">
      {error && (
        <Alert variant="error" role="alert">
          {error}
        </Alert>
      )}

      {editingState && (
        <Stack gap="sm">
          <Inline justify="start">
            <Button type="button" variant="secondary" size="sm" onClick={closeEditor}>
              Back to drafts
            </Button>
          </Inline>
          <TransactionDraftReview
            key={editingState.draft.id}
            draft={editingState.draft}
            onChange={handleDraftFieldChange}
            onConfirm={handleConfirmFromReview}
            onReject={handleDiscardFromReview}
            error={editingState.error}
            previewUrl={editingState.previewUrl}
            fileName={editingState.fileName}
            fileSize={editingState.fileSize}
            stepLabel={`${getDraftSourceLabel(editingState.draft).toUpperCase()} DRAFT REVIEW`}
            title={
              isReceiptDraft(editingState.draft)
                ? 'Review receipt draft'
                : 'Review manual draft'
            }
            confirmLabel="Confirm and save transaction"
            rejectLabel="Discard"
          />
        </Stack>
      )}

      <DraftsTable
        drafts={drafts}
        loading={loading}
        busyDraftId={busyDraftId}
        onEdit={(draft) => openEditor(draft)}
        onConfirm={handleRowConfirm}
        onDiscard={handleRowDiscard}
      />
    </Stack>
  );
}
