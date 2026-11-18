import React, { useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useToast, useWorkspace } from '../../app/providers/index.js';
import { useScanReceiptWorkflow } from './useScanReceiptWorkflow.js';
import { TransactionDraftReview } from '../../composites/transactions/index.js';
import ReceiptUploadCard from './ReceiptUploadCard.jsx';
import PendingReceiptList from './PendingReceiptList.jsx';
import ReceiptProcessingCard from './ReceiptProcessingCard.jsx';
import Card from '../../primitives/cards/Card.jsx';
import { Stack } from '../../primitives/layout/index.js';

/**
 * Scan Receipt View for SpendWise.
 * Composes receipt upload, pending/failed receipt resumption, OCR processing status,
 * and active draft review via TransactionDraftReview.
 */
export default function ScanReceiptPage({
  onTransactionSaved,
  onError,
  drafts = [],
  onConfirmDraft,
  onRejectDraft,
  onSaveDraft,
  reloadDrafts,
  draftsLoading = false,
  draftsHook = null,
}) {
  const outletContext = useOutletContext() || {};
  const { toast } = useToast();
  const { receiptsVersion, notifyTransactionsChanged } = useWorkspace();

  const reportError = useCallback((msg) => {
    const reportFn = onError || outletContext.setError;
    reportFn?.(msg);
    if (msg) {
      toast.error(msg);
    }
  }, [onError, outletContext.setError, toast]);

  const {
    failedReceipts,
    pendingReceiptDrafts,
    activeReview,
    pendingAction,
    processingReceipt,
    handleFileUpload,
    resumeDraftReview,
    discardDraft,
    retryFailedReceipt,
    handleReviewChange,
    handleReviewConfirm,
    handleReviewDiscard,
  } = useScanReceiptWorkflow({
    drafts,
    onConfirmDraft,
    onRejectDraft,
    onSaveDraft,
    reloadDrafts,
    draftsHook,
    receiptsVersion,
    notifyTransactionsChanged,
    onTransactionSaved,
    reportError,
    toast,
  });

  const showIdleView = !processingReceipt && !activeReview;

  return (
    <Card variant="glass" aria-busy={Boolean(processingReceipt || draftsLoading)}>
      <Stack gap="lg">
        {showIdleView && (
          <>
            <ReceiptUploadCard onFileChange={handleFileUpload} />
            <PendingReceiptList
              pendingDrafts={pendingReceiptDrafts}
              failedReceipts={failedReceipts}
              pendingAction={pendingAction}
              onResumeDraft={resumeDraftReview}
              onDiscardDraft={discardDraft}
              onRetryFailed={retryFailedReceipt}
            />
          </>
        )}

        {processingReceipt && (
          <ReceiptProcessingCard processingReceipt={processingReceipt} />
        )}

        {activeReview && (
          <TransactionDraftReview
            key={activeReview.id}
            draft={activeReview.draft}
            onChange={handleReviewChange}
            previewUrl={activeReview.previewUrl}
            fileName={activeReview.fileName}
            fileSize={activeReview.fileSize}
            onConfirm={handleReviewConfirm}
            onReject={handleReviewDiscard}
            stepLabel="SCAN RECEIPT REVIEW"
            confirmLabel="Confirm and save transaction"
            rejectLabel="Discard"
          />
        )}
      </Stack>
    </Card>
  );
}
