import React, { useEffect, useRef, useState } from 'react';
import Button from '../../primitives/buttons/Button.jsx';
import TextInput from '../../primitives/inputs/TextInput.jsx';
import Inline from '../../primitives/layout/Inline.jsx';
import OverflowText from '../../primitives/typography/OverflowText.jsx';

const CHAT_HISTORY_ITEM_VARIANTS = {
  default: 'rounded-lg border border-transparent hover:border-border transition-colors text-content-primary',
  active: 'rounded-lg border border-border bg-surface-subtle font-medium text-content-primary',
};

/**
 * ChatHistoryItem component.
 * Displays a conversation item with right-click context menu trigger and inline rename support.
 * Does not render an inline delete 'X' button.
 */
export default function ChatHistoryItem({
  title,
  variant = 'default',
  isRenaming = false,
  onSelect,
  onContextMenu,
  onCommitRename,
  onCancelRename,
}) {
  const itemClass = CHAT_HISTORY_ITEM_VARIANTS[variant] || CHAT_HISTORY_ITEM_VARIANTS.default;
  const isSelected = variant === 'active';
  const [draftTitle, setDraftTitle] = useState(title || 'New conversation');
  const inputRef = useRef(null);

  useEffect(() => {
    if (isRenaming) {
      setDraftTitle(title || 'New conversation');
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select?.();
      }, 0);
    }
  }, [isRenaming, title]);

  function handleRenameSubmit(event) {
    event?.preventDefault();
    const trimmed = draftTitle.trim();
    if (!trimmed) {
      onCancelRename?.();
      return;
    }
    onCommitRename?.(trimmed);
  }

  function handleRenameKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onCancelRename?.();
    }
  }

  return (
    <div
      role="listitem"
      className={itemClass}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onContextMenu?.({ x: event.clientX, y: event.clientY });
      }}
    >
      {isRenaming ? (
        <form onSubmit={handleRenameSubmit} className="p-1.5">
          <Inline gap="xs" align="center" fullWidth>
            <TextInput
              ref={inputRef}
              size="sm"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onKeyDown={handleRenameKeyDown}
              aria-label="Conversation title"
              maxLength={120}
            />
            <Button type="submit" variant="primary" size="sm">
              Save
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onCancelRename}>
              Cancel
            </Button>
          </Inline>
        </form>
      ) : (
        <Inline justify="between" align="center">
          <Button
            type="button"
            variant="ghost"
            fullWidth
            onClick={onSelect}
            aria-current={isSelected ? 'true' : undefined}
          >
            <OverflowText as="span" align="left" fullWidth title={title || 'New conversation'}>
              {title || 'New conversation'}
            </OverflowText>
          </Button>
        </Inline>
      )}
    </div>
  );
}
