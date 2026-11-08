/**
 * Documents API service communicating with backend document management endpoints.
 */

import { API_ENDPOINTS, APP_MESSAGES, HTTP_METHODS } from '../../shared/constants';
import { apiRequest, apiJsonRequest } from '../../shared/services/apiClient';

export function fetchDocuments() {
  return apiRequest(API_ENDPOINTS.ADMIN_DOCUMENTS, {}, APP_MESSAGES.API_ERROR.FETCH_DOCS);
}

export function fetchDocumentContent(filename) {
  const url = `${API_ENDPOINTS.ADMIN_DOCUMENTS}/${encodeURIComponent(filename)}`;
  return apiRequest(url, {}, APP_MESSAGES.API_ERROR.FETCH_DOC_CONTENT);
}

export function saveDocument(filename, content, overwrite = false) {
  return apiJsonRequest(
    API_ENDPOINTS.ADMIN_DOCUMENTS,
    HTTP_METHODS.POST,
    { filename, content, overwrite },
    APP_MESSAGES.API_ERROR.SAVE_DOC
  );
}

export function updateDocument(filename, content) {
  const url = `${API_ENDPOINTS.ADMIN_DOCUMENTS}/${encodeURIComponent(filename)}`;
  return apiJsonRequest(url, HTTP_METHODS.PUT, { content }, APP_MESSAGES.API_ERROR.UPDATE_DOC);
}

export function deleteDocument(filename) {
  const url = `${API_ENDPOINTS.ADMIN_DOCUMENTS}/${encodeURIComponent(filename)}`;
  return apiJsonRequest(url, HTTP_METHODS.DELETE, undefined, APP_MESSAGES.API_ERROR.DELETE_DOC);
}
