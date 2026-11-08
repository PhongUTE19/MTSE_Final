import React from 'react';
import Button from '../../primitives/buttons/Button.jsx';
import Inline from '../../primitives/layout/Inline.jsx';

const CHAT_HISTORY_ITEM_VARIANTS = {
  default: 'rounded-lg border border-transparent hover:border-border transition-colors text-content-primary',
  active: 'rounded-lg border border-border bg-surface-subtle font-medium text-content-primary',
};

/**
 * ChatHistoryItem component.
 * Represents an individual chat history entry with predefined 'default' and 'active' variants.
 * Internally owns item classes and button compositions.
 *
 * @param {object} props
 * @param {string} [props.title] - Conversation title
 * @param {'default'|'active'} [props.variant='default'] - Semantic state variant
 * @param {() => void} props.onSelect - Selection click handler
 * @param {() => void} props.onDelete - Deletion click handler
 * @param {string} [props.deleteTooltip='Delete conversation'] - Accessible tooltip for delete
 */
export default function ChatHistoryItem({
  title,
  variant = 'default',
  onSelect,
  onDelete,
  deleteTooltip = 'Delete conversation',
}) {
  const itemClass = CHAT_HISTORY_ITEM_VARIANTS[variant] || CHAT_HISTORY_ITEM_VARIANTS.default;
  const isSelected = variant === 'active';

  return (
    <div role="listitem" className={itemClass}>
      <Inline justify="between" align="center">
        <Button
          type="button"
          variant="ghost"
          onClick={onSelect}
          aria-current={isSelected ? 'true' : undefined}
        >
          {title || 'New conversation'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onDelete}
          aria-label={deleteTooltip}
          title={deleteTooltip}
        >
          x
        </Button>
      </Inline>
    </div>
  );
}
