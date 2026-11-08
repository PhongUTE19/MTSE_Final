import { apiRequest } from '../../shared/services/apiClient.js';

export const transactionDraftApi = {
  /**
   * Lists drafts for the current user, optionally filtered by status.
   *
   * @param {{ status?: 'pending_review'|'confirmed'|'rejected' }} [options]
   * @returns {Promise<Array<object>>}
   */
  async list({ status = 'pending_review' } = {}) {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    const data = await apiRequest(
      `/api/transaction-draft${query}`,
      { method: 'GET' },
      'Failed to fetch transaction drafts.'
    );
    return data.drafts || [];
  },

  /**
   * Retrieves a single transaction draft by ID.
   *
   * @param {string} id
   * @returns {Promise<object>}
   */
  async get(id) {
    const data = await apiRequest(
      `/api/transaction-draft/${id}`,
      { method: 'GET' },
      'Failed to fetch transaction draft.'
    );
    return data.draft;
  },

  /**
   * Updates user-reviewed data on a pending draft.
   *
   * @param {string} id
   * @param {object} reviewedData
   * @returns {Promise<object>}
   */
  async patch(id, reviewedData) {
    const data = await apiRequest(
      `/api/transaction-draft/${id}`,
      {
        method: 'PATCH',
        body: JSON.stringify(reviewedData),
      },
      'Failed to update transaction draft.'
    );
    return data.draft;
  },

  /**
   * Confirms a transaction draft atomically and produces a ledger transaction.
   * Idempotent: returns existing transaction if already confirmed.
   *
   * @param {string} id
   * @param {object} [reviewedFields]
   * @returns {Promise<{ draft: object, transaction: object }>}
   */
  async confirm(id, reviewedFields = {}) {
    const data = await apiRequest(
      `/api/transaction-draft/${id}/confirm`,
      {
        method: 'POST',
        body: JSON.stringify(reviewedFields),
      },
      'Failed to confirm transaction draft.'
    );
    return data;
  },

  /**
   * Rejects a transaction draft.
   *
   * @param {string} id
   * @returns {Promise<{ draft: object }>}
   */
  async reject(id) {
    const data = await apiRequest(
      `/api/transaction-draft/${id}/reject`,
      { method: 'POST' },
      'Failed to reject transaction draft.'
    );
    return data;
  },
};
