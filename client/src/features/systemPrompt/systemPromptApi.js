/**
 * Prompts API service communicating with backend system prompt management endpoints.
 */

import { API_ENDPOINTS, APP_MESSAGES, HTTP_METHODS } from '../../shared/constants';
import { apiRequest, apiJsonRequest } from '../../shared/services/apiClient';

export function fetchSystemPrompt() {
  return apiRequest(API_ENDPOINTS.ADMIN_PROMPT, {}, APP_MESSAGES.API_ERROR.FETCH_PROMPT);
}

export function updateSystemPrompt(prompt) {
  return apiJsonRequest(
    API_ENDPOINTS.ADMIN_PROMPT,
    HTTP_METHODS.PUT,
    { prompt },
    APP_MESSAGES.API_ERROR.UPDATE_PROMPT
  );
}

export function resetSystemPrompt() {
  return apiJsonRequest(
    API_ENDPOINTS.ADMIN_PROMPT_RESET,
    HTTP_METHODS.POST,
    undefined,
    APP_MESSAGES.API_ERROR.RESET_PROMPT
  );
}
