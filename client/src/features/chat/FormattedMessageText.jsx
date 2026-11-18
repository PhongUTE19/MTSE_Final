import React, { useEffect } from 'react';
import { useTextReveal } from '../../shared/hooks/useTextReveal.js';

const INLINE_CODE_LIGHT =
  'px-1.5 py-0.5 rounded-sm font-mono text-xs bg-surface-muted text-content-primary';
const INLINE_CODE_INVERSE =
  'px-1.5 py-0.5 rounded-sm font-mono text-xs bg-white/15 text-content-inverse';

const CODE_BLOCK_LIGHT =
  'max-w-full overflow-x-auto p-2.5 px-3 bg-surface-muted rounded-md font-mono text-xs leading-relaxed my-1.5 text-content-primary whitespace-pre';
const CODE_BLOCK_INVERSE =
  'max-w-full overflow-x-auto p-2.5 px-3 bg-white/15 rounded-md font-mono text-xs leading-relaxed my-1.5 text-content-inverse whitespace-pre';

const HEADING_CLASSES = {
  1: 'text-base font-bold leading-snug m-0 mt-1',
  2: 'text-sm font-bold leading-snug m-0 mt-1',
  3: 'text-sm font-semibold leading-snug m-0 mt-0.5',
  4: 'text-xs font-semibold uppercase tracking-wide m-0 mt-0.5',
};

/**
 * Validates and sanitizes markdown link URLs.
 * Allows only http:, https:, and mailto: URLs; rejects javascript:, data:, vbscript:, etc.
 */
export function sanitizeMarkdownHref(rawUrl) {
  if (typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed, 'https://spendwise.invalid');
    if (trimmed.startsWith('/')) {
      return null;
    }
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:') {
      return trimmed;
    }
    return null;
  } catch {
    return null;
  }
}

