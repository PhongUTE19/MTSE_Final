import React from 'react';
import { formatMoney } from '../../../shared/utils/formatters';
import { ASSISTANT_LABELS } from './expenseAssistantLabels';

/**
 * Renders structured tool results returned by the Expense AI Agent
 * (e.g., search_transactions or get_spending_summary).
 */
export default function ExpenseToolResult({ message }) {
  const result = message?.result;
  if (!result) return null;

  if (message.toolName === 'search_transactions') {
    return (
      <section className="agent-result-card">
        <div className="agent-result-heading">
          <h3>{ASSISTANT_LABELS.SEARCH_RESULTS_TITLE}</h3>
          <span>{ASSISTANT_LABELS.RESULTS_COUNT(result.total)}</span>
        </div>
        {result.total === 0 ? (
          <p className="agent-empty">{ASSISTANT_LABELS.EMPTY_SEARCH}</p>
        ) : (
          <ul className="agent-transaction-list">
            {result.transactions.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.merchant}</strong>
                  <small>{item.date} · {item.category}</small>
                </div>
                <strong className={item.type === 'income' ? 'income' : 'expense'}>
                  {item.type === 'income' ? '+' : '-'}{formatMoney(item.amount)}
                </strong>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  if (message.toolName === 'get_spending_summary') {
    return (
      <section className="agent-result-card">
        <div className="agent-result-heading">
          <h3>{ASSISTANT_LABELS.SPENDING_SUMMARY_TITLE}</h3>
          <span>{result.period?.from} → {result.period?.to}</span>
        </div>
        <div className="agent-summary-grid">
          <div>
            <span>{ASSISTANT_LABELS.TOTAL_INCOME}</span>
            <strong className="income">{formatMoney(result.totalIncome)}</strong>
          </div>
          <div>
            <span>{ASSISTANT_LABELS.TOTAL_EXPENSE}</span>
            <strong className="expense">{formatMoney(result.totalExpense)}</strong>
          </div>
          <div>
            <span>{ASSISTANT_LABELS.BALANCE}</span>
            <strong>{formatMoney(result.balance)}</strong>
          </div>
        </div>
        <ul className="agent-category-list">
          {(result.topCategories || []).map((item) => (
            <li key={item.category}>
              <span>{item.category}</span>
              <strong>{formatMoney(item.amount)}</strong>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return null;
}
