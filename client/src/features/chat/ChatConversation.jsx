import React from 'react';
import Button from '../../primitives/buttons/Button.jsx';
import ErrorText from '../../primitives/labels/ErrorText.jsx';
import { Inline } from '../../primitives/layout/index.js';
import EmptyState from '../../composites/dataDisplay/EmptyState.jsx';
import ChatComposer from './ChatComposer';
import ChatMessageItem from './ChatMessageItem';

/**
 * Message stream plus composer for the active conversation.
 */
export default function ChatConversation({
  assistant,
  avatarIcon,
  welcomeQuestion,
  quickActions,
  toolLabel,
  renderToolResult,
  renderBeforeComposer,
  renderAttachmentAction,
  composerPlaceholder,
  sendLabel,
}) {
  const {
    active,
    busy,
    isStreaming,
    error,
    conversationRef,
    handleScroll,
    sendMessage,
    stopStreaming,
    retryMessage,
    handleRevealComplete,
  } = assistant;

  return (
    <>
      <div
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 flex flex-col gap-2.5 bg-gradient-to-b from-surface-subtle to-surface max-tablet:p-2.5"
        ref={conversationRef}
        onScroll={handleScroll}
        role="log"
        aria-live="polite"
      >
        {!active?.messages.length && (
          <div className="mt-auto shrink-0">
            <EmptyState
              as="section"
              compact
              message={welcomeQuestion}
              actions={
                quickActions.length > 0 && (
                  <Inline gap="xs" wrap justify="center">
                    {quickActions.map(([icon, label, prompt]) => (
                      <Button
                        type="button"
                        variant="secondary"
                        key={label}
                        onClick={() => sendMessage(prompt)}
                        disabled={busy}
                      >
                        <span>{icon}</span>
                        {label}
                      </Button>
                    ))}
                  </Inline>
                )
              }
            />
          </div>
        )}

        {active?.messages.map((item) => (
          <ChatMessageItem
            key={item.id}
            item={item}
            variant={item.role === 'user' ? 'user' : 'assistant'}
            onRevealComplete={handleRevealComplete}
            onRetry={retryMessage}
            renderToolResult={renderToolResult}
            avatarIcon={avatarIcon}
            toolLabel={toolLabel}
          />
        ))}

        {busy && !isStreaming && (
          <ChatMessageItem
            variant="assistant"
            item={{ id: 'thinking', role: 'assistant', text: 'Thinking…' }}
            avatarIcon={avatarIcon}
          />
        )}

        {error && <ErrorText as="p">{error}</ErrorText>}

        {renderBeforeComposer?.()}
      </div>

      <ChatComposer
        onSendMessage={sendMessage}
        onStop={stopStreaming}
        busy={busy}
        isStreaming={isStreaming}
        placeholder={composerPlaceholder}
        sendLabel={sendLabel}
        renderAttachmentAction={renderAttachmentAction}
      />
    </>
  );
}
