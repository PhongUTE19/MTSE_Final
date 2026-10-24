import { AppError } from '../../shared/errors/index.js';
import { HTTP_STATUS } from '../../constants/index.js';
import { createUserScopedSupabaseClient } from '../../shared/integrations/supabase.js';
import { EXPENSE_MESSAGES } from './expenses.constants.js';

const TRANSACTIONS_TABLE = 'expense_transactions';
const SUMMARY_BATCH_SIZE = 1000;
let clientFactory = null;

/** @internal Test seam; production creates a fresh RLS-aware client per request. */
export function setExpenseClientFactoryForTests(factory) { clientFactory = factory; }

function clientFor(user) {
  const client = clientFactory ? clientFactory(user) : createUserScopedSupabaseClient(user.token);
  if (!client) throw new AppError('Expense persistence is not configured.', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  return client;
}

function databaseError(error, operation = 'database operation') {
  // Do not leak PostgREST/schema details to clients.
  console.error(`[ExpenseService] ${operation} failed`, {
    code: error?.code ?? null,
    message: error?.message ?? null,
    details: error?.details ?? null,
  });
  return new AppError('Expense persistence is temporarily unavailable.', HTTP_STATUS.INTERNAL_SERVER_ERROR);
}

function notFound() { return new AppError(EXPENSE_MESSAGES.TRANSACTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND); }

// The public API retains the original camelCase/date shape while the database
// keeps its established snake_case transaction_date/timestamp columns.
function toTransaction(row) {
  if (!row) return row;
  return {
    id: row.id,
    type: row.type,
    amount: Number(row.amount),
    date: row.transaction_date,
    category: row.category,
    merchant: row.merchant,
    note: row.note || '',
    items: row.items || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRow(input) {
  return {
    type: input.type,
    amount: input.amount,
    transaction_date: input.date,
    category: input.category,
    merchant: input.merchant,
    note: input.note || '',
    items: input.items || [],
  };
}

function escapeSearch(value) { return value.replace(/[,%()]/g, '\\$&'); }

export async function listTransactions(user, query) {
  const { search, type, category, from, to, minAmount, maxAmount, page, pageSize, sortBy, sortOrder } = query;
  let request = clientFor(user).from(TRANSACTIONS_TABLE).select('*', { count: 'exact' }).eq('user_id', user.id);
  if (type) request = request.eq('type', type);
  if (category) request = request.eq('category', category);
  if (from) request = request.gte('transaction_date', from);
  if (to) request = request.lte('transaction_date', to);
  if (minAmount !== undefined) request = request.gte('amount', minAmount);
  if (maxAmount !== undefined) request = request.lte('amount', maxAmount);
  if (search) {
    const term = `%${escapeSearch(search)}%`;
    request = request.or(`merchant.ilike.${term},note.ilike.${term}`);
  }
  const column = sortBy === 'amount' ? 'amount' : 'transaction_date';
  const start = (page - 1) * pageSize;
  const { data, count, error } = await request.order(column, { ascending: sortOrder === 'asc' }).range(start, start + pageSize - 1);
  if (error) throw databaseError();
  return { transactions: (data || []).map(toTransaction), total: count || 0, page, pageSize };
}

function toMoneyCents(value) {
  // Cộng bằng số nguyên nhỏ nhất để 0.1 + 0.2 không tạo sai số JavaScript.
  return Math.round(Number(value) * 100);
}

function fromMoneyCents(cents) { return cents / 100; }

/**
 * Tính báo cáo từ toàn bộ giao dịch trong kỳ của một user. Đây không dùng
 * listTransactions vì listTransactions có pagination dành cho giao diện.
 */
export async function getSpendingSummary(user, period) {
  const buildQuery = () => {
    let request = clientFor(user)
      .from(TRANSACTIONS_TABLE)
      .select('type,amount,category', { count: 'exact' })
      .eq('user_id', user.id)
      .gte('transaction_date', period.from)
      .lte('transaction_date', period.to);
    return request;
  };

  const firstPage = await buildQuery().order('transaction_date', { ascending: false }).range(0, SUMMARY_BATCH_SIZE - 1);
  if (firstPage.error) throw databaseError(firstPage.error, 'Summary query');

  const rows = [...(firstPage.data || [])];
  const total = firstPage.count || 0;
  for (let start = SUMMARY_BATCH_SIZE; start < total; start += SUMMARY_BATCH_SIZE) {
    const page = await buildQuery().order('transaction_date', { ascending: false }).range(start, start + SUMMARY_BATCH_SIZE - 1);
    if (page.error) throw databaseError(page.error, 'Summary query');
    rows.push(...(page.data || []));
  }

  let incomeCents = 0;
  let expenseCents = 0;
  const categories = new Map();
  for (const row of rows) {
    const amountCents = toMoneyCents(row.amount);
    if (row.type === 'income') incomeCents += amountCents;
    if (row.type === 'expense') {
      expenseCents += amountCents;
      categories.set(row.category, (categories.get(row.category) || 0) + amountCents);
    }
  }

  return {
    period,
    totalIncome: fromMoneyCents(incomeCents),
    totalExpense: fromMoneyCents(expenseCents),
    balance: fromMoneyCents(incomeCents - expenseCents),
    topCategories: [...categories.entries()]
      .map(([category, cents]) => ({ category, amount: fromMoneyCents(cents) }))
      .sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category)),
  };
}

export async function getTransaction(user, id) {
  const { data, error } = await clientFor(user).from(TRANSACTIONS_TABLE).select('*').eq('id', id).eq('user_id', user.id).maybeSingle();
  if (error) throw databaseError();
  if (!data) throw notFound();
  return toTransaction(data);
}

export async function createTransaction(user, input) {
  const { data, error } = await clientFor(user).from(TRANSACTIONS_TABLE).insert({ ...toRow(input), user_id: user.id }).select('*').single();
  if (error) throw databaseError();
  return toTransaction(data);
}

export async function updateTransaction(user, id, input) {
  const { data, error } = await clientFor(user).from(TRANSACTIONS_TABLE).update(toRow(input)).eq('id', id).eq('user_id', user.id).select('*').maybeSingle();
  if (error) throw databaseError();
  if (!data) throw notFound();
  return toTransaction(data);
}

export async function deleteTransaction(user, id) {
  const { data, error } = await clientFor(user).from(TRANSACTIONS_TABLE).delete().eq('id', id).eq('user_id', user.id).select('*').maybeSingle();
  if (error?.code === '23503') {
    throw new AppError(EXPENSE_MESSAGES.TRANSACTION_LINKED_TO_RECEIPT, HTTP_STATUS.CONFLICT);
  }
  if (error) throw databaseError(error, 'Transaction deletion');
  if (!data) throw notFound();
  return toTransaction(data);
}

// This deliberately remains metadata-only. It neither uploads a file nor
// invokes an AI provider; authentication only scopes the draft operation.
export function createReceiptDraft(user, file) {
  return {
    id: `receipt_${Date.now()}`,
    filename: file.filename,
    status: 'draft',
    extraction: { merchant: '', date: new Date().toISOString().slice(0, 10), amount: '', currency: 'VND', category: 'Other expenses', items: [] },
  };
}
