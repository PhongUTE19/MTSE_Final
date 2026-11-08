import { z } from 'zod';
import { SERVER_MESSAGES, PROMPT_CONSTRAINTS } from '../../constants/index.js';

/**
 * Schema for updating the system prompt (PUT /api/admin/prompt).
 * Enforces non-empty string and 20–10,000 character boundaries.
 */
export const updateSystemPromptSchema = z.object({
  prompt: z.string({
    error: SERVER_MESSAGES.ERRORS.PROMPT_EMPTY,
  })
    .trim()
    .min(1, { error: SERVER_MESSAGES.ERRORS.PROMPT_EMPTY })
    .min(PROMPT_CONSTRAINTS.MIN_LENGTH, { error: SERVER_MESSAGES.ERRORS.PROMPT_TOO_SHORT })
    .max(PROMPT_CONSTRAINTS.MAX_LENGTH, { error: SERVER_MESSAGES.ERRORS.PROMPT_TOO_LONG }),
});
