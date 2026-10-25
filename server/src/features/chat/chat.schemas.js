import { z } from 'zod';
import { SERVER_MESSAGES } from '../../constants/index.js';

/**
 * Schema for user chat query requests (both synchronous and streaming).
 */
export const chatRequestSchema = z.object({
  message: z.string({
    error: SERVER_MESSAGES.ERRORS.QUERY_REQUIRED,
  })
  .trim()
  .min(1, { error: SERVER_MESSAGES.ERRORS.QUERY_REQUIRED }),
  stream: z.boolean().optional(),
});
