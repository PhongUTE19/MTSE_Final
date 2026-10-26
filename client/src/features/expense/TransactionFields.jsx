import { EXPENSE_CATEGORIES } from './expenseConstants';
import { categoriesForType } from './expenseCategories';
import {
  DEFAULT_TRANSACTION_LABELS,
  VIETNAMESE_TRANSACTION_LABELS,
  updateTransactionField,
  validateTransactionData,
} from './transactionFieldsUtils';

export {
  DEFAULT_TRANSACTION_LABELS,
  VIETNAMESE_TRANSACTION_LABELS,
  updateTransactionField,
  validateTransactionData,
};

/**
 * Reusable transaction fields component for transaction forms, receipt review,
 * and AI proposals.
 */
export default function TransactionFields({
  values,
  onChange,
  disabled = false,
  showType = true,
  labels = {},
  className = 'form-grid',
  required = true,
  noteRows = 2,
}) {
  const l = { ...DEFAULT_TRANSACTION_LABELS, ...labels };
  const currentType = values?.type || 'expense';
  const selectableCategories = categoriesForType(EXPENSE_CATEGORIES, currentType);

  function handleChange(event) {
    const { name, value } = event.target;
    const nextValues = updateTransactionField(values || {}, name, value);
    onChange?.(nextValues, name, value);
  }

  if (!showType) {
    return (
      <div className={className}>
        <label>
          {l.merchant}
          <input
            name="merchant"
            value={values?.merchant ?? ''}
            onChange={handleChange}
            disabled={disabled}
            required={required}
          />
        </label>
        <label>
          {l.date}
          <input
            name="date"
            type="date"
            value={values?.date ?? ''}
            onChange={handleChange}
            disabled={disabled}
            required={required}
          />
        </label>
        <label>
          {l.amount}
          <input
            name="amount"
            type="number"
            min="1"
            step="any"
            inputMode="decimal"
            placeholder="0 ₫"
            value={values?.amount ?? ''}
            onChange={handleChange}
            disabled={disabled}
            required={required}
          />
        </label>
        <label>
          {l.category}
          <select
            name="category"
            value={values?.category ?? ''}
            onChange={handleChange}
            disabled={disabled}
          >
            {selectableCategories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </label>
        <label className="full">
          {l.note}
          <textarea
            name="note"
            value={values?.note ?? ''}
            onChange={handleChange}
            disabled={disabled}
            rows={noteRows}
          />
        </label>
      </div>
    );
  }

  return (
    <div className={className}>
      <label>
        {l.type}
        <select
          name="type"
          value={currentType}
          onChange={handleChange}
          disabled={disabled}
        >
          <option value="expense">{l.typeExpense}</option>
          <option value="income">{l.typeIncome}</option>
        </select>
      </label>
      <label>
        {l.amount}
        <input
          name="amount"
          type="number"
          min="1"
          step="any"
          inputMode="decimal"
          placeholder="0 ₫"
          value={values?.amount ?? ''}
          onChange={handleChange}
          disabled={disabled}
          required={required}
        />
      </label>
      <label>
        {l.date}
        <input
          name="date"
          type="date"
          value={values?.date ?? ''}
          onChange={handleChange}
          disabled={disabled}
          required={required}
        />
      </label>
      <label>
        {l.category}
        <select
          name="category"
          value={values?.category ?? ''}
          onChange={handleChange}
          disabled={disabled}
        >
          {selectableCategories.map((category) => (
            <option key={category} value={category}>{category}</option>
          ))}
        </select>
      </label>
      <label className="full">
        {l.merchant}
        <input
          name="merchant"
          value={values?.merchant ?? ''}
          onChange={handleChange}
          disabled={disabled}
          required={required}
        />
      </label>
      <label className="full">
        {l.note}
        <textarea
          name="note"
          value={values?.note ?? ''}
          onChange={handleChange}
          disabled={disabled}
          rows={noteRows}
        />
      </label>
    </div>
  );
}
