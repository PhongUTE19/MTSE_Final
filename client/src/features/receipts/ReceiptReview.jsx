import { useState, useEffect } from 'react';
import { INITIAL_TRANSACTION } from '../expense/expenseConstants';
import TransactionFields, { validateTransactionData } from '../expense/TransactionFields';

function buildInitialForm(draft) {
  return {
    ...INITIAL_TRANSACTION,
    ...draft,
    merchant: draft?.merchant || '',
    date: draft?.date || draft?.transactionDate || '',
    amount: (draft?.amount !== undefined && draft?.amount !== null && draft?.amount !== '')
      ? draft.amount
      : ((draft?.totalAmount !== undefined && draft?.totalAmount !== null) ? draft.totalAmount : ''),
    category: draft?.category || INITIAL_TRANSACTION.category,
    note: draft?.note || '',
    items: draft?.items || [],
  };
}

export default function ReceiptReview({ file, previewUrl, draft, onConfirm, onDiscard }) {
  const [form, setForm] = useState(() => buildInitialForm(draft));
  const [error, setError] = useState('');
  const [action, setAction] = useState('');
  const busy = Boolean(action);

  useEffect(() => {
    setForm(buildInitialForm(draft));
    setError('');
    setAction('');
  }, [draft]);

  async function handleConfirm() {
    if (!form.date || !/^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
      setError('Enter a valid date (YYYY-MM-DD) before saving.');
      return;
    }
    const validation = validateTransactionData(form, { locale: 'en' });
    if (!validation.isValid) {
      setError(validation.error);
      return;
    }
    try {
      setAction('saving');
      setError('');
      await onConfirm({ ...form, amount: validation.amount });
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
        <TransactionFields
          values={form}
          onChange={setForm}
          disabled={busy}
          showType={false}
          labels={{ amount: 'Total amount', merchant: 'Merchant' }}
        />
      </div>

      <div className="modal-actions">
        <button className="primary-button" type="button" onClick={handleConfirm} disabled={busy}>
          {action === 'saving' ? 'Saving transaction…' : 'Confirm and save transaction'}
        </button>
      </div>
    </section>
  );
}
