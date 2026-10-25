import React from 'react';
import AnswerContent from './AnswerContent';
import AnswerDebugPanel from './debug/AnswerDebugPanel';
import { UI_LABELS, CHAT_CONFIG } from '../../../shared/constants';

/**
 * Renders an assistant response message including loading, streaming, and error states.
 * Debug metadata (sources, chunks) is isolated and only displayed when showDebug is enabled.
 */
export default function AssistantMessage({
  message,
  showDebug = CHAT_CONFIG.DEFAULT_SHOW_DEBUG,
}) {
  const {
    content,
    sources,
    retrieval,
    isStreaming = false,
    isThinking = false,
    isInterrupted = false,
    interruptedMessage,
  } = message || {};

  if (!content && !isThinking && !isInterrupted) return null;

  return (
    <div className="chat-message chat-message--assistant">
      <div className="panel chat-answer-panel">
        {isThinking && !content ? (
          <div className="alert alert-info" role="status">
            <span className="spinner"></span> {UI_LABELS.USER_CHAT.THINKING_MESSAGE}
          </div>
        ) : (
          <AnswerContent
            answer={content}
            isStreaming={isStreaming}
            isInterrupted={isInterrupted}
          />
        )}

        {isInterrupted && (
          <div className="panel-body">
            <div className="alert alert-warning" role="alert">
              {interruptedMessage || UI_LABELS.ANSWER_SECTION.INTERRUPTED_MESSAGE}
            </div>
          </div>
        )}

        {/* Debug UI is isolated and rendered only when explicitly enabled */}
        {showDebug && <AnswerDebugPanel sources={sources} retrieval={retrieval} />}
      </div>
    </div>
  );
}
