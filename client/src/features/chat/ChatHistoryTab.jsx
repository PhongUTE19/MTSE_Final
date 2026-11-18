import React, { useState } from 'react';
import EmptyState from '../../composites/dataDisplay/EmptyState.jsx';
import ContextMenu from '../../composites/overlays/ContextMenu.jsx';
import { Stack } from '../../primitives/layout/index.js';
import ChatHistoryItem from './ChatHistoryItem.jsx';

/**
 * Generic history list tab for Chat conversations.
 * Uses a shared right-click ContextMenu for Rename and Delete actions.
 */
export default function ChatHistoryTab({
  conversations = [],
  activeId,
  onSelectConversation,
  onRenameConversation,
  onRemoveConversation,
  emptyLabel = 'No saved conversations.',
}) {
  const [menuState, setMenuState] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const visibleConversations = conversations.filter(
    (item) => item?.persisted !== false || (Array.isArray(item?.messages) && item.messages.length > 0)
  );

  const menuItems = menuState
    ? [
        {
          id: 'rename',
          label: 'Rename',
          onSelect: () => {
            setRenamingId(menuState.conversationId);
          },
        },
        {
          id: 'delete',
          label: 'Delete',
          variant: 'danger',
          onSelect: () => {
            onRemoveConversation?.(menuState.conversationId);
          },
        },
      ]
    : [];

  return (
    <>
      <Stack as="div" role="list" gap="xs">
        {visibleConversations.length === 0 ? (
          <EmptyState message={emptyLabel} />
        ) : (
          visibleConversations.map((item) => (
            <ChatHistoryItem
              key={item.id}
              title={item.title}
              variant={item.id === activeId ? 'active' : 'default'}
              isRenaming={renamingId === item.id}
              onSelect={() => onSelectConversation(item.id)}
              onContextMenu={({ x, y }) => {
                setMenuState({ conversationId: item.id, x, y });
              }}
              onCommitRename={async (nextTitle) => {
                setRenamingId(null);
                if (nextTitle && nextTitle !== item.title) {
                  await onRenameConversation?.(item.id, nextTitle);
                }
              }}
              onCancelRename={() => setRenamingId(null)}
            />
          ))
        )}
      </Stack>

      <ContextMenu
        isOpen={Boolean(menuState)}
        position={menuState ? { x: menuState.x, y: menuState.y } : null}
        items={menuItems}
        onClose={() => setMenuState(null)}
        ariaLabel="Conversation actions"
      />
    </>
  );
}
