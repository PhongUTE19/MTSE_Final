import { useState } from 'react';
import { EXPENSE_CATEGORIES, INITIAL_TRANSACTION } from './expenseConstants';
import { categoriesForType } from './expenseFormatters';

export default function TransactionForm({ transaction, onSave, onClose }) {
  const [form, setForm] = useState(transaction || INITIAL_TRANSACTION);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => {
      if (name !== 'type') return { ...current, [name]: value };
      // Đổi loại giao dịch thì reset danh mục tương ứng để tránh dữ liệu không hợp lệ.
      return {
        ...current,
        type: value,
        category: categoriesForType(EXPENSE_CATEGORIES, value)[0],
      };
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave({ ...form, amount: Number(form.amount) });
      onClose();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  const isEditing = Boolean(transaction?.id);
  const selectableCategories = categoriesForType(EXPENSE_CATEGORIES, form.type);

  return (
    <div className="expense-modal-backdrop" role="presentation">
      <form className="expense-modal" onSubmit={handleSubmit}>
        <div className="modal-heading">
          <div>
            <p className="eyebrow">TRANSACTION</p>
            <h2>{isEditing ? 'Edit transaction' : 'New transaction'}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close form">×</button>
        </div>

        {error && <p className="form-error">{error}</p>}

        <div className="form-grid">
          <label>
            Type
            <select name="type" value={form.type} onChange={handleChange}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </label>
          <label>
            Amount
            <input name="amount" type="number" min="1" value={form.amount} onChange={handleChange} required />
          </label>
          <label>
            Date
            <input name="date" type="date" value={form.date} onChange={handleChange} required />
          </label>
          <label>
            Category
            <select name="category" value={form.category} onChange={handleChange}>
              {selectableCategories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
          <label className="full">
            Merchant or description
            <input name="merchant" value={form.merchant} onChange={handleChange} required />
          </label>
          <label className="full">
            Note
            <textarea name="note" value={form.note} onChange={handleChange} rows="3" />
          </label>
        </div>

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" disabled={saving}>
            {saving ? 'Saving…' : 'Save transaction'}
          </button>
        </div>
      </form>
    </div>
  );
}
