import { useState, useEffect } from 'react';
import {
  loadChatHistory,
  saveChatHistory,
  makeConversation,
} from './chatHistory.js';
import { sendChatMessage } from './chatApi.js';
import { useChatScroll } from '../../shared/hooks/useChatScroll.js';
import { useConfirm } from '../../shared/hooks/index.js';

/**
 * State and interaction hook for the Chat drawer / floating popup.
 * Coordinates conversation list, persistence, chat scroll, and API dispatch.
 */
export function useChat({
  userId,
  namespace = 'chat',
  onSendMessage = sendChatMessage,
  storage = typeof window !== 'undefined' ? window.localStorage : null,
  onOpenChange,
} = {}) {
  const { confirm } = useConfirm();
  const [open, setOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [tab, setTab] = useState('chat');
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const active = conversations.find((item) => item.id === activeId);

  // Initialize conversations from storage
  useEffect(() => {
    const saved = loadChatHistory(storage, userId, namespace);
    const first = saved[0] || makeConversation();
    setConversations(saved.length ? saved : [first]);
    setActiveId(first.id);
    setError('');
  }, [userId, namespace, storage]);

  // Persist conversations to storage
  useEffect(() => {
    if (userId && storage) {
      saveChatHistory(storage, userId, conversations, namespace);
    }
  }, [conversations, userId, namespace, storage]);

  // Follow chat auto-scroll and DOM reveal mutations
  const {
    conversationRef,
    handleScroll,
    scrollToBottom,
  } = useChatScroll([active?.messages, busy, open, tab, maximized]);

  function setChatOpen(next) {
    setOpen(next);
    onOpenChange?.(next);
  }

  function updateActive(mutator) {
    setConversations((items) =>
      items.map((item) => (item.id === activeId ? mutator(item) : item))
    );
  }

  function appendMessage(role, text, extra = {}) {
    updateActive((item) => ({
      ...item,
      title: item.messages.length === 0 && role === 'user' ? text.slice(0, 48) : item.title,
      updatedAt: new Date().toISOString(),
      messages: [
        ...item.messages,
        { id: crypto.randomUUID(), role, text, ...extra },
      ],
    }));
  }

  function handleRevealComplete(messageId) {
    updateActive((item) => ({
      ...item,
      messages: item.messages.map((msg) =>
        msg.id === messageId ? { ...msg, isNew: false } : msg
      ),
    }));
  }

  function newConversation() {
    // If the active conversation is already empty, focus on it without adding another empty conversation
    if (active && (!active.messages || active.messages.length === 0)) {
      setTab('chat');
      setError('');
      scrollToBottom(true);
      return active;
    }
    const next = makeConversation();
    setConversations((items) => [next, ...items].slice(0, 10));
    setActiveId(next.id);
    setTab('chat');
    setError('');
    scrollToBottom(true);
    return next;
  }

  async function removeConversation(id, confirmPrompt = 'Delete this conversation?') {
    const isConfirmed = await confirm({
      title: 'Delete Conversation',
      message: confirmPrompt,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger',
    });
    if (!isConfirmed) {
      return;
    }
    const remaining = conversations.filter((item) => item.id !== id);
    const next = remaining[0] || makeConversation();
    setConversations(remaining.length ? remaining : [next]);
    setActiveId(next.id);
    setTab('chat');
  }

  async function sendMessage(text) {
    if (!text || busy || !active) return;
    const history = active.messages
      .slice(-8)
      .map(({ role, text: previousText }) => ({ role, text: previousText }));

    setError('');
    setBusy(true);
    scrollToBottom(true);
    appendMessage('user', text);

    try {
      const response = await onSendMessage(text, history);
      appendMessage('assistant', response.answer || 'Done.', {
        toolName: response.toolName,
        result: response.toolResult,
        proposal: response.proposal,
        sources: response.sources,
        isNew: true,
      });
      return response;
    } catch (requestError) {
      setError(requestError.message);
      appendMessage('assistant', 'Sorry, I encountered an error processing your request.');
      throw requestError;
    } finally {
      setBusy(false);
    }
  }

  return {
    open,
    setOpen: setChatOpen,
    maximized,
    setMaximized,
    tab,
    setTab,
    conversations,
    setConversations,
    activeId,
    setActiveId,
    active,
    busy,
    setBusy,
    error,
    setError,
    conversationRef,
    handleScroll,
    scrollToBottom,
    sendMessage,
    appendMessage,
    handleRevealComplete,
    newConversation,
    removeConversation,
  };
}

export const useAssistant = useChat;
