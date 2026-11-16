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
  confirm: ({ draftId, file, filename, transaction, sha256, extraction, warnings, aiModel, promptVersion }) => {
    const body = new FormData();
    const resolvedName = filename || file?.name || 'receipt.png';
    body.append('receipt', file, resolvedName);
    body.append('draftId', draftId);
    body.append('transaction', JSON.stringify(transaction));
    if (sha256) body.append('sha256', sha256);
    if (extraction) body.append('extraction', JSON.stringify(extraction));
    if (warnings) body.append('warnings', JSON.stringify(warnings));
    if (aiModel) body.append('aiModel', aiModel);
    if (promptVersion) body.append('promptVersion', promptVersion);
    return apiRequest('/api/receipt/confirm', { method: 'POST', body });
  },
  listReceipts: () => apiRequest('/api/receipt'),
  previewReceipt: (id) => apiRequest(`/api/receipt/${id}/preview`),
  retryReceipt: (id) => apiJsonRequest(`/api/receipt/${id}/retry`, 'POST'),
};
