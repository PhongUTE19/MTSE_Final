import React from 'react';

/**
 * Three-dot animated thinking indicator for Chat stream responses.
 * Encapsulates CSS pulse animations and accessible screen-reader announcement.
 *
 * @param {object} props
 * @param {string} [props.label='Thinking…'] - Accessible screen reader announcement
 */
export default function ThinkingIndicator({ label = 'Thinking…' }) {
  return (
    <div
      className="inline-flex items-center gap-1 py-0.5"
      aria-label={label}
      role="status"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-content-muted animate-pulse" />
      <span className="w-1.5 h-1.5 rounded-full bg-content-muted animate-pulse [animation-delay:150ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-content-muted animate-pulse [animation-delay:300ms]" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
