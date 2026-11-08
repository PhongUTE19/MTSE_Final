import { apiJsonRequest } from '../../shared/services/apiClient.js';

/**
 * Service client for /api/expense-assistant endpoints.
 */
export const expenseAssistantApi = {
  askExpenseAssistant: (message, history = [], options = {}) =>
    apiJsonRequest('/api/expense-assistant', 'POST', { message, history, ...options }),
  searchAgentTransactions: (message) =>
    apiJsonRequest('/api/expense-assistant/search', 'POST', { message }),
  createAgentProposal: (message) =>
    apiJsonRequest('/api/expense-assistant/proposals', 'POST', { message }),
};

export const {
  askExpenseAssistant,
  searchAgentTransactions,
  createAgentProposal,
} = expenseAssistantApi;
