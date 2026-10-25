import { useState, useEffect, useCallback, useRef } from 'react';
import { useKnowledgeBase } from './useKnowledgeBase';
import { useDocuments } from '../documents/useDocuments';
import { useChunks } from '../documents/useChunks';
import { useToast } from '../../shared/contexts/ToastContext';

/**
 * Coordinates Knowledge Base dashboard data synchronization: documents, chunks,
 * vector status, and the multi-resource refresh coordinator.
 *
 * @param {object} [options]
 * @param {boolean} [options.isOffline=false] - Whether backend is currently offline
 * @param {Function} [options.onOpenDocumentPanel] - Callback to open document panel on new/edit
 * @returns {object} Knowledge Base dashboard operations and data states
 */
export function useKnowledgeBaseDashboard({ isOffline = false, onOpenDocumentPanel } = {}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);

  const chunksState = useChunks({ onError: toast.error });

  // Use a coordinator ref to prevent circular hook dependency while refreshing all panels
  const refreshCoordinatorRef = useRef(null);
  const handleRefresh = useCallback(async () => {
    if (refreshCoordinatorRef.current) {
      await refreshCoordinatorRef.current();
    }
  }, []);

  const kb = useKnowledgeBase({
    onRefresh: handleRefresh,
    onError: toast.error,
    onSuccess: toast.success,
  });

  const docs = useDocuments({
    onRefresh: handleRefresh,
    onError: toast.error,
    onSuccess: toast.success,
    onOpenDocumentPanel,
  });

  refreshCoordinatorRef.current = async () => {
    await Promise.all([
      kb.loadStatus(),
      docs.loadDocuments(),
      chunksState.refreshChunks(),
    ]);
  };

  // Initial load when online, and automatically restore normal fetching when connectivity returns
  useEffect(() => {
    if (isOffline) {
      setLoading(false);
      return;
    }

    const init = async () => {
      setLoading(true);
      try {
        await refreshCoordinatorRef.current();
      } catch {
        // Individual loaders already communicate user-facing errors via toast
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [isOffline]);

  return {
    loading,
    chunksState,
    kb,
    docs,
    handleRefresh,
  };
}