function renderInlineTokens(text, keyPrefix, inverse = false) {
  if (!text) return null;

  const tokenRegex =
    /(`[^`\n]+`|\[[^\]]+\]\([^)\s]+\)|\*\*[^*\n]+?\*\*|__[^_\n]+?__|\*[^*\n]+?\*|_[^_\n]+?_)/g;
  const nodes = [];
  let lastIndex = 0;
  let match;
  let tokenIdx = 0;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    const key = `${keyPrefix}-${tokenIdx++}`;

    if (token.startsWith('`') && token.endsWith('`') && token.length >= 2) {
      nodes.push(
        <code key={key} className={inverse ? INLINE_CODE_INVERSE : INLINE_CODE_LIGHT}>
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('[')) {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
      if (linkMatch) {
        const [, label, href] = linkMatch;
        const safeHref = sanitizeMarkdownHref(href);
        if (safeHref) {
          nodes.push(
            <a
              key={key}
              href={safeHref}
              target="_blank"
              rel="noopener noreferrer"
              className={
                inverse
                  ? 'underline text-content-inverse hover:opacity-80 break-all'
                  : 'underline text-brand hover:text-brand-hover break-all'
              }
            >
              {label}
            </a>
          );
        } else {
          nodes.push(`${label} (${href})`);
        }
      } else {
        nodes.push(token);
      }
    } else if (
      (token.startsWith('**') && token.endsWith('**') && token.length > 4) ||
      (token.startsWith('__') && token.endsWith('__') && token.length > 4)
    ) {
      nodes.push(
        <strong key={key} className="font-semibold">
          {renderInlineTokens(token.slice(2, -2), `${key}-b`, inverse)}
        </strong>
      );
    } else if (
      (token.startsWith('*') && token.endsWith('*') && token.length > 2) ||
      (token.startsWith('_') && token.endsWith('_') && token.length > 2)
    ) {
      nodes.push(
        <em key={key} className="italic">
          {renderInlineTokens(token.slice(1, -1), `${key}-i`, inverse)}
        </em>
      );
    } else {
      nodes.push(token);
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length === 1 ? nodes[0] : nodes;
}

function renderBlocks(text, keyPrefix = 'block', inverse = false) {
  if (!text) return null;
  const lines = text.split('\n');
  const blocks = [];
  let currentList = null;

  lines.forEach((line, idx) => {
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    const unorderedMatch = line.match(/^[-*•]\s+(.*)$/);
    const orderedMatch = line.match(/^\d+\.\s+(.*)$/);

    if (headingMatch) {
      currentList = null;
      blocks.push({
        id: `${keyPrefix}-h-${idx}`,
        type: 'heading',
        level: headingMatch[1].length,
        text: headingMatch[2],
      });
    } else if (unorderedMatch) {
      if (!currentList || currentList.listType !== 'ul') {
        currentList = { id: `${keyPrefix}-ul-${idx}`, listType: 'ul', items: [] };
        blocks.push(currentList);
      }
      currentList.items.push(unorderedMatch[1]);
    } else if (orderedMatch) {
      if (!currentList || currentList.listType !== 'ol') {
        currentList = { id: `${keyPrefix}-ol-${idx}`, listType: 'ol', items: [] };
        blocks.push(currentList);
      }
      currentList.items.push(orderedMatch[1]);
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
    if (block.listType === 'ul') {
      return (
        <ul key={block.id} className="m-0 pl-5 list-disc flex flex-col gap-1">
          {block.items.map((item, iIdx) => (
            <li key={iIdx}>{renderInlineTokens(item, `${block.id}-${iIdx}`, inverse)}</li>
          ))}
        </ul>
      );
    }
    if (block.listType === 'ol') {
      return (
        <ol key={block.id} className="m-0 pl-5 list-decimal flex flex-col gap-1">
          {block.items.map((item, iIdx) => (
            <li key={iIdx}>{renderInlineTokens(item, `${block.id}-${iIdx}`, inverse)}</li>
          ))}
        </ol>
      );
    }
    if (block.type === 'heading') {
      const Tag = `h${Math.min(4, Math.max(1, block.level))}`;
      return (
        <Tag key={block.id} className={HEADING_CLASSES[block.level] || HEADING_CLASSES[3]}>
          {renderInlineTokens(block.text, block.id, inverse)}
        </Tag>
      );
    }
    if (block.type === 'space') {
      return <div key={block.id} className="h-1.5" />;
    }
    return (
      <p key={block.id} className="m-0 whitespace-pre-wrap">
        {renderInlineTokens(block.text, block.id, inverse)}
      </p>
    );
  });
}

function renderFormattedContent(text, inverse = false) {
  if (!text) return null;

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
            className={inverse ? CODE_BLOCK_INVERSE : CODE_BLOCK_LIGHT}
          >
            <code>{code}</code>
          </pre>
        );
      }
      return renderBlocks(part, `part-${index}`, inverse);
    });
  }

  return renderBlocks(text, 'root', inverse);
}

/**
 * Reusable component for rendering chat message text with:
 * 1. Safe Markdown formatting (bold, italic, headings, ordered/unordered lists,
 *    inline code, code blocks, sanitized links, paragraphs).
 * 2. Progressive text reveal during arrival without breaking Markdown formatting.
 * 3. Surface-aware contrast (`inverse` for dark user bubbles).
 */
export default function FormattedMessageText({
  text = '',
  isStreaming = false,
  streamed = false,
  isInterrupted = false,
  animate = false,
  inverse = false,
  onComplete,
}) {
  const { displayedText, isRevealing, isComplete } = useTextReveal(
    text,
    {
      isStreaming: false,
      isInterrupted,
      animate: animate && !isStreaming && !streamed,
    }
  );

  useEffect(() => {
    if (animate && !isStreaming && !streamed && isComplete && onComplete) {
      onComplete();
    }
  }, [animate, isStreaming, streamed, isComplete, onComplete]);

  const instant = !animate || isStreaming || streamed;
  const contentToRender = instant ? text : displayedText;

  if (!contentToRender && !isStreaming && !isRevealing) {
    return null;
  }

  return (
    <div
      className={`text-sm leading-relaxed break-words m-0 flex flex-col gap-1.5 ${
        inverse ? 'text-content-inverse' : 'text-content-primary'
      } ${!instant && isRevealing ? 'animate-stream-in' : ''}`}
    >
      {renderFormattedContent(contentToRender, inverse)}
    </div>
  );
}
