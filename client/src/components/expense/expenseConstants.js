export const EXPENSE_CATEGORIES = Object.freeze([
  'Food & dining',
  'Transportation',
  'Shopping',
  'Education',
  'Health',
  'Entertainment',
  'Salary',
  'Other income',
  'Other expenses',
]);

export const INITIAL_TRANSACTION = Object.freeze({
  type: 'expense',
  amount: '',
  date: new Date().toISOString().slice(0, 10),
  category: 'Food & dining',
  merchant: '',
  note: '',
  items: [],
});

export const RECEIPT_ACCEPTED_TYPES = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export const MAX_RECEIPT_SIZE_BYTES = 5 * 1024 * 1024;

export const INITIAL_TRANSACTION_FILTERS = Object.freeze({
  search: '',
  type: '',
  category: '',
  from: '',
  to: '',
  page: '1',
  pageSize: '10',
  sortBy: 'date',
  sortOrder: 'desc',
});

export const EXPENSE_VIEWS = Object.freeze({
  TRANSACTIONS: 'transactions',
  RECEIPT: 'receipt',
  CATEGORIES: 'categories',
});

export const EXPENSE_VIEW_TITLES = Object.freeze({
  [EXPENSE_VIEWS.TRANSACTIONS]: 'Transactions',
  [EXPENSE_VIEWS.RECEIPT]: 'Scan a receipt',
  [EXPENSE_VIEWS.CATEGORIES]: 'Categories',
});
