import React, { useEffect, useState } from 'react';
import { expenseApi } from '../expense/expenseApi';
import ReceiptReview from './ReceiptReview';
import {
  MAX_RECEIPT_SIZE_BYTES,
  RECEIPT_ACCEPTED_TYPES,
} from '../expense/expenseConstants';
import { formatMoney } from '../../shared/utils/formatters';

/**
 * Dedicated view component for the Receipts tab in SpendWise.
 * Manages pending receipt reviews, image uploads, OCR extraction loading,
 * and review/confirmation workflows.
 */
export default function ReceiptsView({
  onTransactionSaved,
  onError,
}) {
  const [receipt, setReceipt] = useState(null);
  const [processingReceipt, setProcessingReceipt] = useState(null);
  const [pendingReviews, setPendingReviews] = useState([]);
  const [pendingActionId, setPendingActionId] = useState(null);

  useEffect(() => {
    loadPendingReviews();
  }, []);

  async function loadPendingReviews() {
    try {
      const result = await expenseApi.listReceipts();
      setPendingReviews(
        result.receipts.filter((item) => item.status === 'review_required')
      );
    } catch (requestError) {
      onError?.(requestError.message);
    }
  }

  async function uploadReceipt(event) {
    const file = event.target.files?.[0];
    if (!file || processingReceipt || receipt) return;

    if (!RECEIPT_ACCEPTED_TYPES.includes(file.type) || file.size > MAX_RECEIPT_SIZE_BYTES) {
      onError?.('Upload a JPG, PNG, or WebP file up to 5 MB.');
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    let keepPreview = false;
    onError?.('');
    setProcessingReceipt({ file, previewUrl });

    try {
      const result = await expenseApi.upload(file);
      keepPreview = true;
      setReceipt({
        id: result.receipt.id,
        file,
        previewUrl,
        localPreview: true,
        draft: result.receipt.extraction,
      });
    } catch (requestError) {
      onError?.(requestError.message);
    } finally {
      setProcessingReceipt(null);
      if (!keepPreview) URL.revokeObjectURL(previewUrl);
      event.target.value = '';
    }
  }

  function closeReceiptReview() {
    setReceipt((current) => {
      if (current?.localPreview && current.previewUrl) {
        URL.revokeObjectURL(current.previewUrl);
      }
      return null;
    });
  }

  async function confirmReceipt(finalTransaction) {
    if (!receipt) return;
    try {
      await expenseApi.confirmReceipt(receipt.id, finalTransaction);
      await onTransactionSaved?.();
      await loadPendingReviews();
      closeReceiptReview();
    } catch (requestError) {
      onError?.(requestError.message);
    }
  }

  async function discardReceipt() {
    if (!receipt) return;
    try {
      await expenseApi.deleteReceipt(receipt.id);
      await loadPendingReviews();
      closeReceiptReview();
    } catch (requestError) {
      onError?.(requestError.message);
    }
  }

  async function resumePendingReview(pendingReceipt) {
    if (processingReceipt || receipt) return;
    try {
      setPendingActionId(pendingReceipt.id);
      onError?.('');
      const preview = await expenseApi.previewReceipt(pendingReceipt.id);
      setReceipt({
        id: pendingReceipt.id,
        file: { name: pendingReceipt.filename, size: pendingReceipt.size },
        previewUrl: preview.url,
        localPreview: false,
        draft: pendingReceipt.extraction,
      });
    } catch (requestError) {
      onError?.(requestError.message);
    } finally {
      setPendingActionId(null);
    }
  }

  async function discardPendingReview(pendingReceipt) {
    try {
      setPendingActionId(pendingReceipt.id);
      onError?.('');
      await expenseApi.deleteReceipt(pendingReceipt.id);
      await loadPendingReviews();
    } catch (requestError) {
      onError?.(requestError.message);
    } finally {
      setPendingActionId(null);
    }
  }

  return (
    <div className="upload-card" aria-busy={Boolean(processingReceipt)}>
      <h2>Upload a receipt</h2>
      <p>
        Upload an image to prepare an expense transaction. You will always review
        and confirm the extracted data before it is saved.
      </p>

      {!processingReceipt && !receipt && pendingReviews.length > 0 && (
        <section className="pending-receipts" aria-label="Pending receipt reviews">
          <div>
            <p className="eyebrow">PENDING REVIEW</p>
            <h3>Finish a previous receipt</h3>
            <p>Your extracted receipt details are saved until you confirm or discard them.</p>
          </div>
          <ul>
            {pendingReviews.map((pendingReceipt) => (
              <li key={pendingReceipt.id}>
                <div>
                  <strong>{pendingReceipt.filename}</strong>
                  <small>
                    {pendingReceipt.extraction?.merchant || 'Receipt draft'}
                    {pendingReceipt.extraction?.totalAmount
                      ? ` · ${formatMoney(pendingReceipt.extraction.totalAmount)}`
                      : ''} ·{' '}
                    {pendingReceipt.createdAt
                      ? new Date(pendingReceipt.createdAt).toLocaleDateString()
                      : 'Pending'}
                  </small>
                </div>
                <div className="pending-receipt-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => discardPendingReview(pendingReceipt)}
                    disabled={Boolean(pendingActionId)}
                  >
                    {pendingActionId === pendingReceipt.id ? 'Working…' : 'Discard'}
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => resumePendingReview(pendingReceipt)}
                    disabled={Boolean(pendingActionId)}
                  >
                    {pendingActionId === pendingReceipt.id ? 'Opening…' : 'Resume review'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!processingReceipt && !receipt && (
        <label className="upload-zone">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={uploadReceipt}
          />
          <strong>Choose a receipt image</strong>
          <small>JPG, PNG, or WebP · maximum 5 MB</small>
        </label>
      )}

      {processingReceipt && (
        <section className="receipt-processing" role="status" aria-live="polite">
          <img
            src={processingReceipt.previewUrl}
            alt={`Selected receipt: ${processingReceipt.file.name}`}
          />
          <div>
            <p className="eyebrow">PROCESSING RECEIPT</p>
            <h3>Reading {processingReceipt.file.name}</h3>
            <p>
              Uploading the image and extracting its details with Gemini. Please wait before
              choosing another receipt.
            </p>
          </div>
          <span className="receipt-spinner" aria-hidden="true" />
        </section>
      )}

      {receipt && (
        <ReceiptReview
          file={receipt.file}
          previewUrl={receipt.previewUrl}
          draft={receipt.draft}
          onConfirm={confirmReceipt}
          onDiscard={discardReceipt}
        />
      )}
    </div>
  );
}
