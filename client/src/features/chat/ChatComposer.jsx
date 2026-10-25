import React, { useState } from 'react';

/**
 * Generic message composer for the Chat interface.
 * Handles multiline expansion, Enter-to-send shortcut, and optional attachment actions.
 */
export default function ChatComposer({
  onSendMessage,
  busy = false,
  placeholder = 'Ask a question...',
  sendLabel = 'Send',
  renderAttachmentAction,
}) {
  const [message, setMessage] = useState('');

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || busy) return;
    onSendMessage(trimmed);
    setMessage('');
  }

  return (
    <form className="ai-chat-input" onSubmit={handleSubmit}>
      {renderAttachmentAction ? (
        <div className="ai-plus">
          {renderAttachmentAction({ busy })}
        </div>
      ) : null}

      <textarea
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={busy}
        rows={1}
        aria-label={placeholder}
      />

      <button
        className="primary-button"
        type="submit"
        disabled={busy || !message.trim()}
      >
        {sendLabel}
      </button>
    </form>
  );
}

export const AssistantComposer = ChatComposer;
