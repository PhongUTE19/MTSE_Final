import { getAccessToken, signOut } from './supabaseAuth';

const request = async (url, options = {}) => {
  const token = await getAccessToken();
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(url, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      await signOut();
      window.dispatchEvent(new CustomEvent('spendwise:unauthorized'));
    }
    throw new Error(body.error || 'Request failed.');
  }
  return body;
};
export const expenseApi = {
  // Bỏ query rỗng vì backend enum chỉ nhận giá trị filter hợp lệ.
  list: (query) => {
    const populatedQuery = Object.fromEntries(
      Object.entries(query).filter(([, value]) => value !== '' && value !== undefined && value !== null),
    );
    return request(`/api/transactions?${new URLSearchParams(populatedQuery)}`);
  },
  create: (data) =>
    request('/api/transactions', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) =>
    request(`/api/transactions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id) =>
    request(`/api/transactions/${id}`, { method: 'DELETE' }),
  upload: (file) => {
    const body = new FormData();
    body.append('receipt', file, file.name);
    return request('/api/receipts/upload', { method: 'POST', body });
  },
  listReceipts: () => request('/api/receipts'),
  previewReceipt: (id) => request(`/api/receipts/${id}/preview`),
  retryReceipt: (id) => request(`/api/receipts/${id}/retry`, { method: 'POST' }),
  confirmReceipt: (id, finalTransaction) =>
    request(`/api/receipts/${id}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ finalTransaction }),
    }),
  deleteReceipt: (id) => request(`/api/receipts/${id}`, { method: 'DELETE' }),
  askExpenseAssistant: (message, history = []) =>
    request('/api/expense-agent/assistant', {
      method: 'POST',
      body: JSON.stringify({ message, history }),
    }),
  searchAgentTransactions: (message) =>
    request('/api/expense-agent/search', {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
  createAgentProposal: (message) =>
    request('/api/expense-agent/create-proposal', {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
  confirmAgentProposal: (id, transaction) =>
    request(`/api/expense-agent/proposals/${id}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ transaction }),
    }),
  cancelAgentProposal: (id) =>
    request(`/api/expense-agent/proposals/${id}`, { method: 'DELETE' }),
};
