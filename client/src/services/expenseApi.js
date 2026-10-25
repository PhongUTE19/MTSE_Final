import { apiRequest, apiJsonRequest } from './apiClient.js';
import { toQueryString } from '../utils/collectionUtils.js';

export const expenseApi = {
  // Exclude empty queries because backend enum only accepts valid filter values.
  list: (query = {}) =>
    apiRequest(`/api/transactions${toQueryString(query)}`),
  create: (data) =>
    apiJsonRequest('/api/transactions', 'POST', data),
  update: (id, data) =>
    apiJsonRequest(`/api/transactions/${id}`, 'PUT', data),
  remove: (id) =>
    apiJsonRequest(`/api/transactions/${id}`, 'DELETE'),
  upload: (file) => {
    const body = new FormData();
    body.append('receipt', file, file.name);
    return apiRequest('/api/receipts/upload', { method: 'POST', body });
  },
  listReceipts: () => apiRequest('/api/receipts'),
  previewReceipt: (id) => apiRequest(`/api/receipts/${id}/preview`),
  retryReceipt: (id) => apiJsonRequest(`/api/receipts/${id}/retry`, 'POST'),
  confirmReceipt: (id, finalTransaction) =>
    apiJsonRequest(`/api/receipts/${id}/confirm`, 'POST', { finalTransaction }),
  deleteReceipt: (id) => apiJsonRequest(`/api/receipts/${id}`, 'DELETE'),
  askExpenseAssistant: (message, history = []) =>
    apiJsonRequest('/api/expense-agent/assistant', 'POST', { message, history }),
  searchAgentTransactions: (message) =>
    apiJsonRequest('/api/expense-agent/search', 'POST', { message }),
  createAgentProposal: (message) =>
    apiJsonRequest('/api/expense-agent/create-proposal', 'POST', { message }),
  confirmAgentProposal: (id, transaction) =>
    apiJsonRequest(`/api/expense-agent/proposals/${id}/confirm`, 'POST', { transaction }),
  cancelAgentProposal: (id) =>
    apiJsonRequest(`/api/expense-agent/proposals/${id}`, 'DELETE'),
};
