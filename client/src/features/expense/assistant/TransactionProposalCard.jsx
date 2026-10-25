import React, { useState } from 'react';
import TransactionFields from '../TransactionFields';
import { ASSISTANT_LABELS } from './expenseAssistantLabels';

/**
 * Interactive card allowing users to review and confirm or cancel
 * an AI-generated transaction proposal.
 */
export default function TransactionProposalCard({ proposal, onConfirm, onCancel, busy }) {
  // Keep amount as a string while typing so users can delete and re-enter values.
  const [draft, setDraft] = useState({
    ...proposal.transaction,
    amount: String(proposal.transaction.amount),
  });
  const [validationError, setValidationError] = useState('');

  function submit() {
    const amount = Number(draft.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setValidationError(ASSISTANT_LABELS.AMOUNT_POSITIVE_ERROR);
      return;
    }
    // Negative signs do not determine transaction type: send positive amount with explicit type.
    onConfirm({ ...draft, amount, items: draft.items || [] });
  }

  return (
    <section className="agent-proposal">
      <h3>{ASSISTANT_LABELS.PROPOSAL_TITLE}</h3>
      <p>{ASSISTANT_LABELS.PROPOSAL_DISCLAIMER}</p>
      <TransactionFields
        values={draft}
        onChange={(next) => {
          setDraft(next);
          setValidationError('');
        }}
        disabled={busy}
        className="agent-proposal-fields"
      />
      {validationError && <p className="form-error">{validationError}</p>}
      <div className="modal-actions">
        <button
          className="secondary-button"
          type="button"
          onClick={onCancel}
          disabled={busy}
        >
          {ASSISTANT_LABELS.PROPOSAL_CANCEL}
        </button>
        <button
          className="primary-button"
          type="button"
          onClick={submit}
          disabled={busy}
        >
          {busy ? ASSISTANT_LABELS.PROPOSAL_SAVING : ASSISTANT_LABELS.PROPOSAL_CONFIRM}
        </button>
      </div>
    </section>
  );
}
