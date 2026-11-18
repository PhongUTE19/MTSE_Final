import { sanitizeGeneratedOutput, validateChatResponse } from '../../shared/guardrails/index.js';

const CITATION_TOKEN_PATTERN = /\[(S\d+)\]/g;
const INTERNAL_STATUS_TOKEN_PATTERN = /[ \t]*\[(?:INSUFFICIENT_EVIDENCE|NO_RESULTS|RETRIEVAL_UNAVAILABLE|SUFFICIENT)\]/gi;
const INCOMPLETE_TAIL_PATTERN = /[ \t]+(?:\[(?:[A-Z0-9_]*)?|<\/?[a-zA-Z_]*)?$|(?:\[(?:[A-Z0-9_]*)?|<\/?[a-zA-Z_]*)$/;

function stripInternalStatusMarkers(text) {
  return String(text || '')
    .replace(INTERNAL_STATUS_TOKEN_PATTERN, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n');
}

function stripUnknownCitations(text, sourcesMap) {
  return stripInternalStatusMarkers(
    text.replace(CITATION_TOKEN_PATTERN, (full, sourceId) => (sourcesMap.has(sourceId) ? full : ''))
  );
}

/**
 * Stateful streaming text filter that buffers potential split citation markers (`[S...`)
 * and simulated XML delimiter tags (`<...`) across chunk boundaries, strips unknown
 * citations, and suppresses prompt-leakage content before emitting `delta` events.
 *
 * @param {{ sourcesMap?: Map<string, object> }} [options]
 */
export function createStreamingTextFilter({ sourcesMap = new Map() } = {}) {
  let pending = '';
  let emitted = '';
  let leaked = false;

  function processText(rawSegment) {
    const { isLeaking, sanitizedText } = sanitizeGeneratedOutput(rawSegment);
    if (isLeaking) {
      leaked = true;
      return '';
    }
    return stripUnknownCitations(sanitizedText, sourcesMap);
  }

  return {
    push(chunkText) {
      if (leaked || typeof chunkText !== 'string' || chunkText.length === 0) {
        return '';
      }
      pending += chunkText;

      // Check cumulative text for prompt-signature leakage split across chunks.
      const cumulativeCheck = sanitizeGeneratedOutput(`${emitted}${pending}`);
      if (cumulativeCheck.isLeaking) {
        leaked = true;
        pending = '';
        return '';
      }

      const tailMatch = pending.match(INCOMPLETE_TAIL_PATTERN);
      const splitAt = tailMatch ? pending.length - tailMatch[0].length : pending.length;
      if (splitAt <= 0) {
        return '';
      }

      const ready = pending.slice(0, splitAt);
      pending = pending.slice(splitAt);

      const safeDelta = processText(ready);
      if (safeDelta && /^[ \t]+$/.test(safeDelta)) {
        pending = `${safeDelta}${pending}`;
        return '';
      }
      if (safeDelta) {
        emitted += safeDelta;
      }
      return safeDelta;
    },

    flush() {
      if (leaked || !pending) {
        pending = '';
        return '';
      }
      const rest = pending;
      pending = '';
      const safeDelta = processText(rest);
      if (safeDelta) {
        emitted += safeDelta;
      }
      return safeDelta;
    },

    hasLeaked() {
      return leaked;
    },
  };
}

/**
 * Validates model answer text, maps [S#] citations strictly against retrieved sources,
 * strips unknown/fabricated [S#] markers, and produces the unified JSON response envelope.
 */
export function finalizeAssistantResponse({
  rawAnswer,
  policy,
  state,
  promptMeta = {},
}) {
  const validated = validateChatResponse(rawAnswer || '');
  const sourcesMap = state?.sourcesMap || new Map();

  const citedIds = [];
  const seenCited = new Set();

  // Strip unknown citation markers (e.g. [S99]) and internal retrieval status markers,
  // and collect valid cited IDs in order.
  // Normalize only horizontal whitespace so Markdown newlines and list formatting remain intact.
  const sanitizedAnswer = stripInternalStatusMarkers(
    validated.answer.replace(CITATION_TOKEN_PATTERN, (full, sourceId) => {
      if (!sourcesMap.has(sourceId)) {
        return '';
      }
      if (!seenCited.has(sourceId)) {
        seenCited.add(sourceId);
        citedIds.push(sourceId);
      }
      return full;
    })
  ).trim();

  const finalAnswer = sanitizedAnswer || validateChatResponse('').answer;

  const citedSources = citedIds.map((id) => sourcesMap.get(id));
  const consultedSources = Array.isArray(state?.consultedSources) ? state.consultedSources : [];
  const lastPrimaryTool = state?.lastPrimaryTool || null;
  const retrievalStatus = state?.kbStatus || null;
  const retrieval = state?.retrieval
    ? { ...state.retrieval, status: retrievalStatus }
    : (retrievalStatus ? { status: retrievalStatus } : null);

  return {
    answer: finalAnswer,
    strategy: 'unified',
    scopeState: policy?.scopeState || null,
    capability: policy?.capability || null,
    toolName: lastPrimaryTool?.name || null,
    toolResult: lastPrimaryTool?.result || null,
    proposal: state?.proposal || null,
    toolsExecuted: Array.isArray(state?.toolsExecuted) ? state.toolsExecuted : [],
    consultedSources,
    sources: citedSources,
    retrievalStatus,
    retrieval,
    promptId: promptMeta.promptId || null,
    promptVersion: promptMeta.promptVersion || null,
    promptHash: promptMeta.promptHash || null,
  };
}
