export const INCOME_CATEGORIES = Object.freeze(['Salary', 'Other income']);

/**
 * Filters the list of categories based on transaction type ('income' vs 'expense').
 *
 * @param {readonly string[]} categories - Array of categories to filter
 * @param {string} type - 'income' or 'expense'
 * @returns {string[]} Filtered categories
 */
export function categoriesForType(categories, type) {
  return (categories || []).filter((category) => (
    type === 'income'
      ? INCOME_CATEGORIES.includes(category)
      : !INCOME_CATEGORIES.includes(category)
  ));
}
