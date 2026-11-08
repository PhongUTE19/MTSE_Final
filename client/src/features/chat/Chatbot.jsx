import React, { useRef } from 'react';
import PushDrawer from '../../composites/overlays/PushDrawer.jsx';
import Button from '../../primitives/buttons/Button.jsx';
import { CardHeader, CardTitle } from '../../primitives/cards/index.js';
import Text from '../../primitives/typography/Text.jsx';
import Avatar from '../../primitives/display/Avatar.jsx';
import { Inline, Stack } from '../../primitives/layout/index.js';
import ChatConversation from './ChatConversation.jsx';
import ChatHistoryTab from './ChatHistoryTab';

/**
 * Chatbot feature component for SpendWise.
 * Orchestrates the Chatbot interface by connecting feature state to UI components
 * (PushDrawer, tabs, message stream, conversation history, and ChatComposer).
 */
export default function Chatbot({
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
    newConversation,
    removeConversation,
  } = assistant;

  const fabRef = useRef(null);

  return (
    <div
      className={`fixed pointer-events-none flex flex-col items-end ${
        open
          ? 'top-0 right-0 bottom-0 z-mobile-assistant gap-0 max-tablet:left-0'
          : 'right-4 bottom-4 z-assistant gap-2.5'
      }`}
    >
      <div className={open ? 'hidden' : 'pointer-events-auto'}>
        <Button
          ref={fabRef}
          variant="fab"
          type="button"
          onClick={() => setOpen(!open)}
          aria-label={open ? 'Close Assistant' : `Open ${title}`}
          title={open ? 'Minimize Assistant' : `Open ${title}`}
        >
          {avatarIcon}
        </Button>
      </div>

      {open && (
        <PushDrawer
          id="chat-drawer"
          isOpen={open}
          onClose={() => setOpen(false)}
          triggerRef={fabRef}
          ariaLabel={title}
          maximized={maximized}
          header={
            <div className="shrink-0">
              <CardHeader as="header">
                <Inline justify="between" align="center" fullWidth>
                  <Inline gap="sm" align="center">
                    <Avatar size="md" variant="dark" decorative>{avatarIcon}</Avatar>
                    <Stack gap="2xs">
                      <CardTitle as="h2">{title}</CardTitle>
                      <Text variant="caption">{subtitle}</Text>
                    </Stack>
                  </Inline>
                  <Inline gap="xs" align="center">
                    {setMaximized && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setMaximized(!maximized)}
                        title={maximized ? 'Restore size' : 'Maximize size'}
                        aria-label={maximized ? 'Restore size' : 'Maximize size'}
                      >
                        {maximized ? '❐' : '□'}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={newConversation}
                      title={newConversationLabel}
                      aria-label={newConversationLabel}
                    >
                      ＋
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setOpen(false)}
                      title="Close assistant"
                      aria-label="Close assistant"
                    >
                      ×
                    </Button>
                  </Inline>
                </Inline>
              </CardHeader>
            </div>
          }
        >
          <div className="shrink-0">
            <Inline as="nav" gap="xs" role="tablist">
              <Button
                type="button"
                variant="ghost"
                role="tab"
                aria-selected={tab === 'chat'}
                onClick={() => setTab('chat')}
              >
                Chat
              </Button>
              <Button
                type="button"
                variant="ghost"
                role="tab"
                aria-selected={tab === 'history'}
                onClick={() => setTab('history')}
              >
                History
              </Button>
            </Inline>
          </div>

          {tab === 'history' ? (
            <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-2.5">
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
            </div>
          ) : (
            <ChatConversation
              assistant={assistant}
              avatarIcon={avatarIcon}
              welcomeQuestion={welcomeQuestion}
              quickActions={quickActions}
              toolLabel={toolLabel}
              renderToolResult={renderToolResult}
              renderBeforeComposer={renderBeforeComposer}
              renderAttachmentAction={renderAttachmentAction}
              composerPlaceholder={composerPlaceholder}
              sendLabel={sendLabel}
            />
          )}
        </PushDrawer>
      )}
    </div>
  );
}
