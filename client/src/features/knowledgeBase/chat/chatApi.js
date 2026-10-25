/**
 * Chat API service communicating with Express backend chat and SSE streaming endpoints.
 */

import { API_ENDPOINTS, APP_MESSAGES, HTTP_METHODS } from '../../../shared/constants';
import { apiJsonRequest } from '../../../shared/services/apiClient';

export async function sendChatMessage(message) {
  const trimmed = typeof message === 'string' ? message.trim() : '';
  if (!trimmed) {
    throw new Error(APP_MESSAGES.ERROR.MESSAGE_EMPTY);
  }
  return apiJsonRequest(
    API_ENDPOINTS.USER_CHAT,
    HTTP_METHODS.POST,
    { message: trimmed },
    APP_MESSAGES.API_ERROR.SERVER_ERROR
  );
}

/**
 * Helper to locate double-newline SSE message boundaries.
 */
function findEventBoundary(str) {
  const idxCRLF = str.indexOf('\r\n\r\n');
  const idxLF = str.indexOf('\n\n');
  if (idxCRLF !== -1 && (idxLF === -1 || idxCRLF <= idxLF)) {
    return { index: idxCRLF, len: 4 };
  }
  if (idxLF !== -1) {
    return { index: idxLF, len: 2 };
  }
  return null;
}

/**
 * Parses a single SSE event block into an event object.
 */
function parseBlock(block) {
  const lines = block.split(/\r?\n/);
  let eventType = null;
  const dataLines = [];

  for (const line of lines) {
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('event:')) {
      eventType = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (!eventType && dataLines.length === 0) {
    return null;
  }

  eventType = eventType || 'message';
  if (dataLines.length > 0) {
    const raw = dataLines.join('\n');
    let data = raw;
    try {
      data = JSON.parse(raw);
    } catch {
      // Retain raw string if JSON parsing is not applicable
    }
    return { event: eventType, data };
  }

  return { event: eventType, data: {} };
}

/**
 * Dispatches a parsed SSE event to its corresponding callback.
 */
function dispatchParsedEvent(parsed, callbacks) {
  if (!parsed) return;
  const { onMetadata, onDelta, onDone, onError } = callbacks || {};

  switch (parsed.event) {
    case 'metadata':
      if (onMetadata) onMetadata(parsed.data);
      break;
    case 'delta':
      if (onDelta && parsed.data?.text) onDelta(parsed.data.text);
      break;
    case 'done':
      if (onDone) onDone(parsed.data);
      break;
    case 'error': {
      const streamErr = new Error(
        parsed.data?.error || APP_MESSAGES.ERROR.CHAT_COMMUNICATION_FAILED
      );
      if (onError) onError(streamErr);
      throw streamErr;
    }
    default:
      break;
  }
}

/**
 * Initiates an SSE streaming request for the user chat query.
 * Progressively triggers callbacks as events arrive.
 *
 * @param {string} message - User query message
 * @param {object} [callbacks]
 * @param {(text: string) => void} [callbacks.onDelta] - Invoked with incoming response fragment
 * @param {(data: object) => void} [callbacks.onMetadata] - Invoked with sources and retrieval diagnostics
 * @param {(data: object) => void} [callbacks.onDone] - Invoked upon successful stream completion
 * @param {(err: Error) => void} [callbacks.onError] - Invoked on stream failure
 * @param {object} [options]
 * @param {AbortSignal} [options.signal] - AbortSignal for user cancellation
 */
export async function streamChatMessage(message, callbacks = {}, options = {}) {
  const trimmed = typeof message === 'string' ? message.trim() : '';
  if (!trimmed) {
    throw new Error(APP_MESSAGES.ERROR.MESSAGE_EMPTY);
  }

  const { onError } = callbacks;
  const { signal } = options;

  const response = await fetch(API_ENDPOINTS.USER_CHAT, {
    method: HTTP_METHODS.POST,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify({ message: trimmed, stream: true }),
    signal,
  });

  if (!response.ok) {
    let errorMsg;
    try {
      const errorData = await response.json();
      errorMsg = errorData.error;
    } catch {
      errorMsg = `Server error (HTTP ${response.status})`;
    }
    const error = new Error(errorMsg || APP_MESSAGES.ERROR.CHAT_COMMUNICATION_FAILED);
    if (onError) onError(error);
    throw error;
  }

  if (!response.body) {
    const error = new Error(APP_MESSAGES.ERROR.CHAT_COMMUNICATION_FAILED);
    if (onError) onError(error);
    throw error;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let boundary;
      while ((boundary = findEventBoundary(buffer)) !== null) {
        const block = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary.len);

        if (block.trim()) {
          dispatchParsedEvent(parseBlock(block), callbacks);
        }
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
      dispatchParsedEvent(parseBlock(buffer), callbacks);
    }
  } catch (err) {
    if (signal?.aborted || err.name === 'AbortError') {
      const abortErr = new Error('Stream aborted by user');
      abortErr.name = 'AbortError';
      throw abortErr;
    }
    if (onError) onError(err);
    throw err;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Reader lock already released
    }
  }
}
