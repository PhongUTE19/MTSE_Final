import React from 'react';
import EmptyState from '../../composites/dataDisplay/EmptyState.jsx';
import { Stack } from '../../primitives/layout/index.js';
import ChatHistoryItem from './ChatHistoryItem.jsx';

/**
 * Generic history list tab for Chat conversations.
 * Uses Base Button components for all interactions (new conversation, selection, deletion).
 */
export default function ChatHistoryTab({
  conversations = [],
  activeId,
  onSelectConversation,
  onRemoveConversation,
  emptyLabel = 'No saved conversations.',
  deleteTooltip = 'Delete conversation',
}) {
  return (
    <Stack as="div" role="list" gap="xs">
      {conversations.length === 0 ? (
        <EmptyState message={emptyLabel} />
      ) : (
        conversations.map((item) => (
          <ChatHistoryItem
            key={item.id}
            title={item.title}
            variant={item.id === activeId ? 'active' : 'default'}
            onSelect={() => onSelectConversation(item.id)}
            onDelete={() => onRemoveConversation(item.id)}
            deleteTooltip={deleteTooltip}
          />
        ))
      )}
    </Stack>
  );
}
