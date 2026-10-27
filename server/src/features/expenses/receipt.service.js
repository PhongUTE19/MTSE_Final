import { AppError, NotFoundError, handleDatabaseError } from '../../shared/errors/index.js';
import { HTTP_STATUS, GUARDRAIL_CONFIG } from '../../constants/index.js';
import { createUserScopedSupabaseClient, getSupabaseClient } from '../../shared/integrations/supabase.js';
import { extractReceiptImage } from '../../shared/integrations/ai/index.js';

const TABLE = 'receipts';
let clientFactory = null;
let extractor = extractReceiptImage;

export function setReceiptDependenciesForTests(dependencies = {}) {
  clientFactory = dependencies.clientFactory || null;
  extractor = dependencies.extractor || extractReceiptImage;
}

function userClient(user) {
  const client = clientFactory
    ? clientFactory.user(user)
    : createUserScopedSupabaseClient(user.token);

  if (!client) {
    throw new AppError('Receipt service is not configured.', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
  return client;
}

function serverClient() {
  const client = clientFactory ? clientFactory.server() : getSupabaseClient();
  if (!client) {
    throw new AppError('Receipt storage is not configured.', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
  return client;
}

function dbError(operation, error) {
  return handleDatabaseError(
    'ReceiptService',
    operation,
    error,
    'Receipt service is temporarily unavailable.'
  );
}

function result(data, error, operation = 'Supabase operation') {
  if (error) throw dbError(operation, error);
  return data;
}

function one(data) {
  return Array.isArray(data) ? data[0] : data;
}

function publicReceipt(row) {
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
  };
}

function toDraft(extraction) {
  return {
    ...extraction,
    type: extraction.transactionType === 'income' ? 'income' : 'expense',
    date: extraction.transactionDate || '',
    amount: extraction.totalAmount ?? '',
    note: extraction.note || '',
    warnings: extraction.warnings || [],
  };
}

async function rpc(user, fn, args) {
  const { data, error } = await userClient(user).rpc(fn, args);
  return one(result(data, error, `RPC ${fn}`));
}

async function serverRpc(fn, args) {
  const { data, error } = await serverClient().rpc(fn, args);
  return one(result(data, error, `Server RPC ${fn}`));
}

async function ownedReceipt(user, id) {
  const { data, error } = await userClient(user)
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw dbError('Receipt ownership lookup', error);
  if (!data) throw new NotFoundError('Receipt not found.');
  return data;
}

async function cleanUpTemporaryReceipt(user, receiptId, reason) {
  // A row is needed to securely scope upload/processing, but unsuccessful
  // uploads must not become permanent receipt history. Use the existing
  // lock -> Storage delete -> row delete lifecycle so ownership is retained.
  try {
    const receipt = await rpc(user, 'begin_receipt_delete', { p_receipt_id: receiptId });
    const { error } = await serverClient().storage.from('receipts').remove([receipt.storage_path]);
    if (error) throw error;
    await rpc(user, 'finalize_receipt_delete', { p_receipt_id: receiptId });
  } catch (cleanupError) {
    // Do not hide the original upload/extraction error. A temporary row may
    // remain only when a cleanup dependency itself is unavailable, allowing a
    // later safe delete instead of orphaning an unknown Storage object.
    console.error('[ReceiptService] Temporary receipt cleanup failed', {
      receiptId,
      reason,
      code: cleanupError?.code ?? null,
      message: cleanupError?.message ?? null,
    });
  }
}

async function processStoredReceipt(user, receipt, image, options = {}) {
  const processing = await rpc(user, 'start_receipt_processing', { p_receipt_id: receipt.id });
  try {
    const ai = await extractor(image, { timeoutMs: options?.timeoutMs || GUARDRAIL_CONFIG.DEFAULT_TIMEOUT_MS });
    const draft = toDraft(ai.extraction);
    const completed = await serverRpc('server_complete_receipt_extraction', {
      p_receipt_id: receipt.id,
      p_processing_lease_id: processing.processing_lease_id,
      p_extraction: draft,
      p_warnings: draft.warnings,
    });
    return publicReceipt(completed);
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
      await serverRpc('server_mark_receipt_failed', {
        p_receipt_id: receipt.id,
        p_processing_lease_id: processing.processing_lease_id,
        p_error_code: failureCode,
      });
    } catch {
      // Best-effort error marking
    }
    // Only clean up temporary uploads for permanent guardrail rejections
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

export async function uploadReceipt(user, file, meta) {
  const receipt = await rpc(user, 'create_receipt_upload', {
    p_filename: meta.filename,
    p_mime_type: meta.mimeType,
    p_file_size: meta.size,
    p_sha256: meta.sha256,
  });

  const { error: uploadError } = await serverClient()
    .storage
    .from('receipts')
    .upload(receipt.storage_path, file.buffer, {
      contentType: meta.mimeType,
      upsert: false,
    });

  if (uploadError) {
    console.error('[ReceiptService] Storage upload failed', {
      code: uploadError.code ?? null,
      message: uploadError.message ?? null,
    });
    await cleanUpTemporaryReceipt(user, receipt.id, 'STORAGE_UPLOAD_FAILED');
    throw dbError('Storage upload', uploadError);
  }

  return processStoredReceipt(user, receipt, { buffer: file.buffer, mimeType: meta.mimeType });
}

export async function listReceipts(user) {
  const { data, error } = await userClient(user)
    .from(TABLE)
    .select('*')
    .neq('status', 'deleted')
    .order('created_at', { ascending: false })
    .limit(50);

  return result(data, error, 'Receipt history lookup').map(publicReceipt);
}

export async function retryReceipt(user, id) {
  const receipt = await ownedReceipt(user, id);
  if (!['failed', 'review_required'].includes(receipt.status)) {
    throw new AppError('This receipt cannot be retried.', HTTP_STATUS.BAD_REQUEST);
  }

  await rpc(user, 'retry_receipt_processing', { p_receipt_id: id });
  const { data, error } = await serverClient().storage.from('receipts').download(receipt.storage_path);
  if (error || !data) throw dbError('Receipt download for retry', error);

  return processStoredReceipt(
    user,
    { ...receipt, status: 'uploaded' },
    { buffer: Buffer.from(await data.arrayBuffer()), mimeType: receipt.mime_type }
  );
}

export async function confirmReceipt(user, id, finalTransaction) {
  const { data, error } = await userClient(user).rpc('confirm_receipt_transaction', {
    p_receipt_id: id,
    p_final_transaction: finalTransaction,
  });
  return result(one(data), error, 'RPC confirm_receipt_transaction');
}

export async function deleteReceipt(user, id) {
  const receipt = await rpc(user, 'begin_receipt_delete', { p_receipt_id: id });
  const { error } = await serverClient().storage.from('receipts').remove([receipt.storage_path]);
  if (error) throw dbError('Storage deletion', error);
  return publicReceipt(await rpc(user, 'finalize_receipt_delete', { p_receipt_id: id }));
}

export async function deleteConfirmedReceiptTransaction(user, transactionId) {
  const { data, error } = await userClient(user)
    .from(TABLE)
    .select('id')
    .eq('transaction_id', transactionId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) throw dbError('Linked receipt lookup', error);
  if (!data) return null;

  const receipt = await rpc(user, 'begin_confirmed_receipt_transaction_delete', {
    p_transaction_id: transactionId,
  });
  const { error: storageError } = await serverClient()
    .storage
    .from('receipts')
    .remove([receipt.storage_path]);

  if (storageError) throw dbError('Linked receipt storage deletion', storageError);
  return await rpc(user, 'finalize_confirmed_receipt_transaction_delete', {
    p_receipt_id: receipt.id,
    p_transaction_id: transactionId,
  });
}

export async function previewReceipt(user, id) {
  const receipt = await rpc(user, 'authorize_receipt_preview', { p_receipt_id: id });
  const { data, error } = await serverClient()
    .storage
    .from('receipts')
    .createSignedUrl(receipt.storage_path, 60);

  if (error || !data?.signedUrl) throw dbError('Receipt preview signing', error);
  return { url: data.signedUrl, expiresInSeconds: 60 };
}
