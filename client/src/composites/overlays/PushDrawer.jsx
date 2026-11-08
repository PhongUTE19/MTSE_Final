import React, { useEffect, useRef } from 'react';
import Inline from '../../primitives/layout/Inline.jsx';
import { CardTitle } from '../../primitives/cards/index.js';
import {
  INITIAL_FOCUS_DELAY_MS,
  resolveInitialFocusTarget,
  restoreFocus,
} from '../../shared/utils/drawerFocus.js';
import { pushOverlay, isTopmostOverlay } from '../../shared/utils/overlayStack.js';
import { omitProps } from '../../shared/utils/domProps.js';

/**
 * Reusable non-modal push drawer component.
 *
 * Designed for layout companion panels that occupy actual layout space or push surrounding content
 * (such as the Expense Chat Assistant). It does NOT render a modal backdrop, does NOT lock body
 * scrolling, does NOT trap keyboard focus away from the page, and does NOT apply aria-modal.
 *
 * @param {object} props
 * @param {boolean} props.isOpen - Whether drawer is open
 * @param {() => void} props.onClose - Close trigger handler
 * @param {string} [props.title] - Accessible drawer title
 * @param {React.RefObject} [props.drawerRef] - Ref passed to aside element
 * @param {React.RefObject} [props.triggerRef] - Ref to the element that triggered opening, for focus restoration
 * @param {React.RefObject} [props.initialFocusRef] - Element to focus on open; defaults to first focusable control, then aside
 * @param {string} [props.id='push-drawer'] - DOM element ID
 * @param {React.ReactNode} [props.headerActions] - Optional buttons in header
 * @param {React.ReactNode} [props.header] - Optional custom header override
 * @param {boolean} [props.maximized=false] - Whether drawer is maximized to full width
 * @param {string} [props.ariaLabel] - Explicit aria-label if title is omitted
 * @param {React.ReactNode} props.children - Drawer body contents
 */
export default function PushDrawer({
  isOpen,
  onClose,
  title,
  drawerRef,
  triggerRef,
  initialFocusRef,
  id = 'push-drawer',
  headerActions,
  header,
  maximized = false,
  ariaLabel,
  children,
  ...rest
}) {
  const domProps = omitProps(rest);
  const sizeClasses = maximized ? 'w-push-drawer-max max-w-push-drawer-max' : 'w-push-drawer max-w-full';
  const drawerClasses = `h-dvh max-h-full bg-surface border-l border-border shadow-push-drawer flex flex-col overflow-hidden pointer-events-auto transition-[width] duration-200 ease-out max-tablet:w-screen max-tablet:max-w-full ${sizeClasses}`.trim();
  const bodyClasses = 'flex flex-col flex-1 min-h-0 overflow-hidden';

  const internalRef = useRef(null);
  const asideRef = drawerRef || internalRef;

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Initial focus on open; restore focus to trigger or previously focused element on close/unmount.
  useEffect(() => {
    if (!isOpen) return undefined;
    const previouslyFocused = triggerRef?.current || document.activeElement;
    const timer = setTimeout(() => {
      resolveInitialFocusTarget({
        initialFocusElement: initialFocusRef?.current,
        container: asideRef.current,
      })?.focus();
    }, INITIAL_FOCUS_DELAY_MS);
    return () => {
      clearTimeout(timer);
      restoreFocus(previouslyFocused);
    };
  }, [isOpen]);

  const overlayRef = useRef(null);
  if (!overlayRef.current) {
    overlayRef.current = { id, dismissible: true };
  }

  // Track on the shared overlay stack so modal dialogs above this panel take precedence on Escape.
  useEffect(() => {
    if (!isOpen) return undefined;
    return pushOverlay(overlayRef.current);
  }, [isOpen]);

  // Escape key closes the push drawer without trapping Tab keys away from the main document.
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (!isTopmostOverlay(overlayRef.current)) return;
        if (onCloseRef.current) {
          event.stopPropagation();
          onCloseRef.current();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <aside
      id={id}
      className={drawerClasses}
      aria-labelledby={title ? `${id}-title` : undefined}
      aria-label={ariaLabel}
      aria-hidden={!isOpen}
      tabIndex={-1}
      ref={asideRef}
      {...domProps}
    >
      {header ? (
        header
      ) : (
        <header className="flex items-center justify-between gap-2 px-3.5 py-3 border-b border-border bg-gradient-to-b from-surface to-surface-subtle shrink-0">
          <Inline justify="between" align="center" fullWidth>
            <CardTitle as="h3" id={`${id}-title`}>
              {title}
            </CardTitle>
            {headerActions}
          </Inline>
        </header>
      )}

      <div className={bodyClasses}>
        {children}
      </div>
    </aside>
  );
}
