import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { expenseApi } from './expenseApi';
import AppSidebar from '../../layouts/AppSidebar';
import CategoriesView from '../categories/CategoriesView';
import ReceiptsView from '../receipts/ReceiptsView';
import TransactionForm from './TransactionForm';
import TransactionTable from './TransactionTable';
import ExpenseSummaryCards from './ExpenseSummaryCards';
import ExpenseAssistant from './assistant/ExpenseAssistant';
import {
  INITIAL_TRANSACTION,
  INITIAL_TRANSACTION_FILTERS,
  EXPENSE_VIEWS,
  EXPENSE_VIEW_TITLES,
} from './expenseConstants';
import './expenseTracker.css';

/**
 * Main application coordinator for the Personal Finance workspace.
 * Coordinates sidebar navigation, transaction CRUD, view switching,
 * and the floating AI Expense Assistant popup.
 */
export default function ExpenseTrackerApp({ user, onSignOut }) {
  const location = useLocation();
  const [view, setView] = useState(() => location.state?.view || EXPENSE_VIEWS.TRANSACTIONS);

  useEffect(() => {
    if (location.state?.view) {
      setView(location.state.view);
    }
  }, [location.state?.view]);

  const [data, setData] = useState({ transactions: [], total: 0, page: 1, pageSize: 10 });
  const [filters, setFilters] = useState(INITIAL_TRANSACTION_FILTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [assistantOpen, setAssistantOpen] = useState(false);

  async function loadTransactions() {
    setLoading(true);
    setError('');
    try {
      setData(await expenseApi.list(filters));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  // Reload transaction list when filters or server-side pagination change.
  useEffect(() => {
    loadTransactions();
  }, [
    filters.page,
    filters.pageSize,
    filters.sortBy,
    filters.sortOrder,
    filters.type,
    filters.category,
    filters.from,
    filters.to,
  ]);

  const summary = useMemo(
    () =>
      data.transactions.reduce(
        (totals, transaction) => ({
          income: totals.income + (transaction.type === 'income' ? transaction.amount : 0),
          expense: totals.expense + (transaction.type === 'expense' ? transaction.amount : 0),
        }),
        { income: 0, expense: 0 }
      ),
    [data.transactions]
  );

  async function saveTransaction(transaction) {
    if (editingTransaction?.id) {
      await expenseApi.update(editingTransaction.id, transaction);
    } else {
      await expenseApi.create(transaction);
    }
    await loadTransactions();
  }

  async function deleteTransaction(transaction) {
    const confirmMessage = `Delete ${transaction.merchant}? If it was created from a receipt, its receipt image will also be deleted.`;
    if (!window.confirm(confirmMessage)) return;
    try {
      await expenseApi.remove(transaction.id);
      await loadTransactions();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <main className={`expense-shell${assistantOpen ? ' expense-shell--assistant-open' : ''}`}>
      <AppSidebar
        activeView={view}
        onNavigate={setView}
        user={user}
        onSignOut={onSignOut}
      />

      <section className="expense-main">
        <header className="expense-header">
          <div>
            <p className="eyebrow">PERSONAL FINANCE</p>
            <h1>{EXPENSE_VIEW_TITLES[view] || view}</h1>
          </div>
          {view === EXPENSE_VIEWS.TRANSACTIONS && (
            <button
              className="primary-button"
              onClick={() => setEditingTransaction(INITIAL_TRANSACTION)}
            >
              + New transaction
            </button>
          )}
        </header>

        {error && (
          <div className="page-error">
            {error}
            <button onClick={() => setError('')} aria-label="Dismiss error">
              ×
            </button>
          </div>
        )}

        {view === EXPENSE_VIEWS.RECEIPT && (
          <ReceiptsView
            onTransactionSaved={loadTransactions}
            onError={setError}
          />
        )}

        {view === EXPENSE_VIEWS.CATEGORIES && <CategoriesView />}

        {view === EXPENSE_VIEWS.TRANSACTIONS && (
          <>
            <ExpenseSummaryCards summary={summary} />

            <TransactionTable
              data={data}
              filters={filters}
              loading={loading}
              onChangeFilters={setFilters}
              onEdit={setEditingTransaction}
              onDelete={deleteTransaction}
              onSearch={loadTransactions}
            />
          </>
        )}
      </section>

      {editingTransaction && (
        <TransactionForm
          transaction={editingTransaction.id ? editingTransaction : null}
          onSave={saveTransaction}
          onClose={() => setEditingTransaction(null)}
        />
      )}

      <ExpenseAssistant
        userId={user.id}
        onAsk={expenseApi.askExpenseAssistant}
        onConfirmProposal={async (id, transaction) => {
          const result = await expenseApi.confirmAgentProposal(id, transaction);
          await loadTransactions();
          return result;
        }}
        onCancelProposal={expenseApi.cancelAgentProposal}
        onReceiptUpload={expenseApi.upload}
        onReceiptConfirm={async (id, transaction) => {
          const result = await expenseApi.confirmReceipt(id, transaction);
          await loadTransactions();
          return result;
        }}
        onReceiptDiscard={expenseApi.deleteReceipt}
        onTransactionsChanged={loadTransactions}
        onOpenChange={setAssistantOpen}
      />
    </main>
  );
}
