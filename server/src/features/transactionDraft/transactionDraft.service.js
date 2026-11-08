import { AppError, NotFoundError } from '../../shared/errors/index.js';
import { HTTP_STATUS } from '../../constants/index.js';
import * as repository from './transactionDraft.repository.js';
import { isValidIsoCalendarDate } from './transactionDraft.schema.js';

function formatDraft(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    sourceType: row.source_type,
    receiptId: row.receipt_id,
    receiptExtractionId: row.receipt_extraction_id,
    sourceRef: row.source_ref,
    originalData: row.original_data || {},
    reviewedData: row.reviewed_data || null,
    status: row.status,
    transactionId: row.transaction_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    confirmedAt: row.confirmed_at || null,
    rejectedAt: row.rejected_at || null,
  };
}

function formatTransaction(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    amount: Number(row.amount),
    date: row.transaction_date || row.date,
    category: row.category,
    merchant: row.merchant,
    note: row.note || '',
    items: row.items || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validateFinalTransaction(data) {
  const merchant = typeof data?.merchant === 'string' ? data.merchant.trim() : '';
  const amount = Number(data?.amount);
  const date = data?.date || data?.transaction_date;

  if (!merchant) {
    throw new AppError('Merchant or description is required before saving.', HTTP_STATUS.BAD_REQUEST);
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError('Amount must be greater than zero before saving.', HTTP_STATUS.BAD_REQUEST);
  }
  if (!isValidIsoCalendarDate(date)) {
    throw new AppError('A valid calendar date (YYYY-MM-DD) is required before saving.', HTTP_STATUS.BAD_REQUEST);
  }
  if (!data?.category || typeof data.category !== 'string') {
    throw new AppError('Category is required before saving.', HTTP_STATUS.BAD_REQUEST);
  }

  return {
    type: data.type === 'income' ? 'income' : 'expense',
    amount,
    date,
    category: data.category.trim(),
    merchant,
    note: typeof data.note === 'string' ? data.note.trim() : '',
    items: Array.isArray(data.items) ? data.items : [],
  };
}

export async function listDrafts(user, status = 'pending_review') {
  const rows = await repository.listDrafts(user, status);
  return rows.map(formatDraft);
}

export async function getDraft(user, id) {
  const row = await repository.findById(user, id);
  if (!row) {
    throw new NotFoundError('Transaction draft not found.');
  }
  return formatDraft(row);
}

export async function createDraft({ user, sourceType, receiptId, receiptExtractionId, sourceRef, data }) {
  if (receiptExtractionId) {
    const existing = await repository.findByReceiptExtractionId(user, receiptExtractionId);
    if (existing) {
      return formatDraft(existing);
    }
  }

  const row = await repository.insertDraft(user, {
    sourceType,
    receiptId,
    receiptExtractionId,
    sourceRef,
    data,
  });

  return formatDraft(row);
}

export async function patchDraft(user, id, patchPayload) {
  const existing = await repository.findById(user, id);
  if (!existing) {
    throw new NotFoundError('Transaction draft not found.');
  }
  if (existing.status !== 'pending_review') {
    throw new AppError('Only pending drafts can be updated.', HTTP_STATUS.BAD_REQUEST);
  }

  const incomingReviewed = patchPayload?.reviewedData || patchPayload;
  const mergedReviewed = {
    ...(existing.reviewed_data || existing.original_data || {}),
    ...incomingReviewed,
  };

  const updated = await repository.updateReviewedData(user, id, mergedReviewed);
  return formatDraft(updated || existing);
}

export async function confirmDraft(user, id, reviewedFields = {}) {
  const draft = await repository.findById(user, id);
  if (!draft) {
    throw new NotFoundError('Transaction draft not found.');
  }

  // Idempotency: re-confirming an already confirmed draft returns the existing transaction
  if (draft.status === 'confirmed') {
    let txId = draft.transaction_id;
    if (!txId && draft.source_type === 'receipt_extraction' && draft.receipt_id) {
      const receipt = await repository.findReceiptById(user, draft.receipt_id);
      if (receipt?.transaction_id) {
        txId = receipt.transaction_id;
        await repository.linkTransactionId(user, id, txId);
      }
    }

    if (txId) {
      const tx = await repository.findTransactionById(user, txId);
      return {
        draft: formatDraft({ ...draft, transaction_id: txId }),
        transaction: formatTransaction(tx),
      };
    }
    return {
      draft: formatDraft(draft),
      transaction: null,
    };
  }

  if (draft.status === 'rejected') {
    throw new AppError('Cannot confirm a rejected transaction draft.', HTTP_STATUS.BAD_REQUEST);
  }

  if (draft.status !== 'pending_review') {
    throw new AppError(`Cannot confirm draft with status "${draft.status}".`, HTTP_STATUS.BAD_REQUEST);
  }

  const mergedData = {
    ...(draft.original_data || {}),
    ...(draft.reviewed_data || {}),
    ...(reviewedFields || {}),
  };

  const validated = validateFinalTransaction(mergedData);

  // Atomic claim
  const claimed = await repository.claimDraftForConfirmation(user, id, validated);
  if (!claimed) {
    // Check if another request confirmed it concurrently
    const recheck = await repository.findById(user, id);
    if (recheck?.status === 'confirmed') {
      let txId = recheck.transaction_id;
      if (!txId && recheck.source_type === 'receipt_extraction' && recheck.receipt_id) {
        const receipt = await repository.findReceiptById(user, recheck.receipt_id);
        if (receipt?.transaction_id) {
          txId = receipt.transaction_id;
          await repository.linkTransactionId(user, id, txId);
        }
      }
      if (txId) {
        const tx = await repository.findTransactionById(user, txId);
        return {
          draft: formatDraft({ ...recheck, transaction_id: txId }),
          transaction: formatTransaction(tx),
        };
      }
    }
    throw new AppError('Draft is no longer pending review.', HTTP_STATUS.CONFLICT);
  }

  let transaction = null;
  let transactionCreated = false;

  try {
    if (draft.source_type === 'receipt_extraction') {
      if (!draft.receipt_id) {
        throw new AppError('Receipt extraction draft missing receipt reference.', HTTP_STATUS.INTERNAL_SERVER_ERROR);
      }
      const createdRpcTx = await repository.confirmReceiptTransactionRpc(user, draft.receipt_id, validated);
      transaction = createdRpcTx;
      transactionCreated = Boolean(transaction?.id);
    } else {
      // Assistant proposal or generic draft
      const createdTx = await repository.createExpenseTransaction(user, validated);
      transaction = createdTx;
      transactionCreated = Boolean(transaction?.id);
    }

    if (transaction?.id) {
      await repository.linkTransactionId(user, id, transaction.id);
    }
  } catch (creationError) {
    // Failure compensation:
    // If the transaction was not created, release the claim so the draft reverts to pending_review
    if (!transactionCreated) {
      let existingTxId = null;
      if (draft.source_type === 'receipt_extraction' && draft.receipt_id) {
        try {
          const receipt = await repository.findReceiptById(user, draft.receipt_id);
          if (receipt?.transaction_id) {
            existingTxId = receipt.transaction_id;
          }
        } catch {
          // ignore lookup errors during recovery
        }
      }

      if (existingTxId) {
        await repository.linkTransactionId(user, id, existingTxId);
        const tx = await repository.findTransactionById(user, existingTxId);
        return {
          draft: formatDraft({ ...claimed, transaction_id: existingTxId }),
          transaction: formatTransaction(tx),
        };
      } else {
        await repository.releaseClaim(user, id);
      }
    }
    throw creationError;
  }

  return {
    draft: formatDraft({ ...claimed, transaction_id: transaction?.id }),
    transaction: formatTransaction(transaction),
  };
}

export async function rejectDraft(user, id) {
  const draft = await repository.findById(user, id);
  if (!draft) {
    throw new NotFoundError('Transaction draft not found.');
  }

  if (draft.status === 'rejected') {
    return { draft: formatDraft(draft) };
  }

  if (draft.status === 'confirmed') {
    throw new AppError('Cannot reject an already confirmed transaction draft.', HTTP_STATUS.BAD_REQUEST);
  }

  const rejected = await repository.markRejected(user, id);
  return { draft: formatDraft(rejected || draft) };
}
