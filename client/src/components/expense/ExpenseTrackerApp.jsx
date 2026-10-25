import { useEffect, useMemo, useState } from 'react';
import { expenseApi } from '../../services/expenseApi';
import ExpenseSidebar from './ExpenseSidebar';
import ReceiptReview from './ReceiptReview';
import TransactionForm from './TransactionForm';
import TransactionTable from './TransactionTable';
import AiExpenseAssistant from './AiExpenseAssistant';
import { INITIAL_TRANSACTION, MAX_RECEIPT_SIZE_BYTES, RECEIPT_ACCEPTED_TYPES } from './expenseConstants';
import { formatMoney } from './expenseFormatters';
import './expenseTracker.css';

const INITIAL_FILTERS = {
  search: '', type: '', category: '', from: '', to: '',
  page: '1', pageSize: '10', sortBy: 'date', sortOrder: 'desc',
};

function pageTitle(view) {
  return { transactions: 'Transactions', receipt: 'Scan a receipt', categories: 'Categories' }[view];
}

export default function ExpenseTrackerApp({ user, onSignOut }) {
  const [view, setView] = useState('transactions');
  const [data, setData] = useState({ transactions: [], total: 0, page: 1, pageSize: 10 });
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [processingReceipt, setProcessingReceipt] = useState(null);
  const [pendingReviews, setPendingReviews] = useState([]);
  const [pendingActionId, setPendingActionId] = useState(null);
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

  // Tải lại danh sách khi bộ lọc hoặc phân trang phía server thay đổi.
  useEffect(() => {
    loadTransactions();
  }, [filters.page, filters.pageSize, filters.sortBy, filters.sortOrder, filters.type, filters.category, filters.from, filters.to]);

  useEffect(() => {
    if (view === 'receipt') loadPendingReviews();
  }, [view]);

  async function loadPendingReviews() {
    try {
      const result = await expenseApi.listReceipts();
      setPendingReviews(result.receipts.filter((item) => item.status === 'review_required'));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  const summary = useMemo(() => data.transactions.reduce((totals, transaction) => ({
    income: totals.income + (transaction.type === 'income' ? transaction.amount : 0),
    expense: totals.expense + (transaction.type === 'expense' ? transaction.amount : 0),
  }), { income: 0, expense: 0 }), [data.transactions]);

  async function saveTransaction(transaction) {
    if (editingTransaction?.id) {
      await expenseApi.update(editingTransaction.id, transaction);
    } else {
      await expenseApi.create(transaction);
    }
    await loadTransactions();
  }
  async function askExpenseAssistant(message, history) { return expenseApi.askExpenseAssistant(message, history); }
  async function confirmAgentProposal(id, transaction) { const result = await expenseApi.confirmAgentProposal(id, transaction); await loadTransactions(); return result; }
  async function cancelAgentProposal(id) { return expenseApi.cancelAgentProposal(id); }
  // Floating Assistant tái sử dụng nguyên API Receipt OCR; không chạm vào flow Receipt hiện có.
  async function uploadAssistantReceipt(file) { return expenseApi.upload(file); }
  async function confirmAssistantReceipt(id, transaction) { const result = await expenseApi.confirmReceipt(id, transaction); await loadTransactions(); return result; }
  async function discardAssistantReceipt(id) { return expenseApi.deleteReceipt(id); }

  async function deleteTransaction(transaction) {
    if (!window.confirm(`Delete ${transaction.merchant}? If it was created from a receipt, its receipt image will also be deleted.`)) return;
    try {
      await expenseApi.remove(transaction.id);
      await loadTransactions();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function uploadReceipt(event) {
    const file = event.target.files?.[0];
    if (!file || processingReceipt || receipt) return;
    if (!RECEIPT_ACCEPTED_TYPES.includes(file.type) || file.size > MAX_RECEIPT_SIZE_BYTES) {
      setError('Upload a JPG, PNG, or WebP file up to 5 MB.');
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    let keepPreview = false;
    setError('');
    setProcessingReceipt({ file, previewUrl });
    try {
      const result = await expenseApi.upload(file);
      keepPreview = true;
      setReceipt({ id: result.receipt.id, file, previewUrl, localPreview: true, draft: result.receipt.extraction });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setProcessingReceipt(null);
      if (!keepPreview) URL.revokeObjectURL(previewUrl);
      event.target.value = '';
    }
  }

  function closeReceiptReview() {
    setReceipt((current) => {
      if (current?.localPreview && current.previewUrl) URL.revokeObjectURL(current.previewUrl);
      return null;
    });
    setView('transactions');
  }

  async function confirmReceipt(finalTransaction) {
    if (!receipt) return;
    await expenseApi.confirmReceipt(receipt.id, finalTransaction);
    await loadTransactions();
    await loadPendingReviews();
    closeReceiptReview();
  }

  async function discardReceipt() {
    if (!receipt) return;
    await expenseApi.deleteReceipt(receipt.id);
    await loadPendingReviews();
    closeReceiptReview();
  }

  async function resumePendingReview(pendingReceipt) {
    if (processingReceipt || receipt) return;
    try {
      setPendingActionId(pendingReceipt.id);
      setError('');
      const preview = await expenseApi.previewReceipt(pendingReceipt.id);
      setReceipt({
        id: pendingReceipt.id,
        file: { name: pendingReceipt.filename, size: pendingReceipt.size },
        previewUrl: preview.url,
        localPreview: false,
        draft: pendingReceipt.extraction,
      });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setPendingActionId(null);
    }
  }

  async function discardPendingReview(pendingReceipt) {
    try {
      setPendingActionId(pendingReceipt.id);
      setError('');
      await expenseApi.deleteReceipt(pendingReceipt.id);
      await loadPendingReviews();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setPendingActionId(null);
    }
  }

  return (
    <main className={`expense-shell${assistantOpen ? ' expense-shell--assistant-open' : ''}`}>
      <ExpenseSidebar activeView={view} onNavigate={setView} user={user} onSignOut={onSignOut} />
      <section className="expense-main">
        <header className="expense-header">
          <div><p className="eyebrow">PERSONAL FINANCE</p><h1>{pageTitle(view)}</h1></div>
          {view === 'transactions' && <button className="primary-button" onClick={() => setEditingTransaction(INITIAL_TRANSACTION)}>+ New transaction</button>}
        </header>
        {error && <div className="page-error">{error}<button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
        {view === 'receipt' && <div className="upload-card" aria-busy={Boolean(processingReceipt)}>
          <h2>Upload a receipt</h2>
          <p>Upload an image to prepare an expense transaction. You will always review and confirm the extracted data before it is saved.</p>
          {!processingReceipt && !receipt && pendingReviews.length > 0 && <section className="pending-receipts" aria-label="Pending receipt reviews">
            <div><p className="eyebrow">PENDING REVIEW</p><h3>Finish a previous receipt</h3><p>Your extracted receipt details are saved until you confirm or discard them.</p></div>
            <ul>
              {pendingReviews.map((pendingReceipt) => <li key={pendingReceipt.id}>
                <div><strong>{pendingReceipt.filename}</strong><small>{pendingReceipt.extraction?.merchant || 'Receipt draft'} · {pendingReceipt.createdAt ? new Date(pendingReceipt.createdAt).toLocaleDateString() : 'Pending'}</small></div>
                <div className="pending-receipt-actions"><button className="secondary-button" type="button" onClick={() => discardPendingReview(pendingReceipt)} disabled={Boolean(pendingActionId)}>{pendingActionId === pendingReceipt.id ? 'Working…' : 'Discard'}</button><button className="primary-button" type="button" onClick={() => resumePendingReview(pendingReceipt)} disabled={Boolean(pendingActionId)}>{pendingActionId === pendingReceipt.id ? 'Opening…' : 'Resume review'}</button></div>
              </li>)}
            </ul>
          </section>}
          {!processingReceipt && !receipt && <label className="upload-zone"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadReceipt} /><strong>Choose a receipt image</strong><small>JPG, PNG, or WebP · maximum 5 MB</small></label>}
          {processingReceipt && <section className="receipt-processing" role="status" aria-live="polite"><img src={processingReceipt.previewUrl} alt={`Selected receipt: ${processingReceipt.file.name}`} /><div><p className="eyebrow">PROCESSING RECEIPT</p><h3>Reading {processingReceipt.file.name}</h3><p>Uploading the image and extracting its details with Gemini. Please wait before choosing another receipt.</p></div><span className="receipt-spinner" aria-hidden="true" /></section>}
          {receipt && <ReceiptReview file={receipt.file} previewUrl={receipt.previewUrl} draft={receipt.draft} onConfirm={confirmReceipt} onDiscard={discardReceipt} />}
        </div>}
        {view === 'categories' && <div className="coming-soon"><h2>Categories are a secondary flow</h2><p>The final-project core is receipt-to-transaction and transaction CRUD. This page stays out of the primary demo flow until the core is validated.</p></div>}
        {view === 'transactions' && <>
          <section className="summary-grid" aria-label="Transaction page summary">
            <article className="summary-card summary-card--income"><span>Income on this page</span><strong>{formatMoney(summary.income)}</strong><small>Funds recorded in this result set</small></article>
            <article className="summary-card summary-card--expense"><span>Expenses on this page</span><strong>{formatMoney(summary.expense)}</strong><small>Spending recorded in this result set</small></article>
            <article className="summary-card summary-card--balance"><span>Balance on this page</span><strong>{formatMoney(summary.income - summary.expense)}</strong><small>Income less expenses shown</small></article>
          </section>
          <TransactionTable data={data} filters={filters} loading={loading} onChangeFilters={setFilters} onEdit={setEditingTransaction} onDelete={deleteTransaction} onSearch={loadTransactions} />
        </>}
      </section>
      {editingTransaction && <TransactionForm transaction={editingTransaction.id ? editingTransaction : null} onSave={saveTransaction} onClose={() => setEditingTransaction(null)} />}
      <AiExpenseAssistant userId={user.id} onAsk={askExpenseAssistant} onConfirmProposal={confirmAgentProposal} onCancelProposal={cancelAgentProposal} onReceiptUpload={uploadAssistantReceipt} onReceiptConfirm={confirmAssistantReceipt} onReceiptDiscard={discardAssistantReceipt} onTransactionsChanged={loadTransactions} onOpenChange={setAssistantOpen} />
    </main>
  );
}
