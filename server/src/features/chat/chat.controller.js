import * as chatService from './chat.service.js';
import { SERVER_MESSAGES } from '../../constants/index.js';
import { chatRequestSchema } from './chat.schemas.js';
import { getValidatedData } from '../../shared/middleware/index.js';


/**
 * Handles user chat POST requests:
 * POST /api/user/chat
 * If streaming is requested (via body.stream or Accept: text/event-stream), delegates to chatStream.
 */
export async function chat(req, res, next) {
  const validated = getValidatedData(res, 'body', chatRequestSchema, req.body, chatService.ChatServiceError);
  const isStream = (validated?.stream ?? req.body?.stream) === true || req.headers?.accept?.includes('text/event-stream');
  if (isStream) {
    return chatStream(req, res, next);
  }

  try {
    const { message } = validated;
    const result = await chatService.orchestrateChat(message);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Handles user chat SSE streaming POST requests:
 * POST /api/user/chat/stream or POST /api/user/chat with stream: true
 */
export async function chatStream(req, res, next) {
  let validated;
  try {
    validated = getValidatedData(res, 'body', chatRequestSchema, req.body || {}, chatService.ChatServiceError);
  } catch (validationError) {
    // Failures before stream starts are propagated to centralized error middleware
    return next(validationError);
  }


  const { message } = validated;

  // Set SSE response headers with proxy buffering disabled
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  const abortController = new AbortController();

  res.on('close', () => {
    if (!res.writableEnded) {
      abortController.abort();
    }
  });

  const sendEvent = (event, data) => {
    if (res.writableEnded || res.closed || abortController.signal.aborted) {
      return;
    }
    const payload = JSON.stringify(data);
    res.write(`event: ${event}\ndata: ${payload}\n\n`);
    if (typeof res.flush === 'function') {
      res.flush();
    }
  };

  try {
    await chatService.orchestrateChatStream(message, sendEvent, {
      signal: abortController.signal,
    });
  } catch (error) {
    console.error('[ChatController] Stream error:', error.message);
    if (!res.writableEnded && !abortController.signal.aborted) {
      sendEvent('error', {
        error: error.message || SERVER_MESSAGES.ERRORS.CHAT_PROCESSING_FAILED,
      });
    }
  } finally {
    if (!res.writableEnded) {
      res.end();
    }
  }
}
