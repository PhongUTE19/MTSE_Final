import { apiJsonRequest } from '../../shared/services/apiClient.js';

/**
 * Sends a message to the central chat orchestrator endpoint.
 *
 * @param {string} message - User query text
 * @param {Array<{role: string, text: string}>} [history=[]] - Recent conversation history
 * @returns {Promise<{
 *   answer: string,
 *   strategy: string,
 *   toolName: string|null,
 *   toolResult: any|null,
 *   proposal: object|null,
 *   sources: Array<object>,
 *   retrieval: object|null
 * }>}
 */
export function sendChatMessage(message, history = []) {
  return apiJsonRequest(
    '/api/user/chat',
    'POST',
    { message, history },
    'Failed to communicate with the Assistant.'
  );
}

export const sendAssistantMessage = sendChatMessage;
