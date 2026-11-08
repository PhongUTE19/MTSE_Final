import { apiRequest, apiJsonRequest } from '../../shared/services/apiClient.js';

/**
 * API service for multimodal receipt upload, extraction, list, and preview.
 * Scoped to the Receipt domain under /api/receipt.
 * Review confirmation and rejection are handled centrally by transaction drafts.
 */
export const receiptApi = {
  upload: (file) => {
    const body = new FormData();
    body.append('receipt', file, file.name);
    return apiRequest('/api/receipt/upload', { method: 'POST', body });
  },
  listReceipts: () => apiRequest('/api/receipt'),
  previewReceipt: (id) => apiRequest(`/api/receipt/${id}/preview`),
  retryReceipt: (id) => apiJsonRequest(`/api/receipt/${id}/retry`, 'POST'),
};
