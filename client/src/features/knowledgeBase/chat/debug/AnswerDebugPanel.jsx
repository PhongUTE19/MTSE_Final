import React from 'react';
import SupportingSources from './SupportingSources';
import RetrievedChunks from './RetrievedChunks';

/**
 * Combines developer debug metadata (retrieved chunks and supporting sources).
 * This component is kept separate from the normal user-facing answer presentation.
 */
export default function AnswerDebugPanel({ sources, retrieval }) {
  const hasSources = Boolean(sources && sources.length > 0);
  const hasRetrieval = Boolean(retrieval);

  if (!hasSources && !hasRetrieval) return null;

  return (
    <div className="answer-debug-panel">
      {hasSources && <SupportingSources sources={sources} />}
      {hasRetrieval && <RetrievedChunks retrieval={retrieval} />}
    </div>
  );
}
