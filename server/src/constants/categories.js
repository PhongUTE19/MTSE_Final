export const EXPENSE_CATEGORIES = Object.freeze([
  'Food & dining',
  'Transportation',
  'Shopping',
  'Education',
  'Health',
  'Entertainment',
  'Other expenses',
]);

export const INCOME_CATEGORIES = Object.freeze([
  'Salary',
  'Other income',
]);

export const ALL_CATEGORIES = Object.freeze([
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

// Exact normalized aliases grounded in existing receipt.schema.js mappings.
// No prefix or fuzzy matching is permitted.
export const CATEGORY_ALIASES = Object.freeze({
  food: 'Food & dining',
  dining: 'Food & dining',
  restaurant: 'Food & dining',
  cafe: 'Food & dining',
  coffee: 'Food & dining',
  grocery: 'Food & dining',
  transport: 'Transportation',
  travel: 'Transportation',
  taxi: 'Transportation',
  fuel: 'Transportation',
  parking: 'Transportation',
  shop: 'Shopping',
  retail: 'Shopping',
  clothing: 'Shopping',
  tuition: 'Education',
  book: 'Education',
  course: 'Education',
  school: 'Education',
  education: 'Education',
  medical: 'Health',
  health: 'Health',
  hospital: 'Health',
  pharmacy: 'Health',
  movie: 'Entertainment',
  game: 'Entertainment',
  entertainment: 'Entertainment',
  music: 'Entertainment',
  salary: 'Salary',
  wage: 'Salary',
  payroll: 'Salary',
  income: 'Other income',
  refund: 'Other income',
});

/**
 * Resolves a category string against the authoritative backend category contract.
 * Uses exact normalized canonical matching followed by exact normalized alias lookup.
 * Never performs prefix or fuzzy matching.
 *
 * @param {unknown} value
 * @param {{ type?: 'income' | 'expense', allowFallback?: boolean }} [options]
 * @returns {string|null}
 */
export function normalizeCategory(value, { type, allowFallback = false } = {}) {
  if (typeof value !== 'string') {
    return allowFallback ? (type === 'income' ? 'Other income' : 'Other expenses') : null;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return allowFallback ? (type === 'income' ? 'Other income' : 'Other expenses') : null;
  }

  const exact = ALL_CATEGORIES.find((category) => category.toLowerCase() === normalized) || null;
  const resolved = exact || CATEGORY_ALIASES[normalized] || null;

  if (!resolved) {
    return allowFallback ? (type === 'income' ? 'Other income' : 'Other expenses') : null;
  }

  if (type === 'income' && !INCOME_CATEGORIES.includes(resolved)) {
    return allowFallback ? 'Other income' : null;
  }
  if (type === 'expense' && INCOME_CATEGORIES.includes(resolved)) {
    return allowFallback ? 'Other expenses' : null;
  }

  return resolved;
}
