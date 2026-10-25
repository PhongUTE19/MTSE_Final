import { useState, useRef, useEffect, useCallback } from 'react';
import { STREAM_REVEAL_CONFIG } from '../../../shared/constants/index.js';
import { splitGraphemes } from '../../../shared/utils/formatters.js';


const FADE_DURATION_MS = 250;


/**
 * Checks if the user prefers reduced motion for accessibility.
 *
 * @returns {boolean}
 */
function checkPrefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Custom hook providing a progressive text-reveal queue (typewriter effect)
 * for incoming streamed responses.
 *
 * Buffers multi-token chunks and reveals text smoothly at a natural reading pace.
 * When the source stream finishes, it gracefully drains any remaining queued text
 * at the configured reveal speed rather than abruptly dumping it, ensuring short
 * responses also display a visible typewriter effect.
 *
 * Each newly revealed batch is tracked as an active streaming fragment so it can
 * render with a subtle opacity fade-in animation before consolidating into stable text.
 *
 * @param {string} targetText - Authoritative accumulated text for this message
 * @param {object} [options]
 * @param {boolean} [options.isStreaming=false] - Whether network source stream is active
 * @param {boolean} [options.isInterrupted=false] - Whether request was cancelled or aborted
 * @param {object} [options.config=STREAM_REVEAL_CONFIG] - Speed and threshold tuning constants
 * @returns {{
 *   displayedText: string,
 *   stableText: string,
 *   streamingFragments: Array<{ id: number, text: string }>,
 *   isRevealing: boolean,
 *   isComplete: boolean
 * }}
 */
