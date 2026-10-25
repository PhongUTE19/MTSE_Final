import React from 'react';
import Drawer from '../../shared/components/Drawer';
import ChatComposer from './ChatComposer';
import ChatHistoryTab from './ChatHistoryTab';
import ChatMessageItem from './ChatMessageItem';

/**
 * Reusable standalone floating corner chat drawer interface with
 * slide-out drawer, accessible new-conversation action, conversation history,
 * and domain-specific rendering slots.
 */
export default function ChatDrawer({
  assistant,
  title = 'Assistant',
  subtitle = 'AI Assistant',
  avatarIcon = '✨',
  welcomeQuestion = 'How can I help you today?',
  quickActions = [],
  toolLabel = 'Function',
  renderToolResult,
  renderBeforeComposer,
  renderAttachmentAction,
  composerPlaceholder = 'Ask a question...',
  sendLabel = 'Send',
  deleteConfirmPrompt = 'Delete this conversation?',
  newConversationLabel = 'New conversation',
}) {
  const {
    open,
    setOpen,
    maximized,
    setMaximized,
    tab,
    setTab,
    conversations,
    active,
    busy,
    error,
    conversationRef,
    handleScroll,
    sendMessage,
    handleRevealComplete,
    newConversation,
    removeConversation,
  } = assistant;

  return (
    <div className="ai-assistant">
      <button
        className="ai-fab"
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={open ? 'Close Assistant' : `Open ${title}`}
        title={open ? 'Minimize Assistant' : `Open ${title}`}
      >
        {avatarIcon}
      </button>

      {open && (
        <Drawer
          id="chat-drawer"
          isOpen={open}
          onClose={() => setOpen(false)}
          ariaLabel={title}
          className={`ai-chat-card ${maximized ? 'ai-chat-card--maximized' : ''}`}
          bodyClassName="ai-chat-drawer-body"
          hideBackdrop={true}
          header={
            <header className="ai-chat-header">
              <span className="ai-avatar">{avatarIcon}</span>
              <div>
                <h2>{title}</h2>
                <small>{subtitle}</small>
              </div>
              <div className="ai-header-actions">
                <button
                  type="button"
                  onClick={newConversation}
                  title={newConversationLabel}
                  aria-label={newConversationLabel}
                  className="ai-new-chat-btn"
                >
                  ＋
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  title="Close assistant"
                  aria-label="Close assistant"
                >
                  ×
                </button>
              </div>
            </header>
          }
        >
          <div className="ai-tabs">
            <button
              className={tab === 'chat' ? 'active' : ''}
              onClick={() => setTab('chat')}
            >
              Chat
            </button>
            <button
              className={tab === 'history' ? 'active' : ''}
              onClick={() => setTab('history')}
            >
              History
            </button>
          </div>

          {tab === 'history' ? (
            <ChatHistoryTab
              conversations={conversations}
              activeId={active?.id}
              onSelectConversation={(id) => {
                assistant.setActiveId(id);
                setTab('chat');
              }}
              onRemoveConversation={(id) => removeConversation(id, deleteConfirmPrompt)}
              onNewConversation={newConversation}
            />
          ) : (
            <>
              <div
                className="ai-chat-history"
                ref={conversationRef}
                onScroll={handleScroll}
                role="log"
                aria-live="polite"
              >
                {!active?.messages.length && (
                  <>
                    <section className="ai-welcome">
                      <span className="ai-avatar">{avatarIcon}</span>
                      <h3>{welcomeQuestion}</h3>
                    </section>
                    {quickActions.length > 0 && (
                      <div className="ai-quick-actions">
                        {quickActions.map(([icon, label, prompt]) => (
                          <button
                            type="button"
                            key={label}
                            onClick={() => sendMessage(prompt)}
                            disabled={busy}
                          >
                            <span>{icon}</span>
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {active?.messages.map((item) => (
                  <ChatMessageItem
                    key={item.id}
                    item={item}
                    onRevealComplete={handleRevealComplete}
                    renderToolResult={renderToolResult}
                    avatarIcon={avatarIcon}
                    toolLabel={toolLabel}
                  />
                ))}

                {busy && (
                  <article className="ai-message ai-message--assistant">
                    <span className="ai-avatar">{avatarIcon}</span>
                    <p>Thinking…</p>
                  </article>
                )}

                {error && <p className="form-error">{error}</p>}

                {renderBeforeComposer?.()}
              </div>

              <ChatComposer
                onSendMessage={sendMessage}
                busy={busy}
                placeholder={composerPlaceholder}
                sendLabel={sendLabel}
                renderAttachmentAction={renderAttachmentAction}
              />
            </>
          )}
        </Drawer>
      )}
    </div>
  );
}

export const FloatingAssistant = ChatDrawer;
export const FloatingChat = ChatDrawer;
