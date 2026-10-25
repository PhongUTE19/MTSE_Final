import { useState } from 'react';
import { INITIAL_TRANSACTION } from './expenseConstants';
import TransactionFields from './TransactionFields';

export default function TransactionForm({ transaction, onSave, onClose }) {
  const [form, setForm] = useState(transaction || INITIAL_TRANSACTION);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

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

        <TransactionFields
          values={form}
          onChange={setForm}
          disabled={saving}
          noteRows={3}
        />

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
