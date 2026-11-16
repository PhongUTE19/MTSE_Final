const KNOWN_SSE_EVENTS = new Set(['meta', 'delta', 'proposal', 'sources', 'done', 'error']);

/**
 * Stateful SSE frame parser supporting:
 * - Multiple events per chunk
 * - Events split across chunks
 * - CRLF (\r\n) and LF (\n) line endings
 * - UTF-8 multibyte character decoding across chunk boundaries
 * - JSON validation, unknown event ignoring, and incomplete trailing frame detection
 */
export function createSSEParser(onEvent) {
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let terminalSeen = false;

  function processFrame(rawFrame) {
    const trimmedFrame = rawFrame.trim();
    if (!trimmedFrame) return;

    let eventType = 'message';
    const dataLines = [];

    for (const line of rawFrame.split('\n')) {
      if (!line || line.startsWith(':')) continue;
      const colonIdx = line.indexOf(':');
      const field = colonIdx === -1 ? line : line.slice(0, colonIdx);
      let value = colonIdx === -1 ? '' : line.slice(colonIdx + 1);
      if (value.startsWith(' ')) {
        value = value.slice(1);
      }

      if (field === 'event') {
        eventType = value.trim();
      } else if (field === 'data') {
        dataLines.push(value);
      }
    }

    if (dataLines.length === 0) return;

    const rawData = dataLines.join('\n');
    let parsed;
    try {
      parsed = JSON.parse(rawData);
    } catch (err) {
      throw new Error(`Malformed SSE JSON payload for event "${eventType}": ${err.message}`);
    }

    if (!KNOWN_SSE_EVENTS.has(eventType)) {
      // Safely ignore unknown event types.
      return;
    }

    if (eventType === 'done' || eventType === 'error') {
      terminalSeen = true;
    }

    onEvent?.(eventType, parsed);
  }

  function push(chunk) {
    const text = typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
    buffer += text.replace(/\r\n/g, '\n');

    let separatorIdx;
    while ((separatorIdx = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, separatorIdx);
      buffer = buffer.slice(separatorIdx + 2);
      processFrame(frame);
    }
  }

  function finish() {
    buffer += decoder.decode().replace(/\r\n/g, '\n');

    let separatorIdx;
    while ((separatorIdx = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, separatorIdx);
      buffer = buffer.slice(separatorIdx + 2);
      processFrame(frame);
    }

    if (buffer.trim().length > 0) {
      throw new Error('Stream ended with an incomplete SSE frame.');
    }

    if (!terminalSeen) {
      throw new Error('Stream closed unexpectedly before completion.');
    }
  }

  return { push, finish };
}

/**
 * Consumes a ReadableStream of Uint8Array SSE chunks.
 */
export async function parseSSEStream(readableStream, { onEvent, signal } = {}) {
  if (!readableStream || typeof readableStream.getReader !== 'function') {
    throw new Error('Streaming response body is unavailable.');
  }

  const parser = createSSEParser(onEvent);
  const reader = readableStream.getReader();

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel().catch(() => {});
        const abortErr = new Error('Stream aborted by user.');
        abortErr.name = 'AbortError';
        throw abortErr;
      }

      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        parser.push(value);
      }
    }
    parser.finish();
  } finally {
    reader.releaseLock?.();
  }
}
