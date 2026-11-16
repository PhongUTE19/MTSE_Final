import { HTTP_STATUS } from '../../constants/index.js';
import { AppError } from '../../shared/errors/index.js';
import { getRagPrompt } from '../knowledgeBase/ragPrompt.js';

export class PromptServiceError extends AppError {
  constructor(message, statusCode = HTTP_STATUS.BAD_REQUEST) {
    super(message, statusCode);
  }
}

/**
 * Gets the canonical Git-managed RAG system prompt (read-only).
 *
 * @returns {string} Active canonical system prompt
 */
export function getSystemPrompt() {
  return getRagPrompt('system').text;
}
