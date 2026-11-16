import React, { useRef, useState } from 'react';
import Button from '../../primitives/buttons/Button.jsx';
import TextArea from '../../primitives/inputs/TextArea.jsx';

/**
 * Composite message composer for the Chat interface.
 * Encapsulates message input state, multiline textarea expansion, Enter-to-send shortcut,
 * whitespace validation, async submission handling, and attachment slot integration.
 *
 * @param {object} props
 * @param {(text: string) => Promise<any>|void} props.onSendMessage - Callback invoked with trimmed message
 * @param {boolean} [props.busy=false] - Whether the assistant or composer is in a busy/loading state
 * @param {string} [props.placeholder='Ask a question...'] - Textarea placeholder and accessible name
 * @param {string} [props.sendLabel='Send'] - Label and tooltip for the submit button
 * @param {(context: { busy: boolean }) => React.ReactNode} [props.renderAttachmentAction] - Slot for attachment button
 */
export default function ChatComposer({
  onSendMessage,
  onStop,
  busy = false,
  isStreaming = false,
  placeholder = 'Ask a question...',
  sendLabel = 'Send',
  renderAttachmentAction,
}) {
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef(null);

  const isMessageValid = Boolean(message.trim());
  const isDisabled = busy || isSubmitting;

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit(event);
    }
  }

  async function handleSubmit(event) {
    event?.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || isDisabled) return;

    try {
      setIsSubmitting(true);
      const result = onSendMessage?.(trimmed);
      if (result && typeof result.then === 'function') {
        await result;
      }
      setMessage('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } catch {
      // Keep message draft intact on failure so user does not lose input
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleChange(event) {
    setMessage(event.target.value);
  }

  return (
    <form
      className="border-t border-border p-2.5 px-3 flex flex-col gap-2 bg-surface shrink-0 max-tablet:p-2 max-tablet:px-2.5"
      onSubmit={handleSubmit}
      aria-label="Message composer"
    >
      <div className="w-full">
        <TextArea
          ref={textareaRef}
          value={message}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isDisabled}
          rows={1}
          size="sm"
          resize="none"
          maxHeight="composer"
          maxLength={1000}
          aria-label={placeholder}
          aria-disabled={isDisabled}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <div>
          {renderAttachmentAction ? renderAttachmentAction({ busy: isDisabled }) : null}
        </div>

        {isStreaming && onStop ? (
          <Button
            variant="danger"
            type="button"
            onClick={onStop}
            aria-label="Stop generating"
            title="Stop generating"
          >
            Stop
          </Button>
        ) : (
          <Button
            variant="primary"
            type="submit"
            disabled={isDisabled || !isMessageValid}
            loading={isSubmitting}
            aria-label={sendLabel}
            title={sendLabel}
          >
            {sendLabel}
          </Button>
        )}
      </div>
    </form>
  );
}
