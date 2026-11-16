import {
  loadChatHistory,
  saveChatHistory,
  clearChatHistory,
  makeConversation,
  buildHistoryPayload,
} from './chatHistory.js';
import { sendChatMessage, chatHistoryApi } from './chatApi.js';

/**
 * Framework-free controller for database-backed Chat History with lightweight
 * local cache and stale-request protection.
 */
export function createChatController({
  namespace = 'chat',
  onSendMessage = sendChatMessage,
  onSendMessageStream = null,
  onProposal = null,
  historyApi = chatHistoryApi,
  storage = typeof window !== 'undefined' ? window.localStorage : null,
  onStateChange,
} = {}) {
  let activeUserId = null;
  let userSeq = 0;
  let selectionSeq = 0;
  let requestSeq = 0;
  let activeAbortController = null;
  let activeStreamingMsgId = null;
  let activeStreamingConvId = null;

  let state = {
    conversations: [],
    activeId: '',
    busy: false,
    streaming: false,
    error: '',
    historyLoading: false,
    historyError: '',
  };

  function setState(patch) {
    state = typeof patch === 'function' ? patch(state) : { ...state, ...patch };
    if (activeUserId && storage) {
      saveChatHistory(storage, activeUserId, state.conversations, namespace);
    }
    onStateChange?.(state);
  }

  function getActive() {
    return state.conversations.find((item) => item.id === state.activeId) || null;
  }

  async function selectConversation(id) {
    if (!id) return;
    const seq = ++selectionSeq;
    const currentUserSeq = userSeq;
    const targetUserId = activeUserId;

    setState((prev) => ({ ...prev, activeId: id, error: '' }));

    const target = state.conversations.find((c) => c.id === id);
    if (!targetUserId || !target?.persisted || target.messagesLoaded) {
      return;
    }

    try {
      const data = await historyApi.getConversation(id);
      if (currentUserSeq !== userSeq || activeUserId !== targetUserId || selectionSeq !== seq) {
        return;
      }
      const messages = Array.isArray(data?.messages) ? data.messages : [];
      setState((prev) => ({
        ...prev,
        conversations: prev.conversations.map((item) =>
          item.id === id
            ? {
                ...item,
                title: data?.conversation?.title || item.title,
                updatedAt: data?.conversation?.updatedAt || item.updatedAt,
                persisted: true,
                messagesLoaded: true,
                messages,
              }
            : item
        ),
      }));
    } catch (err) {
      if (currentUserSeq !== userSeq || activeUserId !== targetUserId || selectionSeq !== seq) {
        return;
      }
      setState((prev) => ({
        ...prev,
        historyError: err?.message || 'Failed to load conversation messages.',
      }));
    }
  }

  async function loadUserConversations(nextUserId) {
    const prevUserId = activeUserId;
    const normalized = typeof nextUserId === 'string' && nextUserId.trim() ? nextUserId.trim() : null;

    if (prevUserId && prevUserId !== normalized && storage) {
      clearChatHistory(storage, prevUserId, namespace);
    }

    activeUserId = normalized;
    const currentUserSeq = ++userSeq;
    selectionSeq += 1;

    if (!normalized) {
      state = {
        conversations: [],
        activeId: '',
        busy: false,
        error: '',
        historyLoading: false,
        historyError: '',
      };
      onStateChange?.(state);
      return [];
    }

    // Show lightweight cache immediately while fetching authoritative DB state
    const cached = loadChatHistory(storage, normalized, namespace);
    const fallbackFirst = cached[0] || { ...makeConversation(), persisted: false, messagesLoaded: true };
    setState({
      conversations: cached.length ? cached : [fallbackFirst],
      activeId: fallbackFirst.id,
      busy: false,
      error: '',
      historyLoading: true,
      historyError: '',
    });

    try {
      const data = await historyApi.listConversations();
      if (currentUserSeq !== userSeq || activeUserId !== normalized) {
        return [];
      }

      const dbConversations = Array.isArray(data?.conversations) ? data.conversations : [];
      if (dbConversations.length === 0) {
        const fresh = { ...makeConversation(), persisted: false, messagesLoaded: true };
        setState({
          conversations: [fresh],
          activeId: fresh.id,
          busy: false,
          error: '',
          historyLoading: false,
          historyError: '',
        });
        return [fresh];
      }

      const hydratedList = dbConversations.map((conv) => ({
        ...conv,
        persisted: true,
        messagesLoaded: false,
        messages: [],
      }));

      const firstId = hydratedList[0].id;
      setState({
        conversations: hydratedList,
        activeId: firstId,
        busy: false,
        error: '',
        historyLoading: false,
        historyError: '',
      });

      await selectConversation(firstId);
      return state.conversations;
    } catch (err) {
      if (currentUserSeq !== userSeq || activeUserId !== normalized) {
        return [];
      }
      setState((prev) => ({
        ...prev,
        historyLoading: false,
        historyError: err?.message || 'Failed to load chat history.',
      }));
      return state.conversations;
    }
  }

  function updateConversation(conversationId, mutator) {
    setState((prev) => ({
      ...prev,
      conversations: prev.conversations.map((item) =>
        item.id === conversationId ? mutator(item) : item
      ),
    }));
  }

  async function ensureConversationPersisted(conversationId, initialTitle) {
    const conv = state.conversations.find((c) => c.id === conversationId);
    if (!conv || conv.persisted || !activeUserId) return;

    const currentUserSeq = userSeq;
    const created = await historyApi.createConversation({
      id: conversationId,
      title: initialTitle || conv.title || 'New conversation',
    });
    if (currentUserSeq !== userSeq) return;

    updateConversation(conversationId, (item) => ({
      ...item,
      title: created?.conversation?.title || item.title,
      updatedAt: created?.conversation?.updatedAt || item.updatedAt,
      persisted: true,
      messagesLoaded: true,
    }));
  }

  async function appendMessageToConversation(conversationId, role, text, extra = {}, persist = true) {
    const msgId = extra.id || crypto.randomUUID();
    const isFirstUserMsg = (() => {
      const conv = state.conversations.find((c) => c.id === conversationId);
      return conv && conv.messages.length === 0 && role === 'user';
    })();
    const nextTitle = isFirstUserMsg ? text.slice(0, 48) : undefined;

    updateConversation(conversationId, (item) => ({
      ...item,
      title: nextTitle || item.title,
      updatedAt: new Date().toISOString(),
      messages: [
        ...item.messages,
        { id: msgId, role, text, ...extra },
      ],
    }));

    if (!persist || !activeUserId) return;

    try {
      await ensureConversationPersisted(conversationId, nextTitle);
      if (isFirstUserMsg) {
        await historyApi.updateConversation(conversationId, { title: nextTitle }).catch(() => {});
      }
      await historyApi.appendMessage(conversationId, {
        id: msgId,
        role,
        text,
        toolName: extra.toolName ?? null,
        result: extra.result ?? null,
        sources: Array.isArray(extra.sources) ? extra.sources : [],
      });
    } catch {
      // Message remains in UI state; error surfaced if send flow fails
    }
  }

  function appendMessage(role, text, extra = {}) {
    return appendMessageToConversation(state.activeId, role, text, extra, true);
  }

  function handleRevealComplete(messageId) {
    updateConversation(state.activeId, (item) => ({
      ...item,
      messages: item.messages.map((msg) =>
        msg.id === messageId ? { ...msg, isNew: false } : msg
      ),
    }));
  }

  function newConversation() {
    const active = getActive();
    if (active && (!active.messages || active.messages.length === 0)) {
      setState((prev) => ({ ...prev, error: '' }));
      return active;
    }
    const next = { ...makeConversation(), persisted: false, messagesLoaded: true };
    setState((prev) => ({
      ...prev,
      conversations: [next, ...prev.conversations].slice(0, 20),
      activeId: next.id,
      error: '',
    }));
    return next;
  }

  async function removeConversation(id) {
    const target = state.conversations.find((item) => item.id === id);
    if (target?.persisted && activeUserId) {
      await historyApi.deleteConversation(id);
    }

    const remaining = state.conversations.filter((item) => item.id !== id);
    if (id === state.activeId) {
      const next = remaining[0] || { ...makeConversation(), persisted: false, messagesLoaded: true };
      setState((prev) => ({
        ...prev,
        conversations: remaining.length ? remaining : [next],
        activeId: next.id,
        error: '',
      }));
      if (next.persisted && !next.messagesLoaded) {
        await selectConversation(next.id);
      }
    } else {
      setState((prev) => ({ ...prev, conversations: remaining }));
    }
  }

  function updateMessageInConversation(conversationId, messageId, mutator) {
    updateConversation(conversationId, (item) => ({
      ...item,
      updatedAt: new Date().toISOString(),
      messages: item.messages.map((msg) => (msg.id === messageId ? mutator(msg) : msg)),
    }));
  }

  function stopStreaming() {
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }
    if (activeStreamingConvId && activeStreamingMsgId) {
      updateMessageInConversation(activeStreamingConvId, activeStreamingMsgId, (msg) => ({
        ...msg,
        status: 'aborted',
        isStreaming: false,
      }));
    }
    activeStreamingConvId = null;
    activeStreamingMsgId = null;
    setState((prev) => ({ ...prev, busy: false, streaming: false }));
  }

  async function runStreamAttempt({
    targetConversationId,
    userMessageId,
    text,
    history,
    retryOfMessageId = null,
  }) {
    const reqSeq = ++requestSeq;
    const currentUserSeq = userSeq;
    const requestId = crypto.randomUUID();
    const initialAssistantId = crypto.randomUUID();
    let currentAssistantId = initialAssistantId;

    const abortController = new AbortController();
    activeAbortController = abortController;
    activeStreamingConvId = targetConversationId;
    activeStreamingMsgId = initialAssistantId;

    const isStale = () => reqSeq !== requestSeq || currentUserSeq !== userSeq;

    updateConversation(targetConversationId, (item) => ({
      ...item,
      persisted: true,
      updatedAt: new Date().toISOString(),
      messages: [
        ...item.messages,
        {
          id: initialAssistantId,
          role: 'assistant',
          text: '',
          status: 'streaming',
          isStreaming: true,
          streamed: true,
          replyTo: userMessageId,
          requestId,
        },
      ],
    }));

    setState((prev) => ({ ...prev, error: '', busy: true, streaming: true }));

    try {
      await onSendMessageStream(text, history, {
        conversationId: targetConversationId,
        requestId,
        userMessageId,
        ...(retryOfMessageId ? { retryOfMessageId } : {}),
        signal: abortController.signal,
        onEvent: async (eventType, data) => {
          if (isStale()) return;

          if (eventType === 'meta') {
            if (data?.assistantMessageId && data.assistantMessageId !== currentAssistantId) {
              const nextId = data.assistantMessageId;
              updateMessageInConversation(targetConversationId, currentAssistantId, (msg) => ({
                ...msg,
                id: nextId,
              }));
              currentAssistantId = nextId;
              activeStreamingMsgId = nextId;
            }
          } else if (eventType === 'delta') {
            const chunkText = typeof data?.text === 'string' ? data.text : '';
            if (chunkText) {
              updateMessageInConversation(targetConversationId, currentAssistantId, (msg) => ({
                ...msg,
                text: `${msg.text || ''}${chunkText}`,
              }));
            }
          } else if (eventType === 'proposal') {
            const staged = onProposal
              ? await onProposal(data, { conversationId: targetConversationId })
              : null;
            updateMessageInConversation(targetConversationId, currentAssistantId, (msg) => ({
              ...msg,
              toolName: 'propose_transaction',
              result: staged || {
                sourceType: data?.sourceType || 'assistant_proposal',
                sourceRef: data?.sourceRef || targetConversationId,
                draft: data?.proposal || data?.draft || data,
              },
            }));
          } else if (eventType === 'sources') {
            const nextSources = Array.isArray(data?.sources) ? data.sources : [];
            updateMessageInConversation(targetConversationId, currentAssistantId, (msg) => ({
              ...msg,
              sources: nextSources,
            }));
          } else if (eventType === 'done') {
            updateMessageInConversation(targetConversationId, currentAssistantId, (msg) => ({
              ...msg,
              text: data?.answer || msg.text || 'Done.',
              status: 'completed',
              isStreaming: false,
              streamed: true,
              ...(data?.toolName ? { toolName: data.toolName } : {}),
              ...(data?.toolResult && !msg.result ? { result: data.toolResult } : {}),
              ...(Array.isArray(data?.sources) ? { sources: data.sources } : {}),
            }));
          } else if (eventType === 'error') {
            const errMsg = data?.error || 'Stream failed.';
            updateMessageInConversation(targetConversationId, currentAssistantId, (msg) => ({
              ...msg,
              status: 'failed',
              isStreaming: false,
              errorMessage: errMsg,
            }));
            setState((prev) => ({ ...prev, error: errMsg }));
          }
        },
      });
    } catch (err) {
      if (isStale()) return;

      if (err?.name === 'AbortError' || abortController.signal.aborted) {
        updateMessageInConversation(targetConversationId, currentAssistantId, (msg) => ({
          ...msg,
          status: 'aborted',
          isStreaming: false,
        }));
        return;
      }

      const errMsg = err?.message || 'Failed to stream response.';
      updateMessageInConversation(targetConversationId, currentAssistantId, (msg) => ({
        ...msg,
        status: 'failed',
        isStreaming: false,
        errorMessage: errMsg,
      }));
      setState((prev) => ({ ...prev, error: errMsg }));
      throw err;
    } finally {
      if (activeAbortController === abortController) {
        activeAbortController = null;
      }
      if (reqSeq === requestSeq) {
        activeStreamingConvId = null;
        activeStreamingMsgId = null;
        setState((prev) => ({ ...prev, busy: false, streaming: false }));
      }
    }
  }

  async function sendMessage(text) {
    const active = getActive();
    const trimmed = (text || '').trim();
    if (!trimmed || state.busy || !active) return;
    if (trimmed.length > 1000) {
      setState((prev) => ({
        ...prev,
        error: 'Message exceeds the 1000-character limit. Please shorten your message.',
      }));
      return;
    }

    const targetConversationId = active.id;
    const history = buildHistoryPayload(active.messages, 8, 1000);
    const userMessageId = crypto.randomUUID();

    if (typeof onSendMessageStream === 'function') {
      const isFirstUserMsg = active.messages.length === 0;
      const nextTitle = isFirstUserMsg ? trimmed.slice(0, 48) : undefined;
      updateConversation(targetConversationId, (item) => ({
        ...item,
        title: nextTitle || item.title,
        updatedAt: new Date().toISOString(),
        messages: [
          ...item.messages,
          { id: userMessageId, role: 'user', text: trimmed, status: 'completed' },
        ],
      }));

      return runStreamAttempt({
        targetConversationId,
        userMessageId,
        text: trimmed,
        history,
      });
    }

    setState((prev) => ({ ...prev, error: '', busy: true }));
    await appendMessageToConversation(targetConversationId, 'user', trimmed, { id: userMessageId }, true);

    try {
      const response = await onSendMessage(trimmed, history, { conversationId: targetConversationId });
      await appendMessageToConversation(
        targetConversationId,
        'assistant',
        response?.answer || 'Done.',
        {
          toolName: response?.toolName,
          result: response?.toolResult,
          sources: response?.sources,
          isNew: true,
        },
        true
      );
      return response;
    } catch (requestError) {
      setState((prev) => ({ ...prev, error: requestError.message }));
      await appendMessageToConversation(
        targetConversationId,
        'assistant',
        'Sorry, I encountered an error processing your request.',
        {},
        true
      );
      throw requestError;
    } finally {
      setState((prev) => ({ ...prev, busy: false }));
    }
  }

  async function retryMessage(assistantMessageId) {
    const active = getActive();
    if (!active || state.busy || typeof onSendMessageStream !== 'function') return;

    const targetIndex = active.messages.findIndex((m) => m.id === assistantMessageId);
    if (targetIndex === -1) return;
    const failedMsg = active.messages[targetIndex];

    let userMsg = failedMsg.replyTo
      ? active.messages.find((m) => m.id === failedMsg.replyTo && m.role === 'user')
      : null;
    if (!userMsg) {
      for (let i = targetIndex - 1; i >= 0; i -= 1) {
        if (active.messages[i].role === 'user') {
          userMsg = active.messages[i];
          break;
        }
      }
    }
    if (!userMsg?.text) return;

    const priorMessages = active.messages.slice(0, active.messages.findIndex((m) => m.id === userMsg.id));
    const history = buildHistoryPayload(priorMessages, 8, 1000);

    return runStreamAttempt({
      targetConversationId: active.id,
      userMessageId: userMsg.id,
      text: userMsg.text,
      history,
      retryOfMessageId: assistantMessageId,
    });
  }

  return {
    getState: () => state,
    loadUserConversations,
    selectConversation,
    setConversations: (updater) =>
      setState((prev) => ({
        ...prev,
        conversations: typeof updater === 'function' ? updater(prev.conversations) : updater,
      })),
    setBusy: (busy) => setState((prev) => ({ ...prev, busy })),
    setError: (error) => setState((prev) => ({ ...prev, error })),
    sendMessage,
    stopStreaming,
    retryMessage,
    appendMessage,
    handleRevealComplete,
    newConversation,
    removeConversation,
  };
}
