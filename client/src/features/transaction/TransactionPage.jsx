import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { transactionApi } from './transactionApi.js';
import ManualEntry from './ManualEntry.jsx';
import TransactionDetails from './TransactionDetails.jsx';
import TransactionTable from './TransactionTable.jsx';
import TransactionSummary from './TransactionSummary.jsx';
import Button from '../../primitives/buttons/Button.jsx';
import Inline from '../../primitives/layout/Inline.jsx';
import Stack from '../../primitives/layout/Stack.jsx';
import { INITIAL_TRANSACTION, INITIAL_TRANSACTION_FILTERS } from '../../shared/transactions/expenseConstants.js';
import { useConfirm, useToast, useWorkspace } from '../../app/providers/index.js';

/**
 * Transactions route view for Personal Finance workspace.
 * Owns transaction query state, summary metrics, manual entry modal coordination,
 * transaction details inspection (with linked receipt preview), and live refresh.
 */
export default function TransactionPage({
  onPreviewReceipt,
  onAddTransactionConfirm,
  onAddTransactionFormChange,
  onAddTransactionReceiptSelect,
  onAddTransactionClose,
}) {
  const { confirm } = useConfirm();
  const { toast } = useToast();
  const { transactionsVersion } = useWorkspace();
  const outletContext = useOutletContext() || {};

  const [localEditingTransaction, setLocalEditingTransaction] = useState(null);
  const [viewingTransaction, setViewingTransaction] = useState(null);

  const editingTransaction =
    outletContext.setEditingTransaction !== undefined
      ? outletContext.editingTransaction
      : localEditingTransaction;
  const setEditingTransaction = outletContext.setEditingTransaction || setLocalEditingTransaction;
  const reportError = outletContext.setError || outletContext.onError;
  const previewReceiptHandler = onPreviewReceipt || outletContext.onPreviewReceipt;

  const [data, setData] = useState({ transactions: [], total: 0, page: 1, pageSize: 10 });
  const [filters, setFilters] = useState(INITIAL_TRANSACTION_FILTERS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const lastVersionRef = useRef(transactionsVersion);

  // Callers that just changed filters pass them explicitly because state
  // updates are not visible to this render's closure yet.
  const loadTransactions = useCallback(
    async (activeFilters = filters) => {
      setLoading(true);
      setLoadError(false);
      reportError?.('');
      try {
        const result = await transactionApi.list(activeFilters);
        const totalPages = Math.max(1, Math.ceil((result.total || 0) / (Number(activeFilters.pageSize) || 10)));
        const currentPage = Number(activeFilters.page) || 1;
        if (currentPage > totalPages && result.total > 0) {
          const correctedFilters = { ...activeFilters, page: String(totalPages) };
          setFilters(correctedFilters);
          const correctedResult = await transactionApi.list(correctedFilters);
          setData(correctedResult);
          return;
        }
        setData(result);
      } catch (requestError) {
        setLoadError(true);
        reportError?.(requestError.message);
        toast.error(requestError.message || 'Failed to load transactions.');
      } finally {
        setLoading(false);
      }
    },
    [filters, reportError, toast]
  );

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

  // Reload transactions when a proposal or receipt draft is confirmed.
  useEffect(() => {
    if (transactionsVersion !== lastVersionRef.current) {
      lastVersionRef.current = transactionsVersion;
      if (transactionsVersion > 0) {
        loadTransactions();
      }
    }
  }, [transactionsVersion, loadTransactions]);

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
      await transactionApi.update(editingTransaction.id, transaction);
      toast.success('Transaction updated.');
    } else if (onAddTransactionConfirm) {
      await onAddTransactionConfirm(transaction);
      toast.success('Transaction confirmed.');
    } else {
      await transactionApi.create(transaction);
      toast.success('Transaction created.');
    }
    await loadTransactions();
  }

  async function handleCloseManualEntry() {
    if (!editingTransaction?.id) {
      await onAddTransactionClose?.();
    }
    setEditingTransaction(null);
  }

  async function deleteTransaction(transaction) {
    const confirmMessage = `Delete ${transaction.merchant}? If it was created from a receipt, its receipt image will also be deleted.`;
    const isConfirmed = await confirm({
      title: 'Delete Transaction',
      message: confirmMessage,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger',
    });
    if (!isConfirmed) return;
    try {
      await transactionApi.remove(transaction.id);
      toast.success('Transaction deleted.');
      await loadTransactions();
    } catch (requestError) {
      reportError?.(requestError.message);
      toast.error(requestError.message || 'Failed to delete transaction.');
    }
  }

  return (
    <Stack gap="lg">
      <TransactionSummary summary={summary} loading={loading} error={loadError} />

      <Inline justify="end" align="center" fullWidth>
        <Button
          type="button"
          variant="primary"
          onClick={() => setEditingTransaction(INITIAL_TRANSACTION)}
        >
          Add Transaction
        </Button>
      </Inline>

      <TransactionTable
        data={data}
        filters={filters}
        loading={loading}
        onChangeFilters={setFilters}
        onEdit={setEditingTransaction}
        onDelete={deleteTransaction}
        onSearch={(nextFilters) => loadTransactions(nextFilters)}
        onViewDetails={setViewingTransaction}
      />

      {editingTransaction && (
        <ManualEntry
          transaction={editingTransaction.id ? editingTransaction : null}
          onSave={saveTransaction}
          onFormChange={editingTransaction.id ? undefined : onAddTransactionFormChange}
          onReceiptFileSelect={editingTransaction.id ? undefined : onAddTransactionReceiptSelect}
          onClose={handleCloseManualEntry}
        />
      )}

      {viewingTransaction && (
        <TransactionDetails
          transaction={viewingTransaction}
          onClose={() => setViewingTransaction(null)}
          onEdit={(tx) => {
            setViewingTransaction(null);
            setEditingTransaction(tx);
          }}
          onDelete={(tx) => {
            setViewingTransaction(null);
            deleteTransaction(tx);
          }}
          onPreviewReceipt={previewReceiptHandler}
        />
      )}
    </Stack>
  );
}
