import { useId } from 'react';
import TextInput from '../../primitives/inputs/TextInput.jsx';
import TextArea from '../../primitives/inputs/TextArea.jsx';
import Select from '../../primitives/inputs/Select.jsx';
import Label from '../../primitives/labels/Label.jsx';
import { Grid, Stack } from '../../primitives/layout/index.js';
import { EXPENSE_CATEGORIES } from '../../shared/transactions/expenseConstants.js';
import { categoriesForType } from '../../shared/transactions/expenseCategories.js';
import {
  DEFAULT_TRANSACTION_LABELS,
  updateTransactionField,
} from '../../shared/transactions/transactionFieldsUtils.js';

/**
 * Reusable transaction fields component for transaction forms, receipt review,
 * and AI proposals. Composes Base Stack, Label, TextInput, Select, and TextArea directly
 * without redundant wrapper elements.
 */
export default function TransactionFields({
  values,
  onChange,
  disabled = false,
  showType = true,
  labels = {},
  layout = 'grid',
  required = true,
  noteRows = 2,
}) {
  const baseId = useId();
  const fieldId = (name) => `${baseId}-${name}`;
  const l = { ...DEFAULT_TRANSACTION_LABELS, ...labels };
  const currentType = values?.type || 'expense';
  const selectableCategories = categoriesForType(EXPENSE_CATEGORIES, currentType);

  function handleChange(event) {
    const { name, value } = event.target;
    const nextValues = updateTransactionField(values || {}, name, value);
    onChange?.(nextValues, name, value);
  }

  const fields = (
    <>
      {showType && (
        <Stack gap="2xs">
          <Label htmlFor={fieldId('type')}>{l.type}</Label>
          <Select
            id={fieldId('type')}
            name="type"
            value={currentType}
            onChange={handleChange}
            disabled={disabled}
          >
            <option value="expense">{l.typeExpense}</option>
            <option value="income">{l.typeIncome}</option>
          </Select>
        </Stack>
      )}

      <Stack gap="2xs">
        <Label htmlFor={fieldId('amount')}>{l.amount}</Label>
        <TextInput
          id={fieldId('amount')}
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
      </Stack>

      <Stack gap="2xs">
        <Label htmlFor={fieldId('date')}>{l.date}</Label>
        <TextInput
          id={fieldId('date')}
          name="date"
          type="date"
          value={values?.date ?? ''}
          onChange={handleChange}
          disabled={disabled}
          required={required}
        />
      </Stack>

      <Stack gap="2xs">
        <Label htmlFor={fieldId('category')}>{l.category}</Label>
        <Select
          id={fieldId('category')}
          name="category"
          value={values?.category ?? ''}
          onChange={handleChange}
          disabled={disabled}
        >
          {selectableCategories.map((category) => (
            <option key={category} value={category}>{category}</option>
          ))}
        </Select>
      </Stack>

      <Stack gap="2xs" fullWidth>
        <Label htmlFor={fieldId('merchant')}>{l.merchant}</Label>
        <TextInput
          id={fieldId('merchant')}
          name="merchant"
          value={values?.merchant ?? ''}
          onChange={handleChange}
          disabled={disabled}
          required={required}
        />
      </Stack>

      <Stack gap="2xs" fullWidth>
        <Label htmlFor={fieldId('note')}>{l.note}</Label>
        <TextArea
          id={fieldId('note')}
          name="note"
          value={values?.note ?? ''}
          onChange={handleChange}
          disabled={disabled}
          rows={noteRows}
        />
      </Stack>
    </>
  );

  if (layout === 'stack') {
    return (
      <Stack gap="xs">
        {fields}
      </Stack>
    );
  }

  return (
    <Grid columns={2} gap="md">
      {fields}
    </Grid>
  );
}
