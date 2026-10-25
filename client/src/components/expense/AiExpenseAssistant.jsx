import { useEffect, useRef, useState } from 'react';
import ReceiptReview from './ReceiptReview';
import TransactionFields, { VIETNAMESE_TRANSACTION_LABELS } from './TransactionFields';
import { MAX_RECEIPT_SIZE_BYTES, RECEIPT_ACCEPTED_TYPES } from './expenseConstants';
import { formatMoney } from './expenseFormatters';
import { loadExpenseAssistantHistory, makeConversation, saveExpenseAssistantHistory } from './expenseAssistantHistory';

const QUICK_ACTIONS = [
  ['⌕', 'Tìm giao dịch', 'Tìm các giao dịch chi tiêu gần đây của tôi.'],
  ['◴', 'Tổng hợp thu chi', 'Tháng này tôi đã thu và chi bao nhiêu tiền?'],
  ['◌', 'Chi tiêu theo danh mục', 'Tháng này tôi chi nhiều nhất vào danh mục nào?'],
  ['＋', 'Thêm giao dịch', 'Hôm nay tôi mua cà phê 45.000 đồng.'],
];

function WalletSparklesIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        className="assistant-icon__wallet"
        d="M4 7.5A2.5 2.5 0 0 1 6.5 5H17a2 2 0 0 1 2 2v1H6.5a2.5 2.5 0 0 0 0 5H20v3.5a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-9ZM20 9v4h-2.5a2 2 0 1 1 0-4H20Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        className="assistant-icon__sparkle"
        d="m18.5 2 .45 1.05L20 3.5l-1.05.45L18.5 5l-.45-1.05L17 3.5l1.05-.45L18.5 2Zm3 3 .32.68L22.5 6l-.68.32L21.5 7l-.32-.68L20.5 6l.68-.32L21.5 5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ResultCard({ message }) {
  const result = message.result;
  if (!result) return null;

  if (message.toolName === 'search_transactions') {
    return (
      <section className="agent-result-card">
        <div className="agent-result-heading">
          <h3>Giao dịch tìm được</h3>
          <span>{result.total} kết quả</span>
        </div>
        {result.total === 0 ? (
          <p className="agent-empty">Không có giao dịch phù hợp.</p>
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
          <h3>Tổng kết chi tiêu</h3>
          <span>{result.period?.from} → {result.period?.to}</span>
        </div>
        <div className="agent-summary-grid">
          <div>
            <span>Tổng thu</span>
            <strong className="income">{formatMoney(result.totalIncome)}</strong>
          </div>
          <div>
            <span>Tổng chi</span>
            <strong className="expense">{formatMoney(result.totalExpense)}</strong>
          </div>
          <div>
            <span>Số dư</span>
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

function Proposal({ proposal, onConfirm, onCancel, busy }) {
  // Giữ amount là chuỗi trong lúc gõ để người dùng có thể xóa rồi nhập lại.
  const [draft, setDraft] = useState({ ...proposal.transaction, amount: String(proposal.transaction.amount) });
  const [validationError, setValidationError] = useState('');

  function submit() {
    const amount = Number(draft.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setValidationError('Số tiền phải lớn hơn 0.');
      return;
    }
    // Dấu âm không quyết định loại giao dịch: chỉ gửi amount dương và type rõ ràng.
    onConfirm({ ...draft, amount, items: draft.items || [] });
  }

  return (
    <section className="agent-proposal">
      <h3>Kiểm tra trước khi lưu</h3>
      <p>Đây là proposal, chưa được lưu vào Supabase.</p>
      <TransactionFields
        values={draft}
        onChange={(next) => {
          setDraft(next);
          setValidationError('');
        }}
        disabled={busy}
        labels={VIETNAMESE_TRANSACTION_LABELS}
        className="agent-proposal-fields"
      />
      {validationError && <p className="form-error">{validationError}</p>}
      <div className="modal-actions">
        <button className="secondary-button" type="button" onClick={onCancel} disabled={busy}>
          Hủy
        </button>
        <button className="primary-button" type="button" onClick={submit} disabled={busy}>
          {busy ? 'Đang lưu…' : 'Xác nhận'}
        </button>
      </div>
    </section>
  );
}

export default function AiExpenseAssistant({
  userId,
  onAsk,
  onConfirmProposal,
  onCancelProposal,
  onReceiptUpload,
  onReceiptConfirm,
  onReceiptDiscard,
  onTransactionsChanged,
  onOpenChange,
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('chat');
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  const imageInputRef = useRef(null);
  const conversationRef = useRef(null);
  const active = conversations.find((item) => item.id === activeId);

  useEffect(() => {
    const saved = loadExpenseAssistantHistory(window.localStorage, userId);
    const first = saved[0] || makeConversation();
    setConversations(saved.length ? saved : [first]);
    setActiveId(first.id);
    setProposal(null);
    setReceipt(null);
  }, [userId]);

  useEffect(() => {
    if (userId) {
      saveExpenseAssistantHistory(window.localStorage, userId, conversations);
    }
  }, [conversations, userId]);

  useEffect(() => {
    if (conversationRef.current) {
      conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
    }
  }, [active?.messages, busy, proposal, receipt]);

  function updateActive(mutator) {
    setConversations((items) => items.map((item) => (item.id === activeId ? mutator(item) : item)));
  }

  function append(role, text, extra = {}) {
    updateActive((item) => ({
      ...item,
      title: item.messages.length === 0 && role === 'user' ? text.slice(0, 48) : item.title,
      updatedAt: new Date().toISOString(),
      messages: [...item.messages, { id: crypto.randomUUID(), role, text, ...extra }],
    }));
  }

  function newConversation() {
    const next = makeConversation();
    setConversations((items) => [next, ...items].slice(0, 10));
    setActiveId(next.id);
    setTab('chat');
    setProposal(null);
    setReceipt(null);
    setError('');
  }

  function removeConversation(id) {
    if (!window.confirm('Xóa lịch sử hội thoại này? Giao dịch đã lưu sẽ không bị xóa.')) return;
    const remaining = conversations.filter((item) => item.id !== id);
    const next = remaining[0] || makeConversation();
    setConversations(remaining.length ? remaining : [next]);
    setActiveId(next.id);
    setTab('chat');
  }

  function setAssistantOpen(next) {
    setOpen(next);
    onOpenChange?.(next);
  }

  // Enter gửi ngay như chat; Shift + Enter giữ hành vi xuống dòng của textarea.
  function handleComposerKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  async function send(event) {
    event.preventDefault();
    if (!message.trim() || busy || !active) return;
    const text = message.trim();
    const history = active.messages.slice(-8).map(({ role, text: previousText }) => ({ role, text: previousText }));
    setMessage('');
    setError('');
    setBusy(true);
    append('user', text);
    try {
      const response = await onAsk(text, history);
      append('assistant', response.answer || 'Đã xử lý yêu cầu.', { toolName: response.toolName, result: response.toolResult });
      if (response.toolName === 'create_transaction') {
        setProposal(response.toolResult?.proposal || null);
      }
    } catch (requestError) {
      setError(requestError.message);
      append('assistant', 'Không thể xử lý yêu cầu. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmProposal(transaction) {
    if (!proposal) return;
    setBusy(true);
    try {
      await onConfirmProposal(proposal.id, transaction);
      setProposal(null);
      append('assistant', 'Đã lưu giao dịch thành công.');
      await onTransactionsChanged();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function cancelProposal() {
    if (!proposal) return;
    setBusy(true);
    try {
      await onCancelProposal(proposal.id);
      setProposal(null);
      append('assistant', 'Đã hủy proposal. Chưa có giao dịch nào được lưu.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function chooseReceipt(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    setMenuOpen(false);
    if (!file) return;
    if (!RECEIPT_ACCEPTED_TYPES.includes(file.type) || file.size > MAX_RECEIPT_SIZE_BYTES) {
      setError('Chỉ nhận JPG, PNG hoặc WebP tối đa 5 MB.');
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setBusy(true);
    setError('');
    try {
      const response = await onReceiptUpload(file);
      setReceipt({ id: response.receipt.id, file, previewUrl, draft: response.receipt.extraction });
    } catch (requestError) {
      URL.revokeObjectURL(previewUrl);
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmReceipt(transaction) {
    if (!receipt) return;
    await onReceiptConfirm(receipt.id, transaction);
    URL.revokeObjectURL(receipt.previewUrl);
    setReceipt(null);
    append('assistant', 'Đã xác nhận và lưu giao dịch từ hóa đơn.');
    await onTransactionsChanged();
  }

  async function discardReceipt() {
    if (!receipt) return;
    await onReceiptDiscard(receipt.id);
    URL.revokeObjectURL(receipt.previewUrl);
    setReceipt(null);
    append('assistant', 'Đã hủy hóa đơn nháp.');
  }

  return (
    <div className="ai-assistant">
      <button className="ai-fab" type="button" onClick={() => setAssistantOpen(!open)} aria-label="Mở Spendwise Assistant">
        <WalletSparklesIcon />
      </button>
      {open && (
        <section className="ai-chat-card" aria-label="Spendwise Assistant">
          <header className="ai-chat-header">
            <span className="ai-avatar"><WalletSparklesIcon /></span>
            <div>
              <h2>Spendwise Assistant</h2>
              <small>Expense Assistant</small>
            </div>
            <div className="ai-header-actions">
              <button type="button" onClick={newConversation} title="Tạo cuộc trò chuyện mới">＋</button>
              <button type="button" onClick={() => setTab('history')} title="Lịch sử">◴</button>
              <button type="button" onClick={() => setAssistantOpen(false)} title="Đóng">×</button>
            </div>
          </header>

          <div className="ai-tabs">
            <button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>Chat</button>
            <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>Lịch sử</button>
          </div>

          {tab === 'history' ? (
            <div className="ai-history">
              {conversations.map((item) => (
                <div key={item.id}>
                  <button type="button" onClick={() => { setActiveId(item.id); setTab('chat'); }}>
                    {item.title}
                  </button>
                  <button type="button" onClick={() => removeConversation(item.id)} aria-label="Xóa hội thoại">
                    ⌫
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="ai-chat-history" ref={conversationRef}>
                {!active?.messages.length && (
                  <>
                    <section className="ai-welcome">
                      <span className="ai-avatar"><WalletSparklesIcon /></span>
                      <h3>Hôm nay mình có thể giúp gì cho bạn?</h3>
                    </section>
                    <div className="ai-quick-actions">
                      {QUICK_ACTIONS.map(([icon, label, prompt]) => (
                        <button type="button" key={label} onClick={() => setMessage(prompt)}>
                          <span>{icon}</span>
                          {label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {active?.messages.map((item) => (
                  <article className={`ai-message ai-message--${item.role}`} key={item.id}>
                    {item.role === 'assistant' && (
                      <span className="ai-avatar"><WalletSparklesIcon /></span>
                    )}
                    <div>
                      <p>{item.text}</p>
                      {item.toolName && <small>Hàm: {item.toolName}</small>}
                      {item.role === 'assistant' && <ResultCard message={item} />}
                    </div>
                  </article>
                ))}
                {busy && (
                  <article className="ai-message ai-message--assistant">
                    <span className="ai-avatar"><WalletSparklesIcon /></span>
                    <p>Đang xử lý…</p>
                  </article>
                )}
                {error && <p className="form-error">{error}</p>}
                {proposal && (
                  <Proposal
                    proposal={proposal}
                    onConfirm={confirmProposal}
                    onCancel={cancelProposal}
                    busy={busy}
                  />
                )}
                {receipt && (
                  <ReceiptReview
                    file={receipt.file}
                    previewUrl={receipt.previewUrl}
                    draft={receipt.draft}
                    onConfirm={confirmReceipt}
                    onDiscard={discardReceipt}
                  />
                )}
              </div>

              <form className="ai-chat-input" onSubmit={send}>
                <div className="ai-plus">
                  <button type="button" onClick={() => setMenuOpen((value) => !value)} aria-label="Thêm hóa đơn">
                    +
                  </button>
                  {menuOpen && (
                    <div>
                      <button type="button" onClick={() => imageInputRef.current?.click()}>
                        Tải ảnh hóa đơn
                      </button>
                    </div>
                  )}
                </div>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  hidden
                  onChange={chooseReceipt}
                />
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  placeholder="Nhập tin nhắn…"
                  disabled={busy}
                />
                <button className="primary-button" type="submit" disabled={busy || !message.trim()}>
                  Gửi
                </button>
              </form>
            </>
          )}
        </section>
      )}
    </div>
  );
}
