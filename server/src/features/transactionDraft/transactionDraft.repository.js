import { AppError, handleDatabaseError } from '../../shared/errors/index.js';
import { HTTP_STATUS } from '../../constants/index.js';
import { createUserScopedSupabaseClient, getSupabaseClient } from '../../shared/integrations/supabase.js';

const TABLE = 'transaction_drafts';
const TRANSACTIONS_TABLE = 'expense_transactions';

let clientFactory = null;

export function setDraftClientFactoryForTests(factory) {
  clientFactory = factory;
}

function userClient(user) {
  const client = clientFactory
    ? (typeof clientFactory.user === 'function' ? clientFactory.user(user) : clientFactory(user))
    : createUserScopedSupabaseClient(user.token);

  if (!client) {
    throw new AppError('Transaction drafts persistence is not configured.', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
  return client;
}

function dbError(operation, error) {
  return handleDatabaseError(
    'TransactionDraftsRepository',
    operation,
    error,
    'Transaction drafts persistence is temporarily unavailable.'
  );
}

function result(data, error, operation = 'Drafts database operation') {
  if (error) throw dbError(operation, error);
  return data;
}

function one(data) {
  return Array.isArray(data) ? data[0] : data;
}

export async function findById(user, id) {
  const { data, error } = await userClient(user)
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  return result(data, error, 'Find draft by ID');
}

export async function findByReceiptExtractionId(user, receiptExtractionId) {
  const { data, error } = await userClient(user)
    .from(TABLE)
    .select('*')
    .eq('receipt_extraction_id', receiptExtractionId)
    .eq('user_id', user.id)
    .maybeSingle();

  return result(data, error, 'Find draft by extraction ID');
}

export async function listDrafts(user, status = 'pending_review') {
  let query = userClient(user)
    .from(TABLE)
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  return result(data || [], error, 'List transaction drafts');
}

export async function insertDraft(user, draftData) {
  const row = {
    user_id: user.id,
    source_type: draftData.sourceType,
    receipt_id: draftData.receiptId || null,
    receipt_extraction_id: draftData.receiptExtractionId || null,
    source_ref: draftData.sourceRef || null,
    original_data: draftData.data || {},
    reviewed_data: null,
    status: 'pending_review',
  };

  const { data, error } = await userClient(user)
    .from(TABLE)
    .insert(row)
    .select()
    .single();

  return result(data, error, 'Insert transaction draft');
}

export async function updateReviewedData(user, id, reviewedData) {
  const { data, error } = await userClient(user)
    .from(TABLE)
    .update({
      reviewed_data: reviewedData,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('status', 'pending_review')
    .select()
    .maybeSingle();

  return result(data, error, 'Update draft reviewed data');
}

export async function claimDraftForConfirmation(user, id, reviewedData) {
  const updatePayload = {
    status: 'confirmed',
    confirmed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (reviewedData) {
    updatePayload.reviewed_data = reviewedData;
  }

  const { data, error } = await userClient(user)
    .from(TABLE)
    .update(updatePayload)
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('status', 'pending_review')
    .select()
    .maybeSingle();

  return result(data, error, 'Claim draft for confirmation');
}

export async function linkTransactionId(user, draftId, transactionId) {
  const { data, error } = await userClient(user)
    .from(TABLE)
    .update({
      transaction_id: transactionId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', draftId)
    .eq('user_id', user.id)
    .select()
    .maybeSingle();

  return result(data, error, 'Link transaction ID to draft');
}

export async function markRejected(user, id) {
  const { data, error } = await userClient(user)
    .from(TABLE)
    .update({
      status: 'rejected',
      rejected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('status', 'pending_review')
    .select()
    .maybeSingle();

  return result(data, error, 'Mark draft rejected');
}

export async function findTransactionById(user, transactionId) {
  const { data, error } = await userClient(user)
    .from(TRANSACTIONS_TABLE)
    .select('*')
    .eq('id', transactionId)
    .eq('user_id', user.id)
    .maybeSingle();

  return result(data, error, 'Find transaction by ID');
}

export async function createExpenseTransaction(user, transactionInput) {
  const row = {
    user_id: user.id,
    type: transactionInput.type || 'expense',
    amount: transactionInput.amount,
    transaction_date: transactionInput.date,
    category: transactionInput.category,
    merchant: transactionInput.merchant,
    note: transactionInput.note || '',
    items: transactionInput.items || [],
  };

  const { data, error } = await userClient(user)
    .from(TRANSACTIONS_TABLE)
    .insert(row)
    .select()
    .single();

  return result(data, error, 'Create expense transaction from draft');
}

export async function releaseClaim(user, id) {
  const { data, error } = await userClient(user)
    .from(TABLE)
    .update({
      status: 'pending_review',
      confirmed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('status', 'confirmed')
    .is('transaction_id', null)
    .select()
    .maybeSingle();

  return result(data, error, 'Release confirmation claim on draft');
}

export async function findReceiptById(user, receiptId) {
  const { data, error } = await userClient(user)
    .from('receipts')
    .select('id, status, transaction_id')
    .eq('id', receiptId)
    .eq('user_id', user.id)
    .maybeSingle();

  return result(data, error, 'Find receipt by ID');
}

export async function confirmReceiptTransactionRpc(user, receiptId, finalTransaction) {
  const { data, error } = await userClient(user).rpc('confirm_receipt_transaction', {
    p_receipt_id: receiptId,
    p_final_transaction: finalTransaction,
  });

  const parsed = result(one(data), error, 'RPC confirm_receipt_transaction');
  return parsed?.transaction || parsed;
}
