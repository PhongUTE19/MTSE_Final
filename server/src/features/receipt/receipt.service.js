import crypto from 'crypto';
import { ZodError } from 'zod';
import { AppError, ValidationError } from '../../shared/errors/index.js';
import { HTTP_STATUS, GUARDRAIL_CONFIG } from '../../constants/index.js';
import { config } from '../../config.js';
import { extractReceiptImage } from '../../shared/integrations/ai/index.js';
import { getReceiptPrompt, RECEIPT_PROMPT_ID, RECEIPT_PROMPT_VERSION } from './receiptPrompt.js';
import { enforceReceiptGuardrails } from './receiptGuardrails.js';
import { parseReceiptConfirmBody, RECEIPT_CATEGORIES, receiptExtractionSchema } from './receipt.schema.js';
import {
  setReceiptClientFactoryForTests,
  dbError,
  callUserRpc,
  callServerRpc,
  findOwnedReceipt,
  findReceiptIdByTransaction,
  findReceiptByStoragePath,
  findConfirmedTransactionById,
  listUserReceipts,
  uploadReceiptObject,
  downloadReceiptObject,
  removeReceiptObject,
  createReceiptPreviewUrl,
} from './receipt.repository.js';

let extractor = extractReceiptImage;
const inFlightConfirmations = new Map();

export function setReceiptDependenciesForTests(dependencies = {}) {
  setReceiptClientFactoryForTests(dependencies.clientFactory || null);
  extractor = dependencies.extractor || extractReceiptImage;
}

function publicReceipt(row, draft = null) {
  if (!row) return row;
  return {
    id: row.id,
    filename: row.original_filename,
    mimeType: row.mime_type,
    size: row.file_size,
    status: row.status,
    extraction: row.extraction || {},
    warnings: row.warnings || [],
    failureCode: row.error_code || null,
    attempts: row.attempts || 0,
    confirmedAt: row.confirmed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(draft ? { draft } : {}),
  };
}

export function toDraft(extraction) {
  const isForeignCurrency = Boolean(extraction.currency && extraction.currency !== 'VND');
  return {
    ...extraction,
    type: extraction.transactionType === 'income' ? 'income' : 'expense',
    date: extraction.transactionDate || '',
    amount: isForeignCurrency ? '' : (extraction.totalAmount ?? ''),
    ...(isForeignCurrency ? { foreignAmount: extraction.totalAmount ?? null } : {}),
    note: extraction.note || '',
    warnings: extraction.warnings || [],
  };
}

async function cleanUpTemporaryReceipt(user, receiptId, reason) {
  try {
    const receipt = await callUserRpc(user, 'begin_receipt_delete', { p_receipt_id: receiptId });
    await removeReceiptObject(receipt.storage_path);
    await callUserRpc(user, 'finalize_receipt_delete', { p_receipt_id: receiptId });
  } catch (cleanupError) {
    console.error('[ReceiptService] Temporary receipt cleanup failed', {
      receiptId,
      reason,
      code: cleanupError?.code ?? null,
      message: cleanupError?.message ?? null,
    });
  }
}

