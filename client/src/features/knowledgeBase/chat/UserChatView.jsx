import React from 'react';
import ChatForm from './ChatForm';
import ConversationList from './ConversationList';
import { useChat } from './useChat';
import { SAMPLE_QUESTIONS, UI_LABELS, CHAT_CONFIG } from '../../../shared/constants';

/**
 * Main Chat View coordinating quick questions, conversation flow, and prompt submission.
 */
export default function UserChatView({
  health,
  onRefreshHealth,
  showDebug = CHAT_CONFIG.DEFAULT_SHOW_DEBUG,
}) {
  const {
    messages,
    loading,
    sendMessage,
    stopGeneration,
    conversationRef,
    bottomRef,
    handleScroll,
  } = useChat({
    health,
    onRefreshHealth,
  });

  return (
    <main className="app-main">
      <div className="sample-chips">
        <span className="chips-label">{UI_LABELS.USER_CHAT.QUICK_TEST}</span>
        {SAMPLE_QUESTIONS.map((q, idx) => (
          <button
            key={idx}
            type="button"
            className="btn btn-chip"
            disabled={loading}
            onClick={() => sendMessage(q)}
          >
            {q}
          </button>
        ))}
      </div>

      <ConversationList
        messages={messages}
        showDebug={showDebug}
        conversationRef={conversationRef}
        bottomRef={bottomRef}
        handleScroll={handleScroll}
      />

      <ChatForm
        onSubmit={sendMessage}
        loading={loading}
        onStop={stopGeneration}
      />
    </main>
  );
}
