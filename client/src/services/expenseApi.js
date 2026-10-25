import { apiRequest, apiJsonRequest } from './apiClient.js';

export const expenseApi = {
  // Bỏ query rỗng vì backend enum chỉ nhận giá trị filter hợp lệ.
  list: (query = {}) => {
    const populatedQuery = Object.fromEntries(
      Object.entries(query).filter(([, value]) => value !== '' && value !== undefined && value !== null),
    );
    const qs = new URLSearchParams(populatedQuery).toString();
    return apiRequest(`/api/transactions${qs ? `?${qs}` : ''}`);
  },
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
