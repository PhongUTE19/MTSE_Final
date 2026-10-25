import { EXPENSE_CATEGORIES } from './expenseConstants.js';
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

  return { isValid: true, error: null, amount };
}
