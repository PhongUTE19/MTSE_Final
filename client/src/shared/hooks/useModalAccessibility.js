import { useEffect, useRef } from 'react';
import {
  getFocusableElements,
  resolveInitialFocusTarget,
  resolveTabTarget,
  restoreFocus,
} from '../utils/drawerFocus.js';
import { pushOverlay, isTopmostOverlay } from '../utils/overlayStack.js';

/**
 * Shared modal dialog accessibility hook.
 * Coordinates overlayStack registration, initial focus, Escape-to-close (when topmost and dismissible),
 * Tab focus trapping, focus restoration, and backdrop click dismissal.
 */
export function useModalAccessibility({
  id,
  modalRef,
  onClose,
  enabled = true,
  dismissible = true,
  initialFocusSelector = 'button',
}) {
  const latest = useRef({ onClose, dismissible });
  latest.current = { onClose, dismissible };

  const overlayRef = useRef(null);
  if (!overlayRef.current) {
    overlayRef.current = { id, dismissible };
  }
  overlayRef.current.dismissible = dismissible;

  useEffect(() => {
    if (!enabled) return undefined;
    return pushOverlay(overlayRef.current);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;

    const previouslyFocused = document.activeElement;
    const modal = modalRef.current;
    resolveInitialFocusTarget({
      initialFocusElement: modal?.querySelector(initialFocusSelector),
      container: modal,
    })?.focus();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (!isTopmostOverlay(overlayRef.current)) return;
        event.stopPropagation();
        if (latest.current.dismissible && latest.current.onClose) {
          latest.current.onClose();
        }
        return;
      }
      if (event.key !== 'Tab' || !modal) return;
      const target = resolveTabTarget({
        focusable: getFocusableElements(modal),
        activeElement: document.activeElement,
        container: modal,
        shiftKey: event.shiftKey,
      });
      if (target) {
        event.preventDefault();
        target.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      restoreFocus(previouslyFocused);
    };
  }, [enabled, modalRef, initialFocusSelector]);

  const handleBackdropMouseDown = (event) => {
    if (event.target === event.currentTarget && dismissible && onClose) {
      onClose();
    }
  };

  return { handleBackdropMouseDown };
}
