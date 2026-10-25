import React from 'react';
import { useTextReveal } from './useTextReveal';

/**
 * Renders the assistant's answer text with a subtle opacity fade-in as new text materializes.
 */
export default function AnswerContent({
  answer,
  isStreaming = false,
  isInterrupted = false,
}) {
  const { displayedText, isRevealing, stableText, streamingFragments } = useTextReveal(answer, {
    isStreaming,
    isInterrupted,
  });

  if (!displayedText && !isStreaming && !isRevealing) return null;

  return (
    <div className="panel-body">
      <p className="message-text">
        {!isRevealing ? (
          displayedText
        ) : (
          <>
            {stableText}
            {streamingFragments.map((frag) => (
              <span key={frag.id} className="streaming-text-fade">
                {frag.text}
              </span>
            ))}
          </>
        )}
      </p>
    </div>
  );
}
