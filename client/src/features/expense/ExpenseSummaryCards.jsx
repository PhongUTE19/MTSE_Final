import React from 'react';
import { formatMoney } from '../../shared/utils/formatters';

/**
 * Renders the top summary cards (Income, Expenses, Balance) on the Transactions page.
 */
export default function ExpenseSummaryCards({ summary }) {
  const income = summary?.income || 0;
  const expense = summary?.expense || 0;
  const balance = income - expense;

  return (
    <section className="summary-grid" aria-label="Transaction page summary">
      <article className="summary-card summary-card--income">
        <span>Income on this page</span>
        <strong>{formatMoney(income)}</strong>
        <small>Funds recorded in this result set</small>
      </article>

      <article className="summary-card summary-card--expense">
        <span>Expenses on this page</span>
        <strong>{formatMoney(expense)}</strong>
        <small>Spending recorded in this result set</small>
      </article>

      <article className="summary-card summary-card--balance">
        <span>Balance on this page</span>
        <strong>{formatMoney(balance)}</strong>
        <small>Income less expenses shown</small>
      </article>
    </section>
  );
}
