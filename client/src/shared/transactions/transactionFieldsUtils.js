import { EXPENSE_CATEGORIES, INITIAL_TRANSACTION } from './expenseConstants.js';
import { categoriesForType } from './expenseCategories.js';

export const DEFAULT_TRANSACTION_LABELS = Object.freeze({
  type: 'Type',
  typeExpense: 'Expense',
  typeIncome: 'Income',
  amount: 'Amount',
  date: 'Date',
  category: 'Category',
  merchant: 'Merchant or description',
  note: 'Note',
});

export const VIETNAMESE_TRANSACTION_LABELS = Object.freeze({
  type: 'Loại',
  typeExpense: 'Chi tiêu',
  typeIncome: 'Thu nhập',
  amount: 'Số tiền',
  date: 'Ngày',
  category: 'Danh mục',
  merchant: 'Cửa hàng / mô tả',
  note: 'Ghi chú',
});

/**
 * Pure helper to update transaction form fields, automatically resetting
 * category when the transaction type changes if the category is no longer valid.
 *
 * @param {object} current - Current transaction state
 * @param {string} name - Field name
 * @param {any} value - Field value
 * @returns {object} Next transaction state
 */
export function updateTransactionField(current, name, value) {
  if (name === 'type') {
    const nextCategories = categoriesForType(EXPENSE_CATEGORIES, value);
    const isCurrentCategoryValid = nextCategories.includes(current?.category);
    return {
      ...current,
      type: value,
      category: isCurrentCategoryValid ? current?.category : nextCategories[0],
    };
  }
  return {
    ...current,
    [name]: value,
  };
}

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Checks that a value is a real calendar date in YYYY-MM-DD form
 * (rejects rollover dates such as 2026-02-30, accepts leap days).
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidCalendarDate(value) {
  const match = typeof value === 'string' ? ISO_DATE_PATTERN.exec(value) : null;
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/**
 * Describes a receipt draft whose currency is not VND, or null for VND/unknown.
 * The ledger is VND-only, so the foreign amount is shown for reference and is
 * never used as the VND amount.
 *
 * @param {object} draft - Receipt draft
 * @returns {{ currency: string, foreignAmount: number|null }|null}
 */
export function getForeignCurrencyContext(draft) {
  const currency = typeof draft?.currency === 'string' ? draft.currency.trim().toUpperCase() : '';
  if (!currency || currency === 'VND') return null;
  const foreignAmount = draft.foreignAmount ?? draft.totalAmount ?? null;
  return { currency, foreignAmount };
}

/**
 * Builds the editable receipt review form from a server draft.
 * - type falls back to the extracted transactionType, then 'expense'.
 * - category is forced to one valid for the type.
 * - a non-VND draft never pre-fills the amount from the foreign total.
 *
 * @param {object} draft - Receipt draft from the server
 * @returns {object} Form values for TransactionFields
 */
export function buildReceiptReviewForm(draft) {
  const type = draft?.type || (draft?.transactionType === 'income' ? 'income' : 'expense');
  const validCategories = categoriesForType(EXPENSE_CATEGORIES, type);
  const category = validCategories.includes(draft?.category) ? draft.category : validCategories[0];
  const hasAmount = draft?.amount !== undefined && draft?.amount !== null && draft?.amount !== '';
  const fallbackTotal = draft?.totalAmount ?? '';
  const amount = hasAmount ? draft.amount : (getForeignCurrencyContext(draft) ? '' : fallbackTotal);

  return {
    ...INITIAL_TRANSACTION,
    ...draft,
    type,
    category,
    amount,
    merchant: draft?.merchant || '',
    date: draft?.date || draft?.transactionDate || '',
    note: draft?.note || '',
    items: draft?.items || [],
  };
}

/**
 * Computes the filters and reload strategy for clearing the search box.
 * Search text is deliberately not an auto-fetch dependency, so a clear must
 * reload explicitly unless the page change (to page 1) already triggers a fetch.
 *
 * @param {object} filters - Current transaction filters
 * @returns {{ filters: object, needsExplicitReload: boolean }}
 */
export function clearSearchFilters(filters) {
  return {
    filters: { ...filters, search: '', page: '1' },
    needsExplicitReload: String(filters?.page) === '1',
  };
}

/**
 * Validates core transaction fields before persistence or confirmation.
 *
 * @param {object} transaction
 * @param {object} [options]
 * @param {string} [options.locale='en'] - 'en' or 'vi'
 * @returns {{ isValid: boolean, error: string|null, amount: number }}
 */
export function validateTransactionData(transaction, { locale = 'en' } = {}) {
  const merchant = typeof transaction?.merchant === 'string' ? transaction.merchant.trim() : '';
  const amount = Number(transaction?.amount);

  if (!merchant) {
    return {
      isValid: false,
      error: locale === 'vi' ? 'Cửa hàng / mô tả không được để trống.' : 'Merchant is required.',
      amount: 0,
    };
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      isValid: false,
      error: locale === 'vi' ? 'Số tiền phải lớn hơn 0.' : 'Enter a total amount greater than zero before saving.',
      amount: 0,
    };
  }

  if (!isValidCalendarDate(transaction?.date)) {
    return {
      isValid: false,
      error: locale === 'vi' ? 'Ngày không hợp lệ (YYYY-MM-DD).' : 'Enter a valid date (YYYY-MM-DD) before saving.',
      amount: 0,
    };
  }

  return { isValid: true, error: null, amount };
}
