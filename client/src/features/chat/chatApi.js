import { API_ENDPOINTS } from '../../shared/constants/index.js';
import {
  apiJsonRequest,
  apiRequest,
  authenticatedFetch,
  handleUnauthorized,
} from '../../shared/services/apiClient.js';
import { parseSSEStream } from './sseParser.js';

/**
 * Sends a message to the central chat assistant orchestrator endpoint.
 */
export function sendChatMessage(message, history = [], options = {}) {
  return apiJsonRequest(
    API_ENDPOINTS.CHAT_ASSISTANT,
    'POST',
    {
      message,
      history,
      ...(options?.conversationId ? { conversationId: options.conversationId } : {}),
    },
    'Failed to communicate with the Assistant.'
  );
}

/**
 * Streams a chat assistant response over POST /api/chat-assistant/stream using fetch + ReadableStream.
 */
export async function sendChatMessageStream(
  message,
  history = [],
  { conversationId, requestId, userMessageId, retryOfMessageId, signal, onEvent } = {}
) {
  const response = await authenticatedFetch(`${API_ENDPOINTS.CHAT_ASSISTANT}/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    signal,
    body: JSON.stringify({
      message,
      history,
      ...(conversationId ? { conversationId } : {}),
      ...(requestId ? { requestId } : {}),
      ...(userMessageId ? { userMessageId } : {}),
      ...(retryOfMessageId ? { retryOfMessageId } : {}),
    }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      await handleUnauthorized();
    }
    let errorMessage = 'Failed to stream response from the Assistant.';
    try {
      const errData = await response.json();
      if (errData?.error) errorMessage = errData.error;
    } catch {
      // Ignore non-JSON error body
    }
    const error = new Error(errorMessage);
    error.status = response.status;
    error.statusCode = response.status;
    throw error;
  }

  await parseSSEStream(response.body, { onEvent, signal });
}

export const chatHistoryApi = {
  listConversations: () =>
    apiRequest('/api/chat-history', { method: 'GET' }, 'Failed to load chat history.'),
  createConversation: ({ id, title } = {}) =>
    apiJsonRequest('/api/chat-history', 'POST', { ...(id ? { id } : {}), ...(title ? { title } : {}) }, 'Failed to create conversation.'),
  getConversation: (id) =>
    apiRequest(`/api/chat-history/${encodeURIComponent(id)}`, { method: 'GET' }, 'Failed to load conversation.'),
  updateConversation: (id, { title }) =>
    apiJsonRequest(`/api/chat-history/${encodeURIComponent(id)}`, 'PATCH', { title }, 'Failed to update conversation.'),
  deleteConversation: (id) =>
    apiRequest(`/api/chat-history/${encodeURIComponent(id)}`, { method: 'DELETE' }, 'Failed to delete conversation.'),
  appendMessage: (conversationId, payload) =>
    apiJsonRequest(
      `/api/chat-history/${encodeURIComponent(conversationId)}/messages`,
      'POST',
      payload,
      'Failed to save message.'
    ),
};
