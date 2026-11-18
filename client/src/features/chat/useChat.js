import { useState, useEffect, useRef, useCallback } from 'react';
import { sendChatMessage } from './chatApi.js';
import { createChatController } from './chatController.js';
import { useChatScroll } from '../../shared/hooks/useChatScroll.js';
import { useConfirm } from '../../app/providers/index.js';

/**
 * State and interaction hook for the Chat drawer / floating popup.
 * Uses database-backed Chat History via `createChatController` with a lightweight
 * local cache for initial render resilience.
 */
export function useChat({
  userId,
  namespace = 'chat',
  onSendMessage = sendChatMessage,
  onSendMessageStream = null,
  onProposal = null,
  storage = typeof window !== 'undefined' ? window.localStorage : null,
  onOpenChange,
} = {}) {
  const { confirm } = useConfirm();
  const [open, setOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [tab, setTab] = useState('chat');

  const [state, setState] = useState({
    conversations: [],
    activeId: '',
    busy: false,
    streaming: false,
    error: '',
    historyLoading: false,
    historyError: '',
  });

  const onSendMessageRef = useRef(onSendMessage);
  onSendMessageRef.current = onSendMessage;
  const onSendMessageStreamRef = useRef(onSendMessageStream);
  onSendMessageStreamRef.current = onSendMessageStream;
  const onProposalRef = useRef(onProposal);
  onProposalRef.current = onProposal;

  const controllerRef = useRef(null);
  if (!controllerRef.current) {
    controllerRef.current = createChatController({
      namespace,
      storage,
      onSendMessage: (...args) => onSendMessageRef.current(...args),
      onSendMessageStream: onSendMessageStream
        ? (...args) => onSendMessageStreamRef.current(...args)
        : null,
      onProposal: onProposal
        ? (...args) => onProposalRef.current(...args)
        : null,
      onStateChange: setState,
    });
  }

  const active = state.conversations.find((item) => item.id === state.activeId);

  useEffect(() => {
    controllerRef.current.loadUserConversations(userId);
  }, [userId]);

  const {
    conversationRef,
    handleScroll,
    scrollToBottom,
  } = useChatScroll([active?.messages, state.busy, open, tab, maximized]);

  function setChatOpen(next) {
    setOpen(next);
    onOpenChange?.(next);
  }

  const setActiveId = useCallback((id) => {
    controllerRef.current.selectConversation(id);
  }, []);

  const setConversations = useCallback((updater) => {
    controllerRef.current.setConversations(updater);
  }, []);

  const setBusy = useCallback((busy) => {
    controllerRef.current.setBusy(busy);
  }, []);

  const setError = useCallback((error) => {
    controllerRef.current.setError(error);
  }, []);

  const appendMessage = useCallback((role, text, extra = {}) => {
    return controllerRef.current.appendMessage(role, text, extra);
  }, []);

  const handleRevealComplete = useCallback((messageId) => {
    controllerRef.current.handleRevealComplete(messageId);
  }, []);

  const newConversation = useCallback(() => {
    const next = controllerRef.current.newConversation();
    setTab('chat');
    scrollToBottom(true);
    return next;
  }, [scrollToBottom]);

  const renameConversation = useCallback(async (id, title) => {
    return controllerRef.current.renameConversation(id, title);
  }, []);

  const removeConversation = useCallback(
    async (id, confirmPrompt = 'Delete this conversation?') => {
      const isConfirmed = await confirm({
        title: 'Delete Conversation',
        message: confirmPrompt,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        variant: 'danger',
      });
      if (!isConfirmed) return;
      try {
        await controllerRef.current.removeConversation(id);
        if (id === state.activeId) {
          setTab('chat');
        }
      } catch (err) {
        controllerRef.current.setError(err?.message || 'Failed to delete conversation.');
      }
    },
    [confirm, state.activeId]
  );

  const sendMessage = useCallback(
    async (text) => {
      scrollToBottom(true);
      return controllerRef.current.sendMessage(text);
    },
    [scrollToBottom]
  );

  const stopStreaming = useCallback(() => {
    controllerRef.current.stopStreaming();
  }, []);

  const retryMessage = useCallback(
    (assistantMessageId) => {
      scrollToBottom(true);
      return controllerRef.current.retryMessage(assistantMessageId);
    },
    [scrollToBottom]
  );

  const retryLoadHistory = useCallback(() => {
    return controllerRef.current.loadUserConversations(userId);
  }, [userId]);

  return {
    open,
    setOpen: setChatOpen,
    maximized,
    setMaximized,
    tab,
    setTab,
    conversations: state.conversations,
    setConversations,
    activeId: state.activeId,
    setActiveId,
    active,
    busy: state.busy,
    isStreaming: Boolean(state.streaming),
    setBusy,
    error: state.error,
    setError,
    historyLoading: state.historyLoading,
    historyError: state.historyError,
    retryLoadHistory,
    conversationRef,
    handleScroll,
    scrollToBottom,
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
