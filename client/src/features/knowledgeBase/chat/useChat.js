import { useState, useRef, useEffect, useCallback } from 'react';
import { useToast } from '../../../shared/contexts/ToastContext';
import { streamChatMessage } from './chatApi';
import { APP_MESSAGES, STATUS_KEYS } from '../../../shared/constants';

/**
 * Custom hook managing conversation message state, SSE request lifecycle,
 * streaming fragment updates, request cancellation, and error handling.
 *
 * @param {object} options
 * @param {object} [options.health] - Server health status
 * @param {() => void} [options.onRefreshHealth] - Health status refresh callback
 * @returns {object} Chat state and control functions
 */
export function useChat({ health, onRefreshHealth } = {}) {
  const { toast } = useToast();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const abortControllerRef = useRef(null);

  const isDisconnected = Boolean(
    health?.error || (health?.status && health.status === STATUS_KEYS.ERROR)
  );

  const conversationRef = useRef(null);
  const bottomRef = useRef(null);
  const userScrolledUpRef = useRef(false);

  // Monitor user scroll position: pause auto-scrolling if user manually scrolled up
  const handleScroll = useCallback(() => {
    const el = conversationRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    userScrolledUpRef.current = distanceFromBottom > 60;
  }, []);

  // Follow stream output smoothly if user has not scrolled up
  useEffect(() => {
    if (!userScrolledUpRef.current && conversationRef.current) {
      conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
    }
  }, [messages]);

  // Follow progressive text reveal updates without scroll jumping
  useEffect(() => {
    const el = conversationRef.current;
    if (!el || typeof MutationObserver === 'undefined') return;

    const observer = new MutationObserver(() => {
      if (!userScrolledUpRef.current && conversationRef.current) {
        conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
      }
    });

    observer.observe(el, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, []);

  // Clean up any ongoing request if component unmounts
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const sendMessage = useCallback(
    async (message) => {
      if (loading) return;

      const trimmed = typeof message === 'string' ? message.trim() : '';
      if (!trimmed) {
        toast.error(APP_MESSAGES.ERROR.MESSAGE_EMPTY);
        return;
      }

      // Pre-flight check: prevent loading indicator flicker when backend is offline
      if (isDisconnected) {
        toast.error(health?.error || APP_MESSAGES.ERROR.CHAT_COMMUNICATION_FAILED);
        return;
      }

      // Cancel any prior in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const userMsgId = `user-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const assistantMsgId = `assistant-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      const userMsg = {
        id: userMsgId,
        role: 'user',
        content: trimmed,
        timestamp: Date.now(),
      };

      const assistantMsg = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        sources: [],
        retrieval: null,
        isStreaming: true,
        isThinking: true,
        isInterrupted: false,
        timestamp: Date.now(),
      };

      // Add user prompt and empty assistant placeholder immediately
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setLoading(true);

      try {
        await streamChatMessage(
          trimmed,
          {
            onMetadata: (metadata) => {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMsgId
                    ? {
                      ...msg,
                      sources: metadata?.sources || [],
                      retrieval: metadata?.retrieval || null,
                    }
                    : msg
                )
              );
            },
            onDelta: (text) => {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMsgId
                    ? {
                      ...msg,
                      content: msg.content + text,
                      isThinking: false,
                    }
                    : msg
                )
              );
            },
            onDone: (doneData) => {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMsgId
                    ? {
                      ...msg,
                      sources: doneData?.sources || msg.sources,
                      retrieval: doneData?.retrieval || msg.retrieval,
                      isStreaming: false,
                      isThinking: false,
                      isInterrupted: false,
                    }
                    : msg
                )
              );
            },
            onError: () => {
              // Handled in catch block
            },
          },
          { signal: controller.signal }
        );
      } catch (err) {
        const isAborted = controller.signal.aborted || err.name === 'AbortError';

        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id !== assistantMsgId) return msg;
            return {
              ...msg,
              isStreaming: false,
              isThinking: false,
              isInterrupted: true,
              interruptedMessage: isAborted
                ? 'Generation stopped by user.'
                : err.message || APP_MESSAGES.ERROR.STREAM_INTERRUPTED,
            };
          })
        );

        if (!isAborted) {
          toast.error(err.message || APP_MESSAGES.ERROR.CHAT_COMMUNICATION_FAILED);
          if (onRefreshHealth) {
            onRefreshHealth();
          }
        }
      } finally {
        if (abortControllerRef.current === controller) {
          setLoading(false);
          abortControllerRef.current = null;
        }
      }
    },
    [loading, isDisconnected, health, onRefreshHealth, toast]
  );

  return {
    messages,
    loading,
    sendMessage,
    stopGeneration,
    conversationRef,
    bottomRef,
    handleScroll,
  };
}
