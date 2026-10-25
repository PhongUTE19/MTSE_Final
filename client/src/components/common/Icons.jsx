import React from 'react';

/**
 * Edit action icon (pencil).
 */
export function EditIcon({ className = '', ...props }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} {...props}>
      <path
        d="M13.8 5.2 18.8 10.2M4 20l4.1-.9L19.5 7.7a2.1 2.1 0 0 0-3-3L5.1 16.1 4 20Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Delete action icon (trash bin).
 */
export function DeleteIcon({ className = '', ...props }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} {...props}>
      <path
        d="M4 7h16M9 7V4h6v3m-8 0 .8 13h8.4L17 7M10 11v5m4-5v5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Wallet with sparkles assistant icon.
 */
export function WalletSparklesIcon({ className = '', ...props }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} {...props}>
      <path
        className="assistant-icon__wallet"
        d="M4 7.5A2.5 2.5 0 0 1 6.5 5H17a2 2 0 0 1 2 2v1H6.5a2.5 2.5 0 0 0 0 5H20v3.5a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-9ZM20 9v4h-2.5a2 2 0 1 1 0-4H20Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        className="assistant-icon__sparkle"
        d="m18.5 2 .45 1.05L20 3.5l-1.05.45L18.5 5l-.45-1.05L17 3.5l1.05-.45L18.5 2Zm3 3 .32.68L22.5 6l-.68.32L21.5 7l-.32-.68L20.5 6l.68-.32L21.5 5Z"
        fill="currentColor"
      />
    </svg>
  );
}

/**
 * Multi-color Google brand mark for OAuth buttons.
 */
export function GoogleMark({ className = 'auth-google-mark', ...props }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path fill="#4285f4" d="M21.35 12.23c0-.71-.06-1.4-.19-2.05H12v3.88h5.24a4.48 4.48 0 0 1-1.94 2.94v2.52h3.15c1.84-1.69 2.9-4.18 2.9-7.29Z" />
      <path fill="#34a853" d="M12 21.75c2.62 0 4.83-.87 6.45-2.36L15.3 16.9c-.9.6-2.05.96-3.3.96-2.53 0-4.67-1.7-5.44-4H3.3v2.6A9.75 9.75 0 0 0 12 21.75Z" />
      <path fill="#fbbc05" d="M6.56 13.86a5.87 5.87 0 0 1 0-3.72V7.55H3.3a9.75 9.75 0 0 0 0 8.9l3.26-2.59Z" />
      <path fill="#ea4335" d="M12 6.14c1.43 0 2.71.49 3.72 1.46l2.79-2.79C16.82 3.22 14.62 2.25 12 2.25a9.75 9.75 0 0 0-8.7 5.3l3.26 2.59c.77-2.3 2.91-4 5.44-4Z" />
    </svg>
  );
}
