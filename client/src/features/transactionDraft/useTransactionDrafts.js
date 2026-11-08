import { useState, useEffect, useCallback } from 'react';
import { transactionDraftApi } from './transactionDraftApi.js';

/**
 * Hook to manage transaction draft lifecycle: fetching pending drafts,
 * updating reviewed fields, confirming, and rejecting drafts.
 *
 * @param {object} [options]
 * @param {boolean} [options.autoFetch=true]
 * @param {'pending_review'|'confirmed'|'rejected'} [options.status='pending_review']
 */
export function useTransactionDrafts({ autoFetch = true, status = 'pending_review' } = {}) {
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(autoFetch);
  const [error, setError] = useState(null);

  const reloadDrafts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await transactionDraftApi.list({ status });
      setDrafts(data);
      return data;
    } catch (err) {
      const message = err?.message || 'Failed to load transaction drafts.';
      setError(message);
      return [];
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    if (autoFetch) {
      reloadDrafts();
    }
  }, [autoFetch, reloadDrafts]);

  const confirmDraft = useCallback(async (id, reviewedFields) => {
    const result = await transactionDraftApi.confirm(id, reviewedFields);
    setDrafts((prev) => prev.filter((d) => d.id !== id));
    return result;
  }, []);

  const rejectDraft = useCallback(async (id) => {
    const result = await transactionDraftApi.reject(id);
    setDrafts((prev) => prev.filter((d) => d.id !== id));
    return result;
  }, []);

  const saveDraft = useCallback(async (id, reviewedData) => {
    const updated = await transactionDraftApi.patch(id, reviewedData);
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...updated } : d)));
    return updated;
  }, []);

  return {
    drafts,
    loading,
    error,
    reloadDrafts,
    confirmDraft,
    rejectDraft,
    saveDraft,
    setDrafts,
  };
}
