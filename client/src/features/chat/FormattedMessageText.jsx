import React, { useEffect } from 'react';
import { useTextReveal } from '../../shared/hooks/useTextReveal.js';

const INLINE_CODE_CLASSES =
  'px-1.5 py-0.5 rounded-sm font-mono text-xs bg-surface-muted text-content-primary';

/**
 * Parses simple markdown elements:
 * - Code blocks (```code```)
 * - Lists (* item, - item)
 * - Paragraphs / lines
 * - Inline code (`code`)
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
          <pre
            key={index}
            className="max-w-full overflow-x-auto p-2 px-3 bg-surface-muted rounded-md font-mono text-sm my-2 text-content-primary"
          >
            <code className={INLINE_CODE_CLASSES}>
              {code}
            </code>
          </pre>
        );
      }
      return renderBlocks(part, index);
    });
  }

  return renderBlocks(text, 'root');
}

function renderBlocks(text, keyPrefix = 'block') {
  if (!text) return null;
  const lines = text.split('\n');
  const blocks = [];
  let currentList = null;

  lines.forEach((line, idx) => {
    const bulletMatch = line.match(/^[-*•]\s+(.*)$/);
    if (bulletMatch) {
      if (!currentList) {
        currentList = { id: `${keyPrefix}-list-${idx}`, items: [] };
        blocks.push(currentList);
      }
      currentList.items.push(bulletMatch[1]);
    } else {
      currentList = null;
      if (line.trim() === '') {
        blocks.push({ id: `${keyPrefix}-space-${idx}`, type: 'space' });
      } else {
        blocks.push({ id: `${keyPrefix}-line-${idx}`, type: 'line', text: line });
      }
    }
  });

  return blocks.map((block) => {
    if (block.items) {
      return (
        <ul key={block.id} className="m-0 pl-4 list-disc flex flex-col gap-1">
          {block.items.map((item, iIdx) => (
            <li key={iIdx}>{renderInlineFormatted(item, `${block.id}-${iIdx}`)}</li>
          ))}
        </ul>
      );
    }
    if (block.type === 'space') {
      return <div key={block.id} className="h-1.5" />;
    }
    return (
      <p key={block.id} className="m-0 whitespace-pre-wrap">
        {renderInlineFormatted(block.text, block.id)}
      </p>
    );
  });
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
            return (
              <code
                key={sIdx}
                className={INLINE_CODE_CLASSES}
              >
                {seg.slice(1, -1)}
              </code>
            );
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
    <div className="text-base leading-normal text-content-primary whitespace-pre-wrap break-words m-0">
      {isRevealing ? (
        <>
          {stableText}
          {streamingFragments.map((frag) => (
            <span
              key={frag.id}
              className="inline animate-stream-in"
            >
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
