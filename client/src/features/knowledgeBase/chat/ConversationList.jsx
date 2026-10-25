import React from 'react';
import UserMessage from './UserMessage';
import AssistantMessage from './AssistantMessage';
import { UI_LABELS, CHAT_CONFIG } from '../../../shared/constants';

/**
 * Pure presentational component that renders the ordered list of conversation messages.
 */
export default function ConversationList({
  messages = [],
  showDebug = CHAT_CONFIG.DEFAULT_SHOW_DEBUG,
  conversationRef,
  bottomRef,
  handleScroll,
}) {
  return (
    <div
      className="chat-conversation"
      ref={conversationRef}
      onScroll={handleScroll}
      role="log"
      aria-live="polite"
    >
      {messages.length === 0 ? (
        <div className="empty-state">
          {UI_LABELS.USER_CHAT.EMPTY_STATE}
        </div>
      ) : (
        messages.map((msg) =>
          msg.role === 'user' ? (
            <UserMessage key={msg.id} message={msg} />
          ) : (
            <AssistantMessage
              key={msg.id}
              message={msg}
              showDebug={showDebug}
            />
          )
        )
      )}
      <div ref={bottomRef} className="scroll-anchor" />
    </div>
  );
}
