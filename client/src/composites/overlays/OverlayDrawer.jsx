import React, { useEffect, useRef } from 'react';
import Backdrop from '../../primitives/Backdrop.jsx';
import Inline from '../../primitives/layout/Inline.jsx';
import IconButton from '../../primitives/buttons/IconButton.jsx';
import { CardTitle } from '../../primitives/cards/index.js';
import {
  INITIAL_FOCUS_DELAY_MS,
  getFocusableElements,
  lockBodyScroll,
  resolveInitialFocusTarget,
  resolveTabTarget,
  restoreFocus,
} from '../../shared/utils/drawerFocus.js';
import { pushOverlay, isTopmostOverlay } from '../../shared/utils/overlayStack.js';
import { omitProps } from '../../shared/utils/domProps.js';

/**
 * Reusable modal overlay drawer component.
 *
 * Appears above the current page content with a backdrop overlay, modal dialog semantics,
 * Tab/Shift+Tab focus trapping, body scroll locking, Escape-key dismissal, and backdrop-click dismissal.
 * It does not occupy layout space or push surrounding content.
 *
 * @param {object} props
 * @param {boolean} props.isOpen - Whether drawer is open
 * @param {() => void} props.onClose - Backdrop / close trigger handler
 * @param {string} [props.title] - Accessible drawer title
 * @param {React.RefObject} [props.drawerRef] - Ref passed to aside element (e.g. from useDrawer)
 * @param {React.RefObject} [props.triggerRef] - Ref to the element that triggered opening, for focus restoration
 * @param {React.RefObject} [props.initialFocusRef] - Element to focus on open; defaults to first focusable control, then aside
 * @param {boolean} [props.lockScroll=true] - Lock body scrolling while open
 * @param {string} [props.id='admin-drawer'] - DOM element ID for dialog and title
 * @param {React.ReactNode} [props.headerActions] - Optional buttons in header
 * @param {React.ReactNode} [props.header] - Optional custom header override
 * @param {React.ReactNode} [props.footer] - Optional drawer footer element
 * @param {string} [props.ariaLabel] - Explicit aria-label if title is omitted
 * @param {boolean} [props.dismissible=true] - Whether drawer can be dismissed via Escape or backdrop
 * @param {React.ReactNode} props.children - Drawer body contents
 */
export default function OverlayDrawer({
  isOpen,
  onClose,
  title,
  drawerRef,
  triggerRef,
  initialFocusRef,
  lockScroll = true,
  id = 'admin-drawer',
  headerActions,
  header,
  footer,
  ariaLabel,
  dismissible = true,
  children,
  ...rest
}) {
  const domProps = omitProps(rest);
  const stateClasses = isOpen ? 'translate-x-0 visible' : 'translate-x-full invisible';
  const drawerClasses = `fixed top-0 right-0 w-drawer max-w-full h-dvh bg-surface border-l border-border shadow-drawer z-drawer flex flex-col overflow-hidden focus:outline-none transition-[transform,visibility] duration-300 ease-out max-tablet:w-full ${stateClasses}`.trim();
  const bodyClasses = 'flex-1 overflow-y-auto p-4 flex flex-col gap-4';

  const internalRef = useRef(null);
  const asideRef = drawerRef || internalRef;

  // Latest onClose without re-registering the keydown listener on every render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const overlayRef = useRef(null);
  if (!overlayRef.current) {
    overlayRef.current = { id, dismissible };
  }
  overlayRef.current.dismissible = dismissible;

  // Track active layer on the shared LIFO overlay stack for coordinated Escape dismissal.
  useEffect(() => {
    if (!isOpen) return undefined;
    return pushOverlay(overlayRef.current);
  }, [isOpen]);

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

  // Escape closes if topmost; Tab is trapped inside the modal drawer.
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (!isTopmostOverlay(overlayRef.current)) return;
        event.stopPropagation();
        if (dismissible && onCloseRef.current) {
          onCloseRef.current();
        }
        return;
      }
      if (event.key !== 'Tab' || !asideRef.current) return;
      const target = resolveTabTarget({
        focusable: getFocusableElements(asideRef.current),
        activeElement: document.activeElement,
        container: asideRef.current,
        shiftKey: event.shiftKey,
      });
      if (target) {
        event.preventDefault();
        target.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, dismissible]);

  // Lock body scrolling while modal overlay is open.
  useEffect(() => {
    if (!isOpen || !lockScroll) return undefined;
    return lockBodyScroll(document.body);
  }, [isOpen, lockScroll]);

  return (
    <>
      {/* Modal Backdrop */}
      <Backdrop
        open={isOpen}
        onDismiss={onClose}
        dismissible={dismissible}
        variant="blur"
      />

      {/* Slide-out Overlay Drawer Panel */}
      <aside
        id={id}
        className={drawerClasses}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? `${id}-title` : undefined}
        aria-label={ariaLabel}
        aria-hidden={!isOpen}
        inert={!isOpen ? true : undefined}
        tabIndex={-1}
        ref={asideRef}
        onClick={(e) => e.stopPropagation()}
        {...domProps}
      >
        {header ? (
          header
        ) : (
          <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border bg-surface-subtle shrink-0">
            <Inline justify="between" align="center" fullWidth>
              <CardTitle as="h3" id={`${id}-title`}>
                {title}
              </CardTitle>
              <Inline gap="xs" align="center">
                {headerActions}
                <IconButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  aria-label="Close drawer"
                >
                  ✕
                </IconButton>
              </Inline>
            </Inline>
          </header>
        )}

        <div className={bodyClasses}>
          {children}
        </div>

        {footer && (
          <footer className="flex items-center justify-end gap-2.5 px-5 py-3.5 border-t border-border bg-surface-subtle shrink-0">
            {footer}
          </footer>
        )}
      </aside>
    </>
  );
}
