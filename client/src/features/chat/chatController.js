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
  let nextReqSeq = 0;
  const activeGenerations = new Map();
  const persistingConversations = new Map();
  const deletingConversations = new Map();

  function isPersistableConversation(conv) {
    return Boolean(conv?.persisted) || (Array.isArray(conv?.messages) && conv.messages.length > 0);
  }

  let state = {
    conversations: [],
    activeId: '',
    busyByConversation: {},
    busy: false,
    streaming: false,
    error: '',
    historyLoading: false,
    historyError: '',
  };

  function setState(patch) {
    const next = typeof patch === 'function' ? patch(state) : { ...state, ...patch };
    const activeGen = next.busyByConversation?.[next.activeId];
    state = {
      ...next,
      busy: Boolean(activeGen?.busy),
      streaming: Boolean(activeGen?.streaming),
    };
    if (activeUserId && storage) {
      saveChatHistory(storage, activeUserId, state.conversations.filter(isPersistableConversation), namespace);
    }
    onStateChange?.(state);
  }

  function setConversationGenerationState(conversationId, genState) {
    if (!conversationId) return;
    setState((prev) => {
      const nextMap = { ...(prev.busyByConversation || {}) };
      if (!genState || (!genState.busy && !genState.streaming)) {
        delete nextMap[conversationId];
      } else {
        nextMap[conversationId] = {
          busy: Boolean(genState.busy),
          streaming: Boolean(genState.streaming),
        };
      }
      return { ...prev, busyByConversation: nextMap };
    });
  }

  function clearAllGenerations() {
    for (const entry of activeGenerations.values()) {
      entry?.abortController?.abort();
    }
    activeGenerations.clear();
  }

  function getActive() {
    return state.conversations.find((item) => item.id === state.activeId) || null;
  }

  async function selectConversation(id) {
    if (!id) return;
    const seq = ++selectionSeq;
    const currentUserSeq = userSeq;
    const targetUserId = activeUserId;

    setState((prev) => ({
      ...prev,
      conversations: prev.conversations.filter((item) => item.id === id || isPersistableConversation(item)),
      activeId: id,
      error: '',
    }));

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

    clearAllGenerations();
    activeUserId = normalized;
    const currentUserSeq = ++userSeq;
    selectionSeq += 1;

    if (!normalized) {
      state = {
        conversations: [],
        activeId: '',
        busyByConversation: {},
        busy: false,
        streaming: false,
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
    if (persistingConversations.has(conversationId)) {
      return persistingConversations.get(conversationId);
    }

    const currentUserSeq = userSeq;
    const persistPromise = (async () => {
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
    })();

    persistingConversations.set(conversationId, persistPromise);
    try {
      await persistPromise;
    } finally {
      persistingConversations.delete(conversationId);
    }
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
    if (active && !isPersistableConversation(active)) {
      setState((prev) => ({ ...prev, error: '' }));
      return active;
    }
    const existingDraft = state.conversations.find((item) => !isPersistableConversation(item));
    if (existingDraft) {
      setState((prev) => ({ ...prev, activeId: existingDraft.id, error: '' }));
      return existingDraft;
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

  async function renameConversation(id, title) {
    const trimmed = typeof title === 'string' ? title.trim() : '';
    if (!id || !trimmed) return null;
    const target = state.conversations.find((item) => item.id === id);
    if (!target) return null;

    updateConversation(id, (item) => ({
      ...item,
      title: trimmed,
      updatedAt: new Date().toISOString(),
    }));

    if (target.persisted && activeUserId) {
      try {
        const updated = await historyApi.updateConversation(id, { title: trimmed });
        if (updated?.conversation?.title) {
          updateConversation(id, (item) => ({
            ...item,
            title: updated.conversation.title,
            updatedAt: updated.conversation.updatedAt || item.updatedAt,
          }));
        }
      } catch (err) {
        updateConversation(id, (item) => ({
          ...item,
          title: target.title,
        }));
        setState((prev) => ({
          ...prev,
          error: err?.message || 'Failed to rename conversation.',
        }));
        throw err;
      }
    }
    return state.conversations.find((item) => item.id === id) || null;
  }

  async function removeConversation(id) {
    if (!id) return;
    if (deletingConversations.has(id)) {
      return deletingConversations.get(id);
    }

    const currentUserSeq = userSeq;
    const deletePromise = (async () => {
      const target = state.conversations.find((item) => item.id === id);
      if (target?.persisted && activeUserId) {
        try {
          await historyApi.deleteConversation(id);
        } catch (err) {
          if (currentUserSeq === userSeq) {
            setState((prev) => ({
              ...prev,
              error: err?.message || 'Failed to delete conversation.',
            }));
          }
          throw err;
        }
      }

      if (currentUserSeq !== userSeq) return;

      // Clean up generation belonging ONLY to the deleted conversation after deletion succeeds.
      const activeGen = activeGenerations.get(id);
      if (activeGen) {
        activeGen.abortController?.abort();
        activeGenerations.delete(id);
      }

      setState((prev) => {
        const nextBusyMap = { ...(prev.busyByConversation || {}) };
        delete nextBusyMap[id];

        const remaining = prev.conversations.filter((item) => item.id !== id);
        if (id === prev.activeId) {
          const existingEmptyDraft = remaining.find((item) => !isPersistableConversation(item));
          const replacement =
            existingEmptyDraft || { ...makeConversation(), persisted: false, messagesLoaded: true };
          const nextConversations = [
            replacement,
            ...remaining.filter((item) => item.id !== replacement.id && isPersistableConversation(item)),
          ];
          return {
            ...prev,
            conversations: nextConversations,
            activeId: replacement.id,
            busyByConversation: nextBusyMap,
            error: '',
            historyError: '',
          };
        }

        return {
          ...prev,
          conversations: remaining,
          busyByConversation: nextBusyMap,
        };
      });
    })();

    deletingConversations.set(id, deletePromise);
    try {
      await deletePromise;
    } finally {
      deletingConversations.delete(id);
    }
  }

  function updateMessageInConversation(conversationId, messageId, mutator) {
    updateConversation(conversationId, (item) => ({
      ...item,
      updatedAt: new Date().toISOString(),
      messages: item.messages.map((msg) => (msg.id === messageId ? mutator(msg) : msg)),
    }));
  }

  function stopStreaming(targetConvId = state.activeId) {
    const convId = targetConvId || state.activeId;
    const activeGen = convId ? activeGenerations.get(convId) : null;
    if (activeGen) {
      activeGen.abortController?.abort();
      if (activeGen.assistantMessageId) {
        updateMessageInConversation(convId, activeGen.assistantMessageId, (msg) => ({
          ...msg,
          status: 'aborted',
          isStreaming: false,
        }));
      }
      activeGenerations.delete(convId);
    }
    setConversationGenerationState(convId, null);
  }

  async function runStreamAttempt({
    targetConversationId,
    userMessageId,
    text,
    history,
    retryOfMessageId = null,
  }) {
    const reqSeq = ++nextReqSeq;
    const currentUserSeq = userSeq;
    const requestId = crypto.randomUUID();
    const initialAssistantId = crypto.randomUUID();
    let currentAssistantId = initialAssistantId;
    let streamFinalized = false;

    const abortController = new AbortController();
    activeGenerations.set(targetConversationId, {
      abortController,
      assistantMessageId: initialAssistantId,
      reqSeq,
    });

    const isStale = () =>
      currentUserSeq !== userSeq ||
      activeGenerations.get(targetConversationId)?.reqSeq !== reqSeq;

    updateConversation(targetConversationId, (item) => {
      const nextAssistantMessage = {
        id: initialAssistantId,
        role: 'assistant',
        text: '',
        status: 'streaming',
        isStreaming: true,
        streamed: true,
        replyTo: userMessageId,
        requestId,
      };
      const baseMessages = item.messages.filter((m) => m.id !== initialAssistantId);
      let nextMessages;
      if (retryOfMessageId) {
        const retryIndex = baseMessages.findIndex((m) => m.id === retryOfMessageId);
        if (retryIndex !== -1) {
          nextMessages = [
            ...baseMessages.slice(0, retryIndex),
            nextAssistantMessage,
            ...baseMessages.slice(retryIndex + 1),
          ];
        } else {
          nextMessages = [...baseMessages, nextAssistantMessage];
        }
      } else {
        nextMessages = [...baseMessages, nextAssistantMessage];
      }
      return {
        ...item,
        updatedAt: new Date().toISOString(),
        messages: nextMessages,
      };
    });

    setState((prev) => ({
      ...prev,
      error: '',
      busyByConversation: {
        ...(prev.busyByConversation || {}),
        [targetConversationId]: { busy: true, streaming: true },
      },
    }));

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
            updateConversation(targetConversationId, (item) => (item.persisted ? item : { ...item, persisted: true }));
            if (data?.assistantMessageId && data.assistantMessageId !== currentAssistantId) {
              const nextId = data.assistantMessageId;
              updateMessageInConversation(targetConversationId, currentAssistantId, (msg) => ({
                ...msg,
                id: nextId,
              }));
              currentAssistantId = nextId;
              const gen = activeGenerations.get(targetConversationId);
              if (gen && gen.reqSeq === reqSeq) {
                gen.assistantMessageId = nextId;
              }
            }
          } else if (eventType === 'delta') {
            if (streamFinalized) return;
            const chunkText = typeof data?.text === 'string' ? data.text : '';
            if (chunkText) {
              updateMessageInConversation(targetConversationId, currentAssistantId, (msg) => ({
                ...msg,
                text: `${msg.text || ''}${chunkText}`,
              }));
            }
          } else if (eventType === 'proposal') {
            if (streamFinalized) return;
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
            if (streamFinalized) return;
            const nextSources = Array.isArray(data?.sources) ? data.sources : [];
            updateMessageInConversation(targetConversationId, currentAssistantId, (msg) => ({
              ...msg,
              sources: nextSources,
            }));
          } else if (eventType === 'done') {
            if (streamFinalized) return;
            streamFinalized = true;
            updateConversation(targetConversationId, (item) => ({
              ...item,
              persisted: true,
              updatedAt: new Date().toISOString(),
              messages: item.messages.map((msg) =>
                msg.id === currentAssistantId
                  ? {
                      ...msg,
                      text: typeof data?.answer === 'string' && data.answer.length > 0 ? data.answer : (msg.text || 'Done.'),
                      status: 'completed',
                      isStreaming: false,
                      streamed: true,
                      ...(data?.toolName ? { toolName: data.toolName } : {}),
                      ...(data?.toolResult && !msg.result ? { result: data.toolResult } : {}),
                      ...(Array.isArray(data?.sources) ? { sources: data.sources } : {}),
                    }
                  : msg
              ),
            }));
          } else if (eventType === 'error') {
            if (streamFinalized) return;
            streamFinalized = true;
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
      if (err && typeof err === 'object') {
        err.messageAccepted = true;
      }
      throw err;
    } finally {
      if (activeGenerations.get(targetConversationId)?.reqSeq === reqSeq) {
        activeGenerations.delete(targetConversationId);
        setConversationGenerationState(targetConversationId, null);
      }
    }
  }

  async function sendMessage(text) {
    const active = getActive();
    const trimmed = (text || '').trim();
    if (!trimmed || !active || state.busyByConversation?.[active.id]?.busy) return;
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

    setState((prev) => ({
      ...prev,
      error: '',
      busyByConversation: {
        ...(prev.busyByConversation || {}),
        [targetConversationId]: { busy: true, streaming: false },
      },
    }));
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
      if (requestError && typeof requestError === 'object') {
        requestError.messageAccepted = true;
      }
      throw requestError;
    } finally {
      setConversationGenerationState(targetConversationId, null);
    }
  }

  async function retryMessage(assistantMessageId) {
    const active = getActive();
    if (!active || state.busyByConversation?.[active.id]?.busy || typeof onSendMessageStream !== 'function') return;

    const targetIndex = active.messages.findIndex((m) => m.id === assistantMessageId);
    if (targetIndex === -1) return;
    const failedMsg = active.messages[targetIndex];
    if (failedMsg.role !== 'assistant' || (failedMsg.status !== 'failed' && failedMsg.status !== 'aborted')) {
      return;
    }

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
    setBusy: (busy) => setConversationGenerationState(state.activeId, busy ? { busy: true, streaming: false } : null),
    setError: (error) => setState((prev) => ({ ...prev, error })),
    sendMessage,
    stopStreaming,
    retryMessage,
    appendMessage,
    handleRevealComplete,
    newConversation,
    renameConversation,
    removeConversation,
  };
}
