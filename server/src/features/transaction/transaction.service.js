import { AppError } from '../../shared/errors/index.js';
import { HTTP_STATUS } from '../../constants/index.js';
import {
  setExpenseClientFactoryForTests,
  queryTransactionsPage,
  queryTransactionsForSummary,
  findTransactionById,
  findOwnedTransactionRow,
  insertTransaction,
  updateTransactionById,
  deleteTransactionById,
} from './transaction.repository.js';

const SUMMARY_BATCH_SIZE = 1000;

export { setExpenseClientFactoryForTests };

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
    ...(input.id ? { id: input.id } : {}),
    type: input.type,
    amount: input.amount,
    transaction_date: input.date,
    category: input.category,
    merchant: input.merchant,
    note: input.note || '',
    items: input.items || [],
  };
}

function transactionRowsMatch(row, input) {
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

function toMoneyCents(value) {
  // Sum using integer cents so JavaScript floating-point (0.1 + 0.2) does not cause rounding errors.
  return Math.round(Number(value) * 100);
}

function fromMoneyCents(cents) {
  return cents / 100;
}

export async function listTransactions(user, query) {
  const { page, pageSize } = query;
  const { rows, total } = await queryTransactionsPage(user, query);
  return { transactions: rows.map(toTransaction), total, page, pageSize };
}

/**
 * Calculates summary report from all transactions for a user within a period.
 * Does not use listTransactions because listTransactions is paginated for UI display.
 */
export async function getSpendingSummary(user, period) {
  const rows = await queryTransactionsForSummary(user, period, SUMMARY_BATCH_SIZE);

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
  const { row, receiptRow } = await findTransactionById(user, id);
  const transaction = toTransaction(row);
  transaction.receipt = receiptRow && receiptRow.status
    ? { id: receiptRow.id, status: receiptRow.status }
    : null;
  return transaction;
}

export async function createTransaction(user, input) {
  if (input.id) {
    const existing = await findOwnedTransactionRow(user, input.id);
    if (existing) {
      if (!transactionRowsMatch(existing, input)) {
        throw new AppError('Transaction ID already exists with conflicting data.', HTTP_STATUS.CONFLICT);
      }
      return toTransaction(existing);
    }
  }

  try {
    const data = await insertTransaction(user, toRow(input));
    return toTransaction(data);
  } catch (error) {
    if (input.id && (error?.code === '23505' || error?.statusCode === HTTP_STATUS.CONFLICT)) {
      const existing = await findOwnedTransactionRow(user, input.id);
      if (existing && transactionRowsMatch(existing, input)) {
        return toTransaction(existing);
      }
      throw new AppError('Transaction ID already exists with conflicting data.', HTTP_STATUS.CONFLICT);
    }
    throw error;
  }
}

export async function updateTransaction(user, id, input) {
  const data = await updateTransactionById(user, id, toRow(input));
  return toTransaction(data);
}

export async function deleteTransaction(user, id) {
  const data = await deleteTransactionById(user, id);
  return toTransaction(data);
}
