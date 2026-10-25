import React from 'react';

/**
 * Generic history list tab for Chat conversations.
 */
export default function ChatHistoryTab({
  conversations = [],
  activeId,
  onSelectConversation,
  onRemoveConversation,
  onNewConversation,
  emptyLabel = 'No saved conversations.',
  deleteTooltip = 'Delete conversation',
  newConversationLabel = '＋ New conversation',
}) {
  return (
    <div className="ai-history" role="list">
      {onNewConversation && (
        <div className="ai-history-actions">
          <button
            type="button"
            className="secondary-button ai-history-new-btn"
            onClick={onNewConversation}
          >
            {newConversationLabel}
          </button>
        </div>
      )}

      {conversations.length === 0 ? (
        <div className="ai-history--empty">
          <p className="ai-empty">{emptyLabel}</p>
        </div>
      ) : (
        conversations.map((item) => {
          const isActive = item.id === activeId;
          return (
            <div key={item.id} className={isActive ? 'ai-history-item active' : 'ai-history-item'}>
              <button
                type="button"
                className="ai-history-select"
                onClick={() => onSelectConversation(item.id)}
              >
                {item.title || 'New conversation'}
              </button>
              <button
                type="button"
                className="ai-history-delete"
                onClick={() => onRemoveConversation(item.id)}
                aria-label={deleteTooltip}
                title={deleteTooltip}
              >
                ⌫
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}

export const AssistantHistoryTab = ChatHistoryTab;
