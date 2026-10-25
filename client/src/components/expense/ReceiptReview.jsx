import { useState } from 'react';
import { EXPENSE_CATEGORIES, INITIAL_TRANSACTION } from './expenseConstants';
import { categoriesForType } from './expenseFormatters';

export default function ReceiptReview({ file, previewUrl, draft, onConfirm, onDiscard }) {
  const [form, setForm] = useState({
    ...INITIAL_TRANSACTION,
    ...draft,
    merchant: draft.merchant || file.name.replace(/\.[^.]+$/, ''),
  });
  const [error, setError] = useState('');
  const [action, setAction] = useState('');
  const busy = Boolean(action);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleConfirm() {
    if (!form.merchant.trim()) {
      setError('Merchant is required.');
      return;
    }
    if (!Number.isFinite(Number(form.amount)) || Number(form.amount) <= 0) {
      setError('Enter a total amount greater than zero before saving.');
      return;
    }
    try {
      setAction('saving');
      setError('');
      await onConfirm({ ...form, amount: Number(form.amount) });
    } catch (requestError) {
      setError(requestError.message);
      setAction('');
    }
  }

  async function handleDiscard() {
    try {
      setAction('discarding');
      setError('');
      await onDiscard();
    } catch (requestError) {
      setError(requestError.message);
      setAction('');
    }
  }

  return (
    <section className="receipt-review">
      <div className="review-title">
        <div>
          <p className="eyebrow">STEP 3 OF 3</p>
          <h2>Review extracted details</h2>
          <p>AI extraction is a draft. Check every field before saving.</p>
        </div>
        <button className="secondary-button" type="button" onClick={handleDiscard} disabled={busy}>
          {action === 'discarding' ? 'Discarding…' : 'Discard'}
        </button>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="review-grid">
        <div className="receipt-preview">
          <span>Receipt image</span>
          {previewUrl && <img src={previewUrl} alt={`Preview of ${file.name}`} />}
          <strong>{file.name}</strong>
          <small>{Math.round(file.size / 1024)} KB</small>
        </div>
        <div className="form-grid">
          <label>
            Merchant
            <input name="merchant" value={form.merchant} onChange={handleChange} disabled={busy} required />
          </label>
          <label>
            Date
            <input name="date" type="date" value={form.date} onChange={handleChange} disabled={busy} required />
          </label>
          <label>
            Total amount
            <input name="amount" type="number" min="1" value={form.amount} onChange={handleChange} disabled={busy} required />
          </label>
          <label>
            Category
            <select name="category" value={form.category} onChange={handleChange} disabled={busy}>
              {categoriesForType(EXPENSE_CATEGORIES, form.type).map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
          <label className="full">
            Note
            <textarea name="note" value={form.note} onChange={handleChange} disabled={busy} rows="2" />
          </label>
        </div>
      </div>

      <div className="modal-actions">
        <button className="primary-button" type="button" onClick={handleConfirm} disabled={busy}>
          {action === 'saving' ? 'Saving transaction…' : 'Confirm and save transaction'}
        </button>
      </div>
    </section>
  );
}
