/**
 * Lightweight LIFO stack tracking active overlay layers (OverlayDrawer, ConfirmDialog, Modal, etc.)
 * to ensure that keyboard interactions like Escape only dismiss the topmost active overlay.
 */
const overlayStack = [];

/**
 * Registers an active overlay layer on top of the stack.
 *
 * @param {object} overlay
 * @param {string} [overlay.id] - Identifiable layer name
 * @param {boolean} [overlay.dismissible=true] - Whether this layer can be dismissed via Escape
 * @returns {() => void} Cleanup function to unregister the overlay on close/unmount
 */
export function pushOverlay(overlay) {
  overlayStack.push(overlay);
  return () => {
    const index = overlayStack.indexOf(overlay);
    if (index !== -1) {
      overlayStack.splice(index, 1);
    }
  };
}

/**
 * Determines whether the given overlay is currently the topmost active layer.
 *
 * @param {object} overlay
 * @returns {boolean}
 */
export function isTopmostOverlay(overlay) {
  if (overlayStack.length === 0) return true;
  return overlayStack[overlayStack.length - 1] === overlay;
}

/**
 * Returns the currently topmost overlay layer.
 *
 * @returns {object|null}
 */
export function getTopmostOverlay() {
  return overlayStack.length > 0 ? overlayStack[overlayStack.length - 1] : null;
}

/**
 * Clears the overlay stack (primarily for test resets).
 */
export function clearOverlayStack() {
  overlayStack.length = 0;
}
