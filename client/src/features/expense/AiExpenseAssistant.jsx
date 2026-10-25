import { useEffect, useRef, useState } from 'react';
import ReceiptReview from '../receipts/ReceiptReview';
import TransactionFields from './TransactionFields';
import { MAX_RECEIPT_SIZE_BYTES, RECEIPT_ACCEPTED_TYPES } from './expenseConstants';
import { formatMoney } from './expenseFormatters';
import { loadExpenseAssistantHistory, makeConversation, saveExpenseAssistantHistory } from './expenseAssistantHistory';
import { WalletSparklesIcon } from '../../shared/components/Icons';
import { ASSISTANT_LABELS, ASSISTANT_QUICK_ACTIONS } from './expenseAssistantLabels';

function ResultCard({ message }) {
  const result = message.result;
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

function Proposal({ proposal, onConfirm, onCancel, busy }) {
  // Keep amount as a string while typing so users can delete and re-enter values.
  const [draft, setDraft] = useState({ ...proposal.transaction, amount: String(proposal.transaction.amount) });
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
        <button className="secondary-button" type="button" onClick={onCancel} disabled={busy}>
          {ASSISTANT_LABELS.PROPOSAL_CANCEL}
        </button>
        <button className="primary-button" type="button" onClick={submit} disabled={busy}>
          {busy ? ASSISTANT_LABELS.PROPOSAL_SAVING : ASSISTANT_LABELS.PROPOSAL_CONFIRM}
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
    if (!window.confirm(ASSISTANT_LABELS.DELETE_CONVERSATION_CONFIRM)) return;
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

  // Enter sends immediately like a chat message; Shift + Enter preserves newline in textarea.
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
      append('assistant', response.answer || ASSISTANT_LABELS.DEFAULT_SUCCESS_ANSWER, { toolName: response.toolName, result: response.toolResult });
      if (response.toolName === 'create_transaction') {
        setProposal(response.toolResult?.proposal || null);
      }
    } catch (requestError) {
      setError(requestError.message);
      append('assistant', ASSISTANT_LABELS.ERROR_GENERIC);
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
      append('assistant', ASSISTANT_LABELS.TRANSACTION_SAVED);
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
      append('assistant', ASSISTANT_LABELS.PROPOSAL_CANCELLED);
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
      setError(ASSISTANT_LABELS.RECEIPT_RESTRICTION);
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
    append('assistant', ASSISTANT_LABELS.RECEIPT_SAVED);
    await onTransactionsChanged();
  }

  async function discardReceipt() {
    if (!receipt) return;
    await onReceiptDiscard(receipt.id);
    URL.revokeObjectURL(receipt.previewUrl);
    setReceipt(null);
    append('assistant', ASSISTANT_LABELS.RECEIPT_DISCARDED);
  }

  return (
    <div className="ai-assistant">
      <button className="ai-fab" type="button" onClick={() => setAssistantOpen(!open)} aria-label={`Open ${ASSISTANT_LABELS.HEADER_TITLE}`}>
        <WalletSparklesIcon />
      </button>
      {open && (
        <section className="ai-chat-card" aria-label={ASSISTANT_LABELS.HEADER_TITLE}>
          <header className="ai-chat-header">
            <span className="ai-avatar"><WalletSparklesIcon /></span>
            <div>
              <h2>{ASSISTANT_LABELS.HEADER_TITLE}</h2>
              <small>{ASSISTANT_LABELS.HEADER_SUBTITLE}</small>
            </div>
            <div className="ai-header-actions">
              <button type="button" onClick={newConversation} title={ASSISTANT_LABELS.NEW_CHAT_TOOLTIP}>＋</button>
              <button type="button" onClick={() => setTab('history')} title={ASSISTANT_LABELS.HISTORY_TOOLTIP}>◴</button>
              <button type="button" onClick={() => setAssistantOpen(false)} title={ASSISTANT_LABELS.CLOSE_TOOLTIP}>×</button>
            </div>
          </header>

          <div className="ai-tabs">
            <button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>{ASSISTANT_LABELS.TAB_CHAT}</button>
            <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>{ASSISTANT_LABELS.TAB_HISTORY}</button>
          </div>

          {tab === 'history' ? (
            <div className="ai-history">
              {conversations.map((item) => (
                <div key={item.id}>
                  <button type="button" onClick={() => { setActiveId(item.id); setTab('chat'); }}>
                    {item.title}
                  </button>
                  <button type="button" onClick={() => removeConversation(item.id)} aria-label={ASSISTANT_LABELS.DELETE_CONVERSATION_LABEL}>
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
                      <h3>{ASSISTANT_LABELS.WELCOME_QUESTION}</h3>
                    </section>
                    <div className="ai-quick-actions">
                      {ASSISTANT_QUICK_ACTIONS.map(([icon, label, prompt]) => (
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
                    <p>{ASSISTANT_LABELS.PROCESSING}</p>
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
                  <button type="button" onClick={() => setMenuOpen((value) => !value)} aria-label={ASSISTANT_LABELS.ADD_RECEIPT_LABEL}>
                    +
                  </button>
                  {menuOpen && (
                    <div>
                      <button type="button" onClick={() => imageInputRef.current?.click()}>
                        {ASSISTANT_LABELS.ATTACH_RECEIPT}
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
                  placeholder={ASSISTANT_LABELS.INPUT_PLACEHOLDER}
                  disabled={busy}
                />
                <button className="primary-button" type="submit" disabled={busy || !message.trim()}>
                  {ASSISTANT_LABELS.SEND_BUTTON}
                </button>
              </form>
            </>
          )}
        </section>
      )}
    </div>
  );
}
