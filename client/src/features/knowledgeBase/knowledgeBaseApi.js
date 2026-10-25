/**
 * Knowledge API service communicating with backend knowledge base, chunks, and indexing endpoints.
 */

import { API_ENDPOINTS, APP_MESSAGES, HTTP_METHODS, PAGINATION } from '../../shared/constants';
import { apiRequest, apiJsonRequest } from '../../shared/services/apiClient';

export function fetchKnowledgeStatus() {
  return apiRequest(API_ENDPOINTS.ADMIN_STATUS, {}, APP_MESSAGES.API_ERROR.FETCH_STATUS);
}

// Backward-compatible alias for existing callers
export const fetchAdminStatus = fetchKnowledgeStatus;

/**
 * Fetches parsed markdown chunks with optional pagination and keyword search.
 * @param {Object} [options]
 * @param {number} [options.limit=10] - Number of items per page (10, 30, 50)
 * @param {number} [options.offset=0] - Offset index for pagination
 * @param {string} [options.search=''] - Keyword search term
 */
export function fetchChunks({
  limit = PAGINATION.DEFAULT_LIMIT,
  offset = PAGINATION.DEFAULT_OFFSET,
  search = '',
} = {}) {
  const params = new URLSearchParams();
  if (limit) params.set('limit', limit.toString());
  if (offset !== undefined) params.set('offset', offset.toString());
  if (search && search.trim()) params.set('q', search.trim());

  const qs = params.toString();
  const url = `${API_ENDPOINTS.ADMIN_CHUNKS}${qs ? `?${qs}` : ''}`;
  return apiRequest(url, {}, APP_MESSAGES.API_ERROR.FETCH_CHUNKS);
}

export function triggerIndexing() {
  return apiJsonRequest(API_ENDPOINTS.ADMIN_INDEX, HTTP_METHODS.POST, undefined, APP_MESSAGES.API_ERROR.TRIGGER_INDEX);
}
