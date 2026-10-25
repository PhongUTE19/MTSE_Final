/**
 * Normalizes options for application confirmation popups.
 * Supports string shorthand or structured options object.
 *
 * @param {string|object} options
 * @returns {{
 *   title: string,
 *   message: string,
 *   confirmText: string,
 *   cancelText: string,
 *   variant: 'primary'|'danger',
 *   isLoading: boolean
 * }}
 */
export function normalizeConfirmOptions(options = {}) {
  if (typeof options === 'string') {
    return {
      title: 'Confirmation',
      message: options,
      confirmText: 'Confirm',
      cancelText: 'Cancel',
      variant: 'primary',
      isLoading: false,
    };
  }

  const {
    title = 'Confirmation',
    message = '',
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    variant = 'primary',
    isDestructive = false,
    isLoading = false,
  } = options || {};

  return {
    title,
    message,
    confirmText,
    cancelText,
    variant: isDestructive ? 'danger' : variant,
    isLoading: Boolean(isLoading),
  };
}

/**
 * Fallback confirmation handler when outside React DOM tree or in tests.
 * @param {string|object} options
 * @returns {Promise<boolean>}
 */
export async function fallbackConfirm(options) {
  const normalized = normalizeConfirmOptions(options);
  if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
    return window.confirm(normalized.message || normalized.title);
  }
  return false;
}