export function useTextReveal(
  targetText = '',
  {
    isStreaming = false,
    isInterrupted = false,
    config = STREAM_REVEAL_CONFIG,
  } = {}
) {
  const [displayedText, setDisplayedText] = useState(() => {
    // If not actively streaming on initial render, display full text immediately
    return !isStreaming ? targetText : '';
  });
  const [stableText, setStableText] = useState(() => {
    return !isStreaming ? targetText : '';
  });
  const [streamingFragments, setStreamingFragments] = useState([]);
  const [isRevealing, setIsRevealing] = useState(() => isStreaming);
  const [isComplete, setIsComplete] = useState(() => !isStreaming && Boolean(targetText));

  const pendingQueueRef = useRef([]);
  const fragmentsRef = useRef([]);
  const fragmentIdRef = useRef(1);
  const processedLengthRef = useRef(0);
  const timerRef = useRef(null);
  const isMountedRef = useRef(true);
  const hasRevealedInitialRef = useRef(false);

  const targetTextRef = useRef(targetText);
  targetTextRef.current = targetText;

  const isStreamingRef = useRef(isStreaming);
  isStreamingRef.current = isStreaming;

  const isInterruptedRef = useRef(isInterrupted);
  isInterruptedRef.current = isInterrupted;

  // Track prefers-reduced-motion accessibility preference
  const [reducedMotion, setReducedMotion] = useState(checkPrefersReducedMotion);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e) => setReducedMotion(e.matches);

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    } else if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(handler);
      return () => mediaQuery.removeListener(handler);
    }
  }, []);

  const clearScheduledTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Track component mount status and ensure cleanup
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearScheduledTimer();
    };
  }, [clearScheduledTimer]);

  // Main reveal loop step
  const scheduleNextTick = useCallback(() => {
    if (timerRef.current || !isMountedRef.current) return;

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (!isMountedRef.current) return;

      const queue = pendingQueueRef.current;

      if (queue.length > 0) {
        // Determine reveal batch size based on backlog queue depth
        let batchSize = config.BASE_CHARS_PER_TICK;
        if (queue.length > config.CATCHUP_THRESHOLD) {
          const excess = queue.length - config.CATCHUP_THRESHOLD;
          batchSize += Math.min(
            config.CATCHUP_CHARS_PER_TICK,
            Math.ceil(excess / 8)
          );
        }
        if (config.MAX_BATCH_SIZE && batchSize > config.MAX_BATCH_SIZE) {
          batchSize = config.MAX_BATCH_SIZE;
        }

        const revealedGraphemes = queue.splice(0, batchSize).join('');
        const now = Date.now();
        const newFrag = { id: fragmentIdRef.current++, text: revealedGraphemes, time: now };

        // Consolidate fragments that have finished their fade-in
        const cutoff = now - FADE_DURATION_MS;
        const currentFragments = fragmentsRef.current;
        const matured = [];
        const active = [];

        for (const f of currentFragments) {
          if (f.time <= cutoff) {
            matured.push(f.text);
          } else {
            active.push(f);
          }
        }
        active.push(newFrag);
        fragmentsRef.current = active;

        if (matured.length > 0) {
          setStableText((prev) => prev + matured.join(''));
        }
        setStreamingFragments(active);
        setDisplayedText((prev) => prev + revealedGraphemes);
      }

      // Check remaining queue and stream state
      if (queue.length > 0) {
        scheduleNextTick();
      } else {
        // Queue is now empty
        if (!isStreamingRef.current) {
          // Source stream is done. Wait remaining fade duration for active fragments to reach 100% opacity
          const remainingTime = fragmentsRef.current.length > 0
            ? Math.max(0, FADE_DURATION_MS - (Date.now() - fragmentsRef.current[fragmentsRef.current.length - 1].time))
            : 0;

          if (remainingTime > 0) {
            timerRef.current = setTimeout(() => {
              timerRef.current = null;
              if (!isMountedRef.current) return;
              fragmentsRef.current = [];
              setStableText(targetTextRef.current);
              setStreamingFragments([]);
              setDisplayedText(targetTextRef.current);
              setIsRevealing(false);
              setIsComplete(true);
            }, remainingTime);
          } else {
            fragmentsRef.current = [];
            setStableText(targetTextRef.current);
            setStreamingFragments([]);
            setDisplayedText(targetTextRef.current);
            setIsRevealing(false);
            setIsComplete(true);
          }
        }
      }
    }, config.TICK_INTERVAL_MS);
  }, [config]);

  // Ingest incoming text chunks and manage queue lifecycle
  useEffect(() => {
    // Case 1: Interrupted (cancellation or error) -> halt typing and preserve received partial text
    if (isInterrupted) {
      clearScheduledTimer();
      pendingQueueRef.current = [];
      fragmentsRef.current = [];
      processedLengthRef.current = targetText.length;
      hasRevealedInitialRef.current = true;
      setDisplayedText(targetText);
      setStableText(targetText);
      setStreamingFragments([]);
      setIsRevealing(false);
      setIsComplete(true);
      return;
    }

    // Case 2: Reduced motion requested -> bypass typewriter animation
    if (reducedMotion) {
      clearScheduledTimer();
      pendingQueueRef.current = [];
      fragmentsRef.current = [];
      processedLengthRef.current = targetText.length;
      hasRevealedInitialRef.current = true;
      setDisplayedText(targetText);
      setStableText(targetText);
      setStreamingFragments([]);
      setIsRevealing(false);
      setIsComplete(true);
      return;
    }

    // Case 3: Detect if targetText was reset (e.g. conversation cleared or new message)
    const currentLen = targetText.length;
    const prevProcessed = processedLengthRef.current;

    if (currentLen < prevProcessed || !targetText.startsWith(targetText.slice(0, prevProcessed))) {
      clearScheduledTimer();
      pendingQueueRef.current = [];
      fragmentsRef.current = [];
      fragmentIdRef.current = 1;
      processedLengthRef.current = 0;
      hasRevealedInitialRef.current = false;
      setDisplayedText('');
      setStableText('');
      setStreamingFragments([]);
      setIsRevealing(isStreaming);
      setIsComplete(!isStreaming && currentLen === 0);
    }

    // Case 4: Process newly arrived fragments while streaming or receiving
    if (currentLen > processedLengthRef.current) {
      const newFragment = targetText.slice(processedLengthRef.current);
      processedLengthRef.current = currentLen;

      const newGraphemes = splitGraphemes(newFragment);

      // If nothing is displayed yet, reveal first batch immediately to avoid initial latency
      if (!hasRevealedInitialRef.current && newGraphemes.length > 0) {
        hasRevealedInitialRef.current = true;
        const initialBatch = newGraphemes.splice(0, config.BASE_CHARS_PER_TICK).join('');
        const initialFrag = { id: fragmentIdRef.current++, text: initialBatch, time: Date.now() };
        fragmentsRef.current = [initialFrag];
        setStableText('');
        setStreamingFragments([initialFrag]);
        setDisplayedText(initialBatch);
      }

      if (newGraphemes.length > 0) {
        pendingQueueRef.current.push(...newGraphemes);
        setIsRevealing(true);
        setIsComplete(false);
        scheduleNextTick();
      }
    }

    // Case 5: Source stream ended (isStreaming is false)
    if (!isStreaming) {
      if (pendingQueueRef.current.length === 0) {
        // Queue is already empty
        if (fragmentsRef.current.length === 0) {
          clearScheduledTimer();
          setStableText(targetText);
          setStreamingFragments([]);
          setDisplayedText(targetText);
          setIsRevealing(false);
          setIsComplete(true);
        } else {
          // Allow in-flight fragments to complete fade-in
          scheduleNextTick();
        }
      } else {
        // Queue still has pending text -> gracefully continue draining at reveal speed
        setIsRevealing(true);
        setIsComplete(false);
        scheduleNextTick();
      }
    }
  }, [targetText, isStreaming, isInterrupted, reducedMotion, config, clearScheduledTimer, scheduleNextTick]);

  return {
    displayedText,
    stableText,
    streamingFragments,
    isRevealing,
    isComplete,
    toString() {
      return displayedText;
    },
    [Symbol.toPrimitive]() {
      return displayedText;
    },
  };
}
