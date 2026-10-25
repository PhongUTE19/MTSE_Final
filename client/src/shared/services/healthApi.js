/**
 * Health API service communicating with backend health check endpoint.
 */

import { API_ENDPOINTS, APP_MESSAGES } from '../constants';
import { apiRequest } from './apiClient';

export function fetchHealth() {
  return apiRequest(API_ENDPOINTS.HEALTH, {}, APP_MESSAGES.API_ERROR.HEALTH_CHECK_FAILED);
}
