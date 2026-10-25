import { useRef, useEffect, useCallback } from 'react';

/**
 * Calculates whether a scroll container is scrolled away from its bottom.
 *
 * @param {HTMLElement|{scrollHeight: number, scrollTop: number, clientHeight: number}|null|undefined} el
 * @param {number} [threshold=60] - Tolerance threshold in pixels
 * @returns {boolean} True if scrolled up beyond threshold, false otherwise
 */
export function isUserScrolledUp(el, threshold = 60) {
  if (!el) return false;
  const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
  return distanceFromBottom > threshold;
}

/**
 * Hook to manage chat container auto-scrolling and user scroll awareness.
 *
 * Keeps the scroll at the bottom during message streaming and progressive text reveal,
 * while respecting when the user scrolls up to inspect previous conversation history.
 *
 * @param {Array<any>} [dependencies=[]] - Reactive dependencies that should trigger auto-scroll check
 * @param {object} [options]
 * @param {number} [options.threshold=60] - Pixels from bottom beyond which auto-scroll pauses
 * @returns {{
 *   conversationRef: React.RefObject<HTMLElement>,
 *   bottomRef: React.RefObject<HTMLElement>,
 *   handleScroll: () => void,
 *   scrollToBottom: (force?: boolean) => void,
 *   userScrolledUpRef: React.MutableRefObject<boolean>
 * }}
 */
export function useChatScroll(dependencies = [], { threshold = 60 } = {}) {
  const conversationRef = useRef(null);
  const bottomRef = useRef(null);
  const userScrolledUpRef = useRef(false);
  const observedElementRef = useRef(null);
  const observerRef = useRef(null);

  const scrollToBottom = useCallback((force = false) => {
    const el = conversationRef.current;
    if (!el) return;
    if (force) {
      userScrolledUpRef.current = false;
      el.scrollTop = el.scrollHeight;
    } else if (!userScrolledUpRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  const handleScroll = useCallback(() => {
    userScrolledUpRef.current = isUserScrolledUp(conversationRef.current, threshold);
  }, [threshold]);

  // Follow reactive dependencies (new messages, streaming chunks, proposals, etc.)
  useEffect(() => {
    scrollToBottom();
  }, dependencies); // eslint-disable-line react-hooks/exhaustive-deps

  // Follow progressive text reveal (DOM characterData/child mutations) without jumping.
  // Dynamic element tracking connects the observer whenever the container is mounted or re-rendered.
  useEffect(() => {
    const el = conversationRef.current;
    if (typeof MutationObserver === 'undefined') return;

    if (el !== observedElementRef.current) {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      observedElementRef.current = el;

      if (el) {
        const observer = new MutationObserver(() => {
          scrollToBottom();
        });
        observer.observe(el, {
          childList: true,
          subtree: true,
          characterData: true,
        });
        observerRef.current = observer;
      }
    }
  });

  // Ensure observer cleanup on unmount
  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, []);

  return {
    conversationRef,
    bottomRef,
    handleScroll,
    scrollToBottom,
    userScrolledUpRef,
  };
}
