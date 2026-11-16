import { z } from 'zod';
import { SERVER_MESSAGES } from '../../constants/index.js';

export const CHAT_HISTORY_MAX_TURNS = 8;
export const CHAT_MESSAGE_MAX_LENGTH = 1000;

const historyTurnSchema = z.object({
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  text: z.string().trim().min(1).max(CHAT_MESSAGE_MAX_LENGTH).optional(),
  content: z.string().trim().min(1).max(CHAT_MESSAGE_MAX_LENGTH).optional(),
  functionCall: z.unknown().optional(),
  functionResponse: z.unknown().optional(),
}).strict().refine(
  (turn) => Boolean(turn.text || turn.content || turn.functionCall !== undefined || turn.functionResponse !== undefined),
  { message: 'History turn must include text, content, or a function payload.' }
);

/**
 * Validation schema for Chat Assistant requests (synchronous and streaming).
 */
export const chatAssistantRequestSchema = z.object({
  message: z.string({
    error: SERVER_MESSAGES.ERRORS.QUERY_REQUIRED,
  })
    .trim()
    .min(1, { error: SERVER_MESSAGES.ERRORS.QUERY_REQUIRED })
    .max(CHAT_MESSAGE_MAX_LENGTH, { error: `Message must not exceed ${CHAT_MESSAGE_MAX_LENGTH} characters.` }),
  history: z.array(historyTurnSchema).max(CHAT_HISTORY_MAX_TURNS).optional(),
  conversationId: z.string().trim().max(100).optional(),
  requestId: z.string().uuid().optional(),
  userMessageId: z.string().uuid().optional(),
  retryOfMessageId: z.string().uuid().optional(),
  stream: z.boolean().optional(),
});
