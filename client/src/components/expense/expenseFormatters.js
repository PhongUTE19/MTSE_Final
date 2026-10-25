export { formatMoney } from '../../utils/formatters.js';

export function categoriesForType(categories, type) {
  const incomeCategories = ['Salary', 'Other income'];
  return categories.filter((category) => (
    type === 'income'
      ? incomeCategories.includes(category)
      : !incomeCategories.includes(category)
  ));
}
