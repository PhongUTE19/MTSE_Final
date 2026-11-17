import { AppError, handleDatabaseError } from '../../shared/errors/index.js';
import { HTTP_STATUS } from '../../constants/index.js';
import { createUserScopedSupabaseClient } from '../../shared/integrations/supabase.js';
import { TRANSACTION_MESSAGES } from './transaction.constant.js';

const TRANSACTIONS_TABLE = 'expense_transactions';
let clientFactory = null;

/** @internal Test seam; production creates a fresh RLS-aware client per request. */
export function setExpenseClientFactoryForTests(factory) {
  clientFactory = factory;
}

function clientFor(user) {
  const client = clientFactory ? clientFactory(user) : createUserScopedSupabaseClient(user.token);
  if (!client) throw new AppError('Expense persistence is not configured.', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  return client;
}

function databaseError(error, operation = 'database operation') {
  return handleDatabaseError(
    'ExpenseRepository',
    operation,
    error,
    'Expense persistence is temporarily unavailable.'
  );
}

function notFound() {
  return new AppError(TRANSACTION_MESSAGES.TRANSACTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
}

/**
 * Encodes a user-supplied substring for safe interpolation inside a double-quoted
 * PostgREST `.or()` `ilike` filter value (`"..."`).
 *
 * Layer A (PostgREST filter grammar):
 * - Enclosing in `"..."` keeps `,`, `(`, `)`, `.`, and `:` literal inside the value.
 * - Escapes `"` as `\"` so user input cannot close the quoted literal and inject predicates.
 * - Doubles backslashes (`\` -> `\\\\`) so PostgREST's quoted-string unescaping yields `\\`
 *   for PostgreSQL `ILIKE`.
 *
 * Layer B (PostgreSQL `ILIKE` pattern semantics & PostgREST `*` alias):
 * - Escapes SQL `ILIKE` wildcards (`%`, `_`) so they match literally.
 * - Escapes PostgREST's `*` wildcard alias (`\\*`) so `*` cannot broaden the search
 *   into an unescaped `%` wildcard.
 *
 * @param {string} value
 * @returns {string}
 */
export function encodePostgrestIlikeTerm(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  const escaped = trimmed
    .replace(/\\/g, '\\\\\\\\')
    .replace(/"/g, '\\"')
    .replace(/%/g, '\\\\%')
    .replace(/_/g, '\\\\_')
    .replace(/\*/g, '\\\\*');
  return `"%${escaped}%"`;
}

export async function queryTransactionsPage(user, query) {
  const { search, type, category, from, to, minAmount, maxAmount, page, pageSize, sortBy, sortOrder } = query;
  let request = clientFor(user).from(TRANSACTIONS_TABLE).select('*', { count: 'exact' }).eq('user_id', user.id);
  if (type) request = request.eq('type', type);
  if (category) request = request.eq('category', category);
  if (from) request = request.gte('transaction_date', from);
  if (to) request = request.lte('transaction_date', to);
  if (minAmount !== undefined) request = request.gte('amount', minAmount);
  if (maxAmount !== undefined) request = request.lte('amount', maxAmount);
  const quotedTerm = encodePostgrestIlikeTerm(search);
  if (quotedTerm) {
    request = request.or(`merchant.ilike.${quotedTerm},note.ilike.${quotedTerm}`);
  }
  const column = sortBy === 'amount' ? 'amount' : 'transaction_date';
  const start = (page - 1) * pageSize;
  const { data, count, error } = await request
    .order(column, { ascending: sortOrder === 'asc' })
    .range(start, start + pageSize - 1);
  if (error) throw databaseError(error, 'List transactions');
  return { rows: data || [], total: count || 0 };
}

export async function queryTransactionsForSummary(user, period, batchSize) {
  const buildQuery = () =>
    clientFor(user)
      .from(TRANSACTIONS_TABLE)
      .select('type,amount,category', { count: 'exact' })
      .eq('user_id', user.id)
      .gte('transaction_date', period.from)
      .lte('transaction_date', period.to);

  const firstPage = await buildQuery().order('transaction_date', { ascending: false }).range(0, batchSize - 1);
  if (firstPage.error) throw databaseError(firstPage.error, 'Summary query');

  const rows = [...(firstPage.data || [])];
  const total = firstPage.count || 0;
  for (let start = batchSize; start < total; start += batchSize) {
    const page = await buildQuery().order('transaction_date', { ascending: false }).range(start, start + batchSize - 1);
    if (page.error) throw databaseError(page.error, 'Summary query');
    rows.push(...(page.data || []));
  }
  return rows;
}

export async function findTransactionById(user, id) {
  const { data, error } = await clientFor(user)
    .from(TRANSACTIONS_TABLE)
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw databaseError(error, 'Transaction lookup');
  if (!data) throw notFound();

  const { data: receiptData, error: receiptError } = await clientFor(user)
    .from('receipts')
    .select('id, status')
    .eq('transaction_id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (receiptError) throw databaseError(receiptError, 'Linked receipt lookup');

  return { row: data, receiptRow: receiptData };
}

export async function findOwnedTransactionRow(user, id) {
  const { data, error } = await clientFor(user)
    .from(TRANSACTIONS_TABLE)
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw databaseError(error, 'Transaction lookup');
  return data || null;
}

export async function insertTransaction(user, rowPayload) {
  const { data, error } = await clientFor(user)
    .from(TRANSACTIONS_TABLE)
    .insert({ ...rowPayload, user_id: user.id })
    .select('*')
    .single();
  if (error) {
    if (error.code === '23505') {
      const conflictError = new AppError('Transaction ID already exists.', HTTP_STATUS.CONFLICT);
      conflictError.code = '23505';
      throw conflictError;
    }
    throw databaseError(error, 'Create transaction');
  }
  return data;
}

export async function updateTransactionById(user, id, rowPayload) {
  const { data, error } = await clientFor(user)
    .from(TRANSACTIONS_TABLE)
    .update(rowPayload)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('*')
    .maybeSingle();
  if (error) throw databaseError(error, 'Update transaction');
  if (!data) throw notFound();
  return data;
}

export async function deleteTransactionById(user, id) {
  const { data, error } = await clientFor(user)
    .from(TRANSACTIONS_TABLE)
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
    .select('*')
    .maybeSingle();
  if (error?.code === '23503') {
    throw new AppError(TRANSACTION_MESSAGES.TRANSACTION_LINKED_TO_RECEIPT, HTTP_STATUS.CONFLICT);
  }
  if (error) throw databaseError(error, 'Transaction deletion');
  if (!data) throw notFound();
  return data;
}
