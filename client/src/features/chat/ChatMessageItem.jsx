import React from 'react';
import FormattedMessageText from './FormattedMessageText.jsx';
import ThinkingIndicator from '../../primitives/feedback/ThinkingIndicator.jsx';
import Avatar from '../../primitives/display/Avatar.jsx';
import Button from '../../primitives/buttons/Button.jsx';
import Text from '../../primitives/typography/Text.jsx';

/**
 * Generic message renderer for the Chat conversation stream.
 * Supports user bubbles, assistant bubbles with progressive text reveal,
 * markdown formatting, and an extensible tool result rendering slot.
 */
const CHAT_MESSAGE_VARIANTS = {
  user: 'flex flex-col gap-1.5 max-w-chat-bubble self-end items-end shrink-0',
  assistant: 'flex flex-col gap-1.5 max-w-chat-bubble self-start items-start shrink-0',
  'assistant-wide': 'flex flex-col gap-1.5 w-full max-w-full self-start items-start shrink-0',
};

const BUBBLE_BASE_CLASSES =
  'max-w-full p-3 px-3.5 rounded-lg text-sm leading-relaxed break-words';

/**
 * Generic message renderer for the Chat conversation stream.
 * Supports 'user' and 'assistant' variants with Tailwind utility styling.
 *
 * @param {object} props
 * @param {object} [props.item] - Message data object
 * @param {'user'|'assistant'} [props.variant] - Semantic message variant
 * @param {() => void} [props.onRevealComplete] - Callback on progressive text reveal complete
 * @param {(item: object) => React.ReactNode} [props.renderToolResult] - Custom tool result slot
 * @param {React.ReactNode} [props.avatarIcon] - Custom assistant avatar icon
 */
export default function ChatMessageItem({
  item,
  variant = item?.role === 'user' ? 'user' : 'assistant',
  onRevealComplete,
  onRetry,
  renderToolResult,
  avatarIcon,
}) {
  const isUser = variant === 'user';
  const isThinking = item?.id === 'thinking' || (item?.isStreaming && !item?.text);
  const hasWideToolContent = !isUser && Boolean(item?.toolName === 'propose_transaction' || item?.result?.draft);
  const messageClass = hasWideToolContent
    ? CHAT_MESSAGE_VARIANTS['assistant-wide']
    : CHAT_MESSAGE_VARIANTS[variant] || CHAT_MESSAGE_VARIANTS.assistant;
  const isAborted = item?.status === 'aborted';
  const isFailed = item?.status === 'failed';
  const receiptAttachment =
    item?.attachment?.type === 'receipt'
      ? item.attachment
      : item?.toolName === 'receipt_attachment' || item?.result?.attachmentType === 'receipt'
        ? {
            type: 'receipt',
            filename: item?.result?.filename || 'Receipt image',
            size: item?.result?.size ?? null,
            previewUrl: item?.attachment?.previewUrl || null,
          }
        : null;

  return (
    <article className={messageClass} key={item?.id}>
      {isUser ? (
        <div className={`${BUBBLE_BASE_CLASSES} border shadow-card flex flex-col gap-1.5 min-w-0 bg-brand border-brand text-content-inverse`}>
          {receiptAttachment && (
            <div className="flex flex-col gap-1.5">
              {receiptAttachment.previewUrl && (
                <img
                  src={receiptAttachment.previewUrl}
                  alt={receiptAttachment.filename || 'Uploaded receipt'}
                  className="max-h-48 w-auto max-w-full rounded-md object-contain bg-white/10"
                />
              )}
              <Text as="span" size="xs" color="inverse">
                📎 {receiptAttachment.filename || 'Receipt image'}
              </Text>
            </div>
          )}
          {item?.text && (
            <FormattedMessageText text={item.text} isStreaming={false} animate={false} inverse />
          )}
        </div>
      ) : (
        <div className="flex gap-2 items-start w-full justify-start">
          <Avatar size="md" variant="dark" decorative>
            {avatarIcon || '✨'}
          </Avatar>
          <div className={`${BUBBLE_BASE_CLASSES} border shadow-card flex flex-col gap-1.5 min-w-0 bg-surface border-border text-content-primary flex-1`}>
            {isThinking ? (
              <ThinkingIndicator />
            ) : (
              <>
                <FormattedMessageText
                  text={item?.text}
                  isStreaming={Boolean(item?.isStreaming)}
                  streamed={Boolean(item?.streamed)}
                  isInterrupted={isAborted || isFailed}
                  animate={Boolean(item?.isNew) && !item?.streamed && !item?.isStreaming}
                  onComplete={() => onRevealComplete?.(item?.id)}
                />
                {renderToolResult?.(item)}
                {(isAborted || isFailed) && (
                  <div className="flex items-center gap-2 pt-1 text-xs text-content-muted">
                    <span>
                      {isAborted ? 'Stopped (partial response)' : (item?.errorMessage || 'Failed to complete response')}
                    </span>
                    {onRetry && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onRetry(item?.id)}
                      >
                        Retry
                      </Button>
                    )}
                  </div>
                )}
              </>
            )}

            {item?.sources && item.sources.length > 0 && (
              <div className="w-full border border-border rounded-lg p-2 px-2.5 bg-surface-subtle flex flex-col gap-1.5 mt-1">
                <span className="text-2xs font-semibold text-content-muted uppercase tracking-wider">
                  Sources
                </span>
                {item.sources.map((src, idx) => (
                  <span key={idx} className="text-xs text-content-secondary">
                    {typeof src === 'string' ? src : src.title || src.name || src.uri}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
