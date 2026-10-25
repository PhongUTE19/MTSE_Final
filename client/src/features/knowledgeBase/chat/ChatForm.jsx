import React, { useState } from 'react';
import { UI_LABELS } from '../../../shared/constants';
import { validateChatMessage } from '../../../shared/utils';

export default function ChatForm({ onSubmit, loading, onStop }) {
  const [inputMessage, setInputMessage] = useState('');
  const [error, setError] = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (loading) return;

    const validation = validateChatMessage(inputMessage);
    if (!validation.isValid) {
      setError(validation.error);
      return;
    }

    setError(null);
    onSubmit(validation.value);
    setInputMessage('');
  };

  const handleChange = (e) => {
    setInputMessage(e.target.value);
    if (error) {
      setError(null);
    }
  };

  return (
    <form className="chat-form" onSubmit={handleSubmit} noValidate>
      <div className="input-group">
        <input
          id="chat-query-input"
          type="text"
          className="form-input"
          placeholder={UI_LABELS.CHAT_FORM.INPUT_PLACEHOLDER}
          value={inputMessage}
          onChange={handleChange}
          disabled={loading}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'chat-input-error' : undefined}
        />
        {loading && onStop ? (
          <button
            type="button"
            className="btn btn-danger"
            onClick={onStop}
          >
            {UI_LABELS.CHAT_FORM.STOP_BUTTON}
          </button>
        ) : (
          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading || !inputMessage.trim()}
          >
            {UI_LABELS.CHAT_FORM.SEND_BUTTON}
          </button>
        )}
      </div>
      {error && (
        <div id="chat-input-error" className="form-error" role="alert">
          {error}
        </div>
      )}
    </form>
  );
}
