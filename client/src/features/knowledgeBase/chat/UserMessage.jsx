import React from 'react';
import { UI_LABELS } from '../../../shared/constants';

/**
 * Renders an individual user prompt message bubble.
 */
export default function UserMessage({ message }) {
  const { content, timestamp } = message || {};

  const timeFormatted = timestamp
    ? new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })
    : '';

  return (
    <div className="chat-message chat-message--user">
      <div className="card chat-bubble--user">
        {timeFormatted && <span className="message-time">{timeFormatted}</span>}
        <div className="card-body">
          <p className="message-text">{content}</p>
        </div>
      </div>
    </div>
  );
}
