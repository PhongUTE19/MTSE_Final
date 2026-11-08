import { apiRequest, apiJsonRequest } from '../../shared/services/apiClient.js';
import { toQueryString } from '../../shared/utils/collectionUtils.js';

/**
 * Service client for /api/transaction endpoints.
 */
export const transactionApi = {
  // Exclude empty queries because backend enum only accepts valid filter values.
  list: (query = {}) =>
    apiRequest(`/api/transaction${toQueryString(query)}`),
  get: (id) =>
    apiRequest(`/api/transaction/${id}`),
  create: (data) =>
    apiJsonRequest('/api/transaction', 'POST', data),
  update: (id, data) =>
    apiJsonRequest(`/api/transaction/${id}`, 'PUT', data),
  remove: (id) =>
    apiJsonRequest(`/api/transaction/${id}`, 'DELETE'),
};
