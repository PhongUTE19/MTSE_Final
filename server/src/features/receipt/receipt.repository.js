import { AppError, NotFoundError, handleDatabaseError } from '../../shared/errors/index.js';
import { HTTP_STATUS } from '../../constants/index.js';
import { createUserScopedSupabaseClient, getSupabaseClient } from '../../shared/integrations/supabase.js';

const TABLE = 'receipts';
const RECEIPT_BUCKET = 'receipts';
let clientFactory = null;

export function setReceiptClientFactoryForTests(factory) {
  clientFactory = factory || null;
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

export function dbError(operation, error) {
  return handleDatabaseError(
    'ReceiptRepository',
    operation,
    error,
    'Receipt service is temporarily unavailable.'
  );
}

function unwrap(data, error, operation = 'Supabase operation') {
  if (error) throw dbError(operation, error);
  return data;
}

function firstRow(data) {
  return Array.isArray(data) ? data[0] : data;
}

export async function callUserRpc(user, fn, args) {
  const { data, error } = await userClient(user).rpc(fn, args);
  return firstRow(unwrap(data, error, `RPC ${fn}`));
}

export async function callServerRpc(fn, args) {
  const { data, error } = await serverClient().rpc(fn, args);
  return firstRow(unwrap(data, error, `Server RPC ${fn}`));
}

export async function findOwnedReceipt(user, id) {
  const { data, error } = await userClient(user)
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw dbError('Receipt ownership lookup', error);
  if (!data) throw new NotFoundError('Receipt not found.');
  return data;
}

export async function findReceiptIdByTransaction(user, transactionId) {
  const { data, error } = await userClient(user)
    .from(TABLE)
    .select('id')
    .eq('transaction_id', transactionId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) throw dbError('Linked receipt lookup', error);
  return data?.id || null;
}

export async function findReceiptByStoragePath(user, storagePath) {
  const client = userClient(user);
  if (typeof client.from !== 'function') return null;

  const { data, error } = await client
    .from(TABLE)
    .select('*')
    .eq('storage_path', storagePath)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) throw dbError('Receipt confirmation lookup', error);
  return data || null;
}

export async function findConfirmedTransactionById(user, transactionId) {
  const client = userClient(user);
  if (typeof client.from !== 'function') return null;

  const { data, error } = await client
    .from('expense_transactions')
    .select('*')
    .eq('id', transactionId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) throw dbError('Confirmed transaction lookup', error);
  return data || null;
}

export async function listUserReceipts(user, limit = 50) {
  const { data, error } = await userClient(user)
    .from(TABLE)
    .select('*')
    .neq('status', 'deleted')
    .order('created_at', { ascending: false })
    .limit(limit);

  return unwrap(data, error, 'Receipt history lookup');
}

export async function uploadReceiptObject(storagePath, buffer, contentType) {
  const { error } = await serverClient()
    .storage
    .from(RECEIPT_BUCKET)
    .upload(storagePath, buffer, { contentType, upsert: false });
  return error || null;
}

export async function downloadReceiptObject(storagePath) {
  const { data, error } = await serverClient().storage.from(RECEIPT_BUCKET).download(storagePath);
  if (error || !data) throw dbError('Receipt download for retry', error);
  return Buffer.from(await data.arrayBuffer());
}

export async function removeReceiptObject(storagePath) {
  const { error } = await serverClient().storage.from(RECEIPT_BUCKET).remove([storagePath]);
  if (error) throw error;
}

export async function createReceiptPreviewUrl(storagePath, expiresInSeconds = 60) {
  const { data, error } = await serverClient()
    .storage
    .from(RECEIPT_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error || !data?.signedUrl) throw dbError('Receipt preview signing', error);
  return data.signedUrl;
}
