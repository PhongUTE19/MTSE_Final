import { z } from 'zod';
import { SERVER_MESSAGES } from '../../constants/index.js';

/**
 * Validation schema for Assistant / Chat requests (synchronous and streaming).
 */
export const assistantRequestSchema = z.object({
  message: z.string({
    error: SERVER_MESSAGES.ERRORS.QUERY_REQUIRED,
  })
  .trim()
  .min(1, { error: SERVER_MESSAGES.ERRORS.QUERY_REQUIRED }),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    text: z.string().trim().min(1),
  })).optional(),
  stream: z.boolean().optional(),
});

export const chatRequestSchema = assistantRequestSchema;
