import React, { useEffect } from 'react';
import { useTextReveal } from '../hooks/useTextReveal.js';

/**
 * Parses simple markdown elements:
 * - Code blocks (```code```)
 * - Inline code (`code`)
 * - Paragraphs
 */
function renderFormattedContent(text) {
  if (!text) return null;

  // Check if content contains code fences
  if (text.includes('```')) {
    const parts = text.split(/(```[\s\S]*?```)/g);
    return parts.map((part, index) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        const content = part.slice(3, -3);
        const firstNewline = content.indexOf('\n');
        const code = firstNewline !== -1 ? content.slice(firstNewline + 1) : content;
        return (
          <pre key={index}>
            <code>{code}</code>
          </pre>
        );
      }
      return renderInlineFormatted(part, index);
    });
  }

  return renderInlineFormatted(text, 'root');
}

function renderInlineFormatted(text, key) {
  if (!text) return null;

  // Split on inline code (`...`)
  if (text.includes('`')) {
    const segments = text.split(/(`[^`]+`)/g);
    return (
      <span key={key}>
        {segments.map((seg, sIdx) => {
          if (seg.startsWith('`') && seg.endsWith('`') && seg.length > 2) {
            return <code key={sIdx}>{seg.slice(1, -1)}</code>;
          }
          return seg;
        })}
      </span>
    );
  }

  return text;
}

/**
 * Reusable component for rendering chat message text with:
 * 1. Opacity-based progressive text reveal (typewriter animation) during arrival.
 * 2. Formatted code/markdown rendering once message content is completed.
 * 3. Accessibility support (honors prefers-reduced-motion).
 */
export default function FormattedMessageText({
  text = '',
  isStreaming = false,
  isInterrupted = false,
  animate = false,
  onComplete,
  className = 'message-text',
}) {
  const { displayedText, stableText, streamingFragments, isRevealing, isComplete } = useTextReveal(
    text,
    {
      isStreaming,
      isInterrupted,
      animate,
    }
  );

  useEffect(() => {
    if (animate && isComplete && onComplete) {
      onComplete();
    }
  }, [animate, isComplete, onComplete]);

  if (!displayedText && !isStreaming && !isRevealing) {
    return null;
  }

  return (
    <div className={className}>
      {isRevealing ? (
        <>
          {stableText}
          {streamingFragments.map((frag) => (
            <span key={frag.id} className="streaming-text-fade">
              {frag.text}
            </span>
          ))}
        </>
      ) : (
        renderFormattedContent(displayedText)
      )}
    </div>
  );
}
