import { useState, useCallback } from 'react';
import { fetchAdminStatus, triggerIndexing } from './knowledgeBaseApi';
import { APP_MESSAGES } from '../../shared/constants';

/**
 * Custom hook to manage knowledge base status overview and re-indexing workflow.
 *
 * @param {Object} options
 * @param {Function} [options.onRefresh] - Callback to refresh related data after indexing completes
 * @param {Function} [options.onError] - Callback to report error feedback
 * @param {Function} [options.onSuccess] - Callback to report success feedback
 * @param {Function} [options.clearFeedback] - Callback to clear existing feedback
 */
export function useKnowledgeBase({ onRefresh, onError, onSuccess, clearFeedback } = {}) {
  const [status, setStatus] = useState(null);
  const [indexing, setIndexing] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const statusData = await fetchAdminStatus();
      setStatus(statusData);
      return statusData;
    } catch (err) {
      if (onError) {
        onError(err.message || APP_MESSAGES.ERROR.LOAD_OVERVIEW_FAILED);
      }
      throw err;
    }
  }, [onError]);

  const handleTriggerIndexing = useCallback(async () => {
    if (clearFeedback) clearFeedback();
    setIndexing(true);
    try {
      const result = await triggerIndexing();
      if (onSuccess) {
        onSuccess(result?.message || APP_MESSAGES.SUCCESS.REINDEX_COMPLETED);
      }
      if (onRefresh) {
        await onRefresh();
      }
    } catch (err) {
      if (onError) {
        onError(err.message || APP_MESSAGES.ERROR.REINDEX_FAILED);
      }
    } finally {
      setIndexing(false);
    }
  }, [clearFeedback, onRefresh, onError, onSuccess]);

  return {
    status,
    setStatus,
    indexing,
    loadStatus,
    handleTriggerIndexing,
  };
}
