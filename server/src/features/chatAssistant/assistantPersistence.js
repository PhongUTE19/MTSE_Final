import crypto from 'node:crypto';
import { AppError } from '../../shared/errors/index.js';
import { HTTP_STATUS } from '../../constants/index.js';
import {
  beginStreamTurn,
  findOwnedConversation,
  finalizeStreamMessage,
  listConversationMessages,
  updateStreamingCheckpoint,
} from '../chatHistory/chatHistory.repository.js';

export const MAX_AUTHORITATIVE_HISTORY_TURNS = 16;

/**
 * Deterministically validates and formats database-loaded conversation rows into
 * trusted conversation turns (`user` and `completed` `assistant` messages) in
 * chronological order. Never silently coerces unsupported roles into `user`.
 *
 * @param {unknown} rows
 * @returns {Array<{ role: 'user'|'assistant', text: string }>}
 */
export function formatAuthoritativeHistory(rows) {
  if (!Array.isArray(rows)) {
    throw new AppError('Invalid authoritative conversation history.', HTTP_STATUS.BAD_REQUEST);
  }

  const turns = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new AppError('Malformed database history record.', HTTP_STATUS.BAD_REQUEST);
    }

    const { role } = row;
    if (role !== 'user' && role !== 'assistant') {
      throw new AppError(`Unsupported database history role "${String(role)}".`, HTTP_STATUS.BAD_REQUEST);
    }

    const rawText = row.content !== undefined ? row.content : row.text;
    if (role === 'assistant') {
      const status = row.status || 'completed';
      if (status !== 'completed') {
        // Skip non-completed assistant attempts (streaming, aborted, failed).
        continue;
      }
      if (typeof rawText !== 'string') {
        throw new AppError('Malformed completed assistant history record.', HTTP_STATUS.BAD_REQUEST);
      }
      if (!rawText.trim()) {
        continue;
      }
      turns.push({ role: 'assistant', text: rawText.trim() });
      continue;
    }

    if (typeof rawText !== 'string') {
      throw new AppError('Malformed user history record.', HTTP_STATUS.BAD_REQUEST);
    }
    if (!rawText.trim()) {
      continue;
    }
    turns.push({ role: 'user', text: rawText.trim() });
  }

  return turns.slice(-MAX_AUTHORITATIVE_HISTORY_TURNS);
}

/**
 * Loads server-authoritative conversation history for an owned conversation.
 * Includes only `user` turns and `completed` `assistant` turns.
 * Excludes `streaming`, `aborted`, and `failed` assistant attempts.
 */
export async function loadServerAuthoritativeHistory(user, conversationId, options = {}) {
  if (!conversationId || !user?.id || !user?.token) {
    return [];
  }

  const findConv = options.findOwnedConversation || findOwnedConversation;
  const listMsgs = options.listConversationMessages || listConversationMessages;

  try {
    await findConv(user, conversationId);
  } catch (err) {
    if (err?.statusCode === 404) {
      // Brand-new client-supplied UUID conversation that has not been persisted yet.
      return [];
    }
    throw err;
  }

  const rows = await listMsgs(user, conversationId);
  return formatAuthoritativeHistory(rows);
}

/**
 * Registers a streaming turn atomically (resolving/creating conversation, idempotently
 * ensuring the user message, and creating a `streaming` assistant row).
 */
export async function registerStreamAttempt(
  user,
  { conversationId, title, userMessageId, userContent, assistantMessageId, requestId },
  options = {}
) {
  const beginFn = options.beginStreamTurn || beginStreamTurn;
  return beginFn(user, {
    conversationId: conversationId || crypto.randomUUID(),
    title: title || String(userContent || '').slice(0, 48) || 'New conversation',
    userMessageId: userMessageId || crypto.randomUUID(),
    userContent,
    assistantMessageId: assistantMessageId || crypto.randomUUID(),
    requestId: requestId || crypto.randomUUID(),
  });
}

export async function checkpointStreamAttempt(user, params, options = {}) {
  const checkpointFn = options.updateStreamingCheckpoint || updateStreamingCheckpoint;
  return checkpointFn(user, params);
}

export async function finalizeStreamAttempt(user, params, options = {}) {
  const finalizeFn = options.finalizeStreamMessage || finalizeStreamMessage;
  return finalizeFn(user, params);
}