async function processStoredReceipt(user, receipt, image, options = {}) {
  const processing = await callUserRpc(user, 'start_receipt_processing', { p_receipt_id: receipt.id });

  try {
    const ai = await extractor(image, { timeoutMs: options?.timeoutMs || GUARDRAIL_CONFIG.DEFAULT_TIMEOUT_MS });
    const draft = toDraft(ai.extraction);

    const completed = await callServerRpc('server_complete_receipt_extraction', {
      p_receipt_id: receipt.id,
      p_processing_lease_id: processing.processing_lease_id,
      p_extraction: draft,
      p_warnings: draft.warnings,
    });

    return publicReceipt(completed, {
      id: receipt.id,
      sourceType: 'receipt_extraction',
      originalData: draft,
      warnings: draft.warnings,
    });
  } catch (error) {
    const isTimeout =
      error?.name === 'AIResponseTimeoutError' ||
      String(error?.message || '').toLowerCase().includes('timed out');
    console.error('[ReceiptService] Receipt extraction failed', {
      name: error?.name || 'Error',
      code: error?.receiptFailureCode || error?.code || null,
      receiptId: receipt.id,
      isTimeout,
    });
    const failureCode = error?.receiptFailureCode || (isTimeout ? 'EXTRACTION_TIMEOUT' : 'EXTRACTION_FAILED');

    try {
      await callServerRpc('server_mark_receipt_failed', {
        p_receipt_id: receipt.id,
        p_processing_lease_id: processing.processing_lease_id,
        p_error_code: failureCode,
      });
    } catch {
      // Best-effort error marking
    }

    const isPermanentRejection = ['NOT_A_RECEIPT', 'PROMPT_INJECTION_REJECTED'].includes(failureCode);
    if (isPermanentRejection) {
      await cleanUpTemporaryReceipt(user, receipt.id, failureCode);
    }
    throw new AppError(
      error?.safeMessage || (isTimeout ? 'Receipt extraction timed out. You can retry it.' : 'Receipt extraction could not be completed. You can retry it.'),
      error?.safeMessage ? HTTP_STATUS.BAD_REQUEST : HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}

function toPublicTransaction(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    amount: Number(row.amount),
    date: row.transaction_date,
    category: row.category,
    merchant: row.merchant,
    note: row.note || '',
    items: Array.isArray(row.items) ? row.items : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function transactionsMatch(row, input) {
  if (!row || !input) return false;
  return (
    row.type === input.type &&
    Number(row.amount) === Number(input.amount) &&
    row.transaction_date === input.date &&
    row.category === input.category &&
    row.merchant === input.merchant &&
    (row.note || '') === (input.note || '') &&
    JSON.stringify(row.items || []) === JSON.stringify(input.items || [])
  );
}

function isStorageAlreadyExistsError(error) {
  if (!error) return false;
  const code = String(error.statusCode || error.status || error.code || '');
  const msg = String(error.message || '').toLowerCase();
  return code === '409' || msg.includes('already exists') || msg.includes('duplicate');
}

function isConflictingRpcError(error) {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('conflicting draft confirmation') || msg.includes('ownership mismatch');
}

export async function uploadReceipt(user, file, meta, options = {}) {
  if (!user?.id) {
    throw new AppError('Authentication required.', HTTP_STATUS.UNAUTHORIZED);
  }
  if (!file?.buffer?.length) {
    throw new ValidationError('A receipt image is required.');
  }

  const promptVersion = RECEIPT_PROMPT_VERSION || 'receipt-v3';
  const defaultModel = config.geminiReceiptModel || config.geminiModel || 'gemini-2.5-flash';

  try {
    const ai = await extractor(
      { buffer: file.buffer, mimeType: meta.mimeType },
      {
        timeoutMs: options?.timeoutMs || GUARDRAIL_CONFIG.DEFAULT_TIMEOUT_MS,
        prompt: getReceiptPrompt(),
        promptId: RECEIPT_PROMPT_ID,
        promptVersion,
        schema: receiptExtractionSchema,
        categories: RECEIPT_CATEGORIES,
        guardrailsFn: enforceReceiptGuardrails,
      }
    );
    const extraction = toDraft(ai.extraction);
    const aiModel = ai.model || defaultModel;
    const draftId = crypto.randomUUID();
    const fileMeta = {
      filename: meta.filename,
      mimeType: meta.mimeType,
      size: meta.size,
      sha256: meta.sha256,
    };

    return {
      id: draftId,
      draftId,
      filename: meta.filename,
      mimeType: meta.mimeType,
      size: meta.size,
      sha256: meta.sha256,
      aiModel,
      promptVersion,
      status: 'extracted',
      extraction,
      warnings: extraction.warnings || [],
      draft: {
        id: draftId,
        sourceType: 'receipt_extraction',
        originalData: extraction,
        warnings: extraction.warnings || [],
        aiModel,
        promptVersion,
        fileMeta,
      },
    };
  } catch (error) {
    const isTimeout =
      error?.name === 'AIResponseTimeoutError' ||
      String(error?.message || '').toLowerCase().includes('timed out');
    console.error('[ReceiptService] Stateless receipt extraction failed', {
      name: error?.name || 'Error',
      code: error?.receiptFailureCode || error?.code || null,
      isTimeout,
    });
    throw new AppError(
      error?.safeMessage ||
        (isTimeout
          ? 'Receipt extraction timed out. Please try again.'
          : 'Receipt extraction could not be completed. Please try again.'),
      error?.safeMessage ? HTTP_STATUS.BAD_REQUEST : HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}

async function executeConfirmReceipt(user, file, meta, parsed) {
  const { draftId, sha256: clientSha256, transaction, extraction, warnings, aiModel, promptVersion } = parsed;
  if (clientSha256 && clientSha256.toLowerCase() !== meta.sha256.toLowerCase()) {
    throw new ValidationError('Uploaded receipt checksum does not match the staged draft.');
  }

  const storagePath = `${user.id}/${draftId}/original`;

  // 1. Check if already confirmed (idempotent retry or conflict detection before touching Storage)
  const existingReceipt = await findReceiptByStoragePath(user, storagePath);
  if (existingReceipt) {
    const existingTx = existingReceipt.transaction_id
      ? await findConfirmedTransactionById(user, existingReceipt.transaction_id)
      : null;

    if (
      existingReceipt.status !== 'confirmed' ||
      existingReceipt.sha256 !== meta.sha256 ||
      !transactionsMatch(existingTx, transaction)
    ) {
      throw new AppError('Draft has already been confirmed with different data.', HTTP_STATUS.CONFLICT);
    }

    return {
      receipt: publicReceipt(existingReceipt),
      transaction: toPublicTransaction(existingTx),
      idempotent: true,
    };
  }

  // 2. Upload original image to deterministic private Storage path
  let uploadedFreshObject = false;
  const uploadError = await uploadReceiptObject(storagePath, file.buffer, meta.mimeType);
  if (uploadError) {
    if (!isStorageAlreadyExistsError(uploadError)) {
      console.error('[ReceiptService] Confirm storage upload failed', {
        code: uploadError.code ?? null,
        message: uploadError.message ?? null,
        storagePath,
      });
      throw dbError('Storage upload', uploadError);
    }
  } else {
    uploadedFreshObject = true;
  }

  // 3. Atomically create Transaction + confirmed Receipt in PostgreSQL
  try {
    const rpcResult = await callUserRpc(user, 'confirm_staged_receipt_transaction', {
      p_draft_id: draftId,
      p_storage_path: storagePath,
      p_filename: meta.filename,
      p_mime_type: meta.mimeType,
      p_file_size: meta.size,
      p_sha256: meta.sha256,
      p_final_transaction: transaction,
      p_extraction: extraction,
      p_warnings: warnings,
      p_ai_model: aiModel,
      p_prompt_version: promptVersion,
    });

    return {
      receipt: publicReceipt(rpcResult?.receipt),
      transaction: toPublicTransaction(rpcResult?.transaction),
      idempotent: Boolean(rpcResult?.idempotent),
    };
  } catch (rpcError) {
    if (isConflictingRpcError(rpcError)) {
      throw new AppError('Draft has already been confirmed with different data.', HTTP_STATUS.CONFLICT);
    }

    if (uploadedFreshObject) {
      try {
        await removeReceiptObject(storagePath);
      } catch (cleanupError) {
        console.error('[ReceiptService] Compensating storage removal failed after RPC failure', {
          draftId,
          storagePath,
          rpcError: rpcError?.message ?? null,
          cleanupError: cleanupError?.message ?? null,
        });
      }
    }
    throw rpcError;
  }
}

export async function confirmReceipt(user, file, meta, rawBody) {
  if (!user?.id) {
    throw new AppError('Authentication required.', HTTP_STATUS.UNAUTHORIZED);
  }
  if (!file?.buffer?.length) {
    throw new ValidationError('A receipt image is required.');
  }

  let parsed;
  try {
    parsed = parseReceiptConfirmBody(rawBody);
  } catch (err) {
    if (err instanceof ZodError) {
      throw new ValidationError(err.issues[0]?.message || 'Invalid receipt confirmation payload.');
    }
    throw new ValidationError(err?.message || 'Invalid receipt confirmation payload.');
  }

  const lockKey = `${user.id}:${parsed.draftId}`;
  const existingFlight = inFlightConfirmations.get(lockKey);
  if (existingFlight) {
    return existingFlight;
  }

  const flightPromise = executeConfirmReceipt(user, file, meta, parsed).finally(() => {
    inFlightConfirmations.delete(lockKey);
  });
  inFlightConfirmations.set(lockKey, flightPromise);
  return flightPromise;
}

export async function listReceipts(user) {
  const rows = await listUserReceipts(user, 50);
  return rows.map((row) => publicReceipt(row));
}

export async function retryReceipt(user, id) {
  const receipt = await findOwnedReceipt(user, id);
  if (!['failed', 'review_required'].includes(receipt.status)) {
    throw new AppError('This receipt cannot be retried.', HTTP_STATUS.BAD_REQUEST);
  }

  await callUserRpc(user, 'retry_receipt_processing', { p_receipt_id: id });
  const buffer = await downloadReceiptObject(receipt.storage_path);

  return processStoredReceipt(
    user,
    { ...receipt, status: 'uploaded' },
    { buffer, mimeType: receipt.mime_type }
  );
}

export async function deleteConfirmedReceiptTransaction(user, transactionId) {
  const linkedId = await findReceiptIdByTransaction(user, transactionId);
  if (!linkedId) return null;

  const receipt = await callUserRpc(user, 'begin_confirmed_receipt_transaction_delete', {
    p_transaction_id: transactionId,
  });
  try {
    await removeReceiptObject(receipt.storage_path);
  } catch (storageError) {
    throw dbError('Linked receipt storage deletion', storageError);
  }
  return callUserRpc(user, 'finalize_confirmed_receipt_transaction_delete', {
    p_receipt_id: receipt.id,
    p_transaction_id: transactionId,
  });
}

export async function previewReceipt(user, id) {
  const expiresInSeconds = 60;
  const receipt = await callUserRpc(user, 'authorize_receipt_preview', { p_receipt_id: id });
  const url = await createReceiptPreviewUrl(receipt.storage_path, expiresInSeconds);
  return { url, expiresInSeconds };
}
