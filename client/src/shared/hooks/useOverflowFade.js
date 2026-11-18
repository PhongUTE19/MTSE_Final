import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Detects horizontal text overflow on a single-line element so a right-edge
 * gradient fade mask is applied only when content actually overflows.
 *
 * @param {React.Ref<HTMLElement>} [externalRef]
 * @param {boolean} [enabled=true]
 * @param {unknown} [dependencyKey]
 * @returns {{ ref: (node: HTMLElement|null) => void, isOverflowing: boolean }}
 */
export function useOverflowFade(externalRef = null, enabled = true, dependencyKey = null) {
  const internalRef = useRef(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  const setRefs = useCallback(
    (node) => {
      internalRef.current = node;
      if (!externalRef) return;
      if (typeof externalRef === 'function') {
        externalRef(node);
      } else {
        externalRef.current = node;
      }
    },
    [externalRef]
  );

  useIsomorphicLayoutEffect(() => {
    if (!enabled) {
      setIsOverflowing(false);
      return undefined;
    }
    const el = internalRef.current;
    if (!el) return undefined;

    const measure = () => {
      const overflowing = el.scrollWidth > el.clientWidth + 1;
      setIsOverflowing((prev) => (prev === overflowing ? prev : overflowing));
    };

    measure();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure);
      observer.observe(el);
      return () => observer.disconnect();
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }

    return undefined;
  }, [enabled, dependencyKey]);

  return { ref: setRefs, isOverflowing };
}
