import React from 'react';
import FormattedMessageText from '../../shared/components/FormattedMessageText';

/**
 * Generic message renderer for the Chat conversation stream.
 * Supports user bubbles, assistant bubbles with progressive text reveal,
 * markdown formatting, and an extensible tool result rendering slot.
 */
export default function ChatMessageItem({
  item,
  onRevealComplete,
  renderToolResult,
  avatarIcon,
  toolLabel = 'Function',
}) {
  const isUser = item.role === 'user';

  if (isUser) {
    return (
      <article className="ai-message ai-message--user" key={item.id}>
        <div>
          <p>{item.text}</p>
        </div>
      </article>
    );
  }

  return (
    <article className="ai-message ai-message--assistant" key={item.id}>
      <span className="ai-avatar">
        {avatarIcon || '✨'}
      </span>
      <div>
        <FormattedMessageText
          text={item.text}
          animate={Boolean(item.isNew)}
          onComplete={() => onRevealComplete?.(item.id)}
        />
        {item.toolName && <small className="ai-tool-name">{toolLabel}: {item.toolName}</small>}
        {renderToolResult?.(item)}
      </div>
    </article>
  );
}

export const AssistantMessageItem = ChatMessageItem;
