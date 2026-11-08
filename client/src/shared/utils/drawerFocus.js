/**
 * Pure DOM helpers for the Drawer dialog lifecycle (focus trap, initial focus,
 * focus restoration, scroll lock). Kept free of React so they can be unit tested
 * with plain objects; Drawer.jsx is their only consumer.
 */

export const INITIAL_FOCUS_DELAY_MS = 50;

export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Lists the visible, tabbable descendants of a container in DOM order.
 *
 * @param {HTMLElement|null} container
 * @returns {HTMLElement[]}
 */
export function getFocusableElements(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true'
  );
}

/**
 * Chooses where focus should land when a drawer opens: an explicit element,
 * else the first focusable control, else the (tabIndex=-1) container itself.
 *
 * @param {{ initialFocusElement?: HTMLElement|null, container: HTMLElement|null }} params
 * @returns {HTMLElement|null}
 */
export function resolveInitialFocusTarget({ initialFocusElement, container }) {
  return initialFocusElement || getFocusableElements(container)[0] || container || null;
}

/**
 * Computes the element that must receive focus to keep Tab / Shift+Tab inside
 * the container, or null when the browser's default movement stays inside it.
 *
 * @param {{
 *   focusable: HTMLElement[],
 *   activeElement: Element|null,
 *   container: HTMLElement,
 *   shiftKey: boolean,
 * }} params
 * @returns {HTMLElement|null}
 */
export function resolveTabTarget({ focusable, activeElement, container, shiftKey }) {
  if (focusable.length === 0) return container;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const isOutside = !container.contains(activeElement);

  if (shiftKey) {
    return isOutside || activeElement === first || activeElement === container ? last : null;
  }
  return isOutside || activeElement === last ? first : null;
}

/**
 * Restores focus to the element that was focused before the drawer opened,
 * but only if it is still in the document and can take focus.
 *
 * @param {HTMLElement|null} element
 * @param {HTMLElement} [body=document.body]
 * @returns {boolean} Whether focus was moved
 */
export function restoreFocus(element, body = typeof document !== 'undefined' ? document.body : null) {
  if (!element || element === body || !element.isConnected || typeof element.focus !== 'function') {
    return false;
  }
  element.focus();
  return true;
}

/**
 * Locks page scrolling and returns a function that restores the previous value.
 *
 * @param {HTMLElement} body
 * @returns {() => void} Restore function
 */
export function lockBodyScroll(body) {
  const originalOverflow = body.style.overflow;
  body.style.overflow = 'hidden';
  return () => {
    body.style.overflow = originalOverflow;
  };
}
