/**
 * Read-only Documents API service communicating with backend document inspection endpoints.
 */

import { API_ENDPOINTS, APP_MESSAGES } from '../../shared/constants';
import { apiRequest } from '../../shared/services/apiClient';

export function fetchDocuments() {
  return apiRequest(API_ENDPOINTS.ADMIN_DOCUMENTS, {}, APP_MESSAGES.API_ERROR.FETCH_DOCS);
}

export function fetchDocumentContent(filename) {
  const url = `${API_ENDPOINTS.ADMIN_DOCUMENTS}/${encodeURIComponent(filename)}`;
  return apiRequest(url, {}, APP_MESSAGES.API_ERROR.FETCH_DOC_CONTENT);
}
