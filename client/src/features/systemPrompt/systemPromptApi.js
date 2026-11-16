/**
 * Read-only System Prompt API service.
 */

import { API_ENDPOINTS, APP_MESSAGES } from '../../shared/constants';
import { apiRequest } from '../../shared/services/apiClient';

export function fetchSystemPrompt() {
  return apiRequest(API_ENDPOINTS.ADMIN_SYSTEM_PROMPT, {}, APP_MESSAGES.API_ERROR.FETCH_PROMPT);
}
