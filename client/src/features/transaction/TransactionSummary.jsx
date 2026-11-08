import React from 'react';
import { formatMoney } from '../../shared/utils/formatters.js';
import { Grid } from '../../primitives/layout/index.js';
import StatCard from '../../composites/dataDisplay/StatCard.jsx';

/**
 * Renders the top summary cards (Income, Expense, Net) on the Transactions page.
 * Composes Base Grid and shared StatCard composite.
 */
export default function TransactionSummary({ summary, loading = false, error = false }) {
  const isUnavailable = !loading && (Boolean(error) || !summary);
  const income = summary?.income ?? 0;
  const expense = summary?.expense ?? 0;
  const net = income - expense;

  return (
    <Grid as="section" columns={3} gap="md" role="region" aria-label="Transaction summary">
      <StatCard
        label="Income"
        value={isUnavailable ? '—' : formatMoney(income)}
        valueColor={isUnavailable ? 'secondary' : 'income'}
        loading={loading}
        sub="Funds recorded in this result set"
      />
      <StatCard
        label="Expense"
        value={isUnavailable ? '—' : formatMoney(expense)}
        valueColor={isUnavailable ? 'secondary' : 'expense'}
        loading={loading}
        sub="Spending recorded in this result set"
      />
      <StatCard
        label="Net"
        value={isUnavailable ? '—' : formatMoney(net)}
        valueColor={isUnavailable ? 'secondary' : 'primary'}
        loading={loading}
        sub="Income less expenses shown"
      />
    </Grid>
  );
}
