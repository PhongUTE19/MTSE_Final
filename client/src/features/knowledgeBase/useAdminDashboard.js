import { useState, useEffect, useCallback, useRef } from 'react';
import { useDrawer } from './useDrawer';
import { useKnowledgeBase } from './useKnowledgeBase';
import { useDocuments } from '../documents/useDocuments';
import { useChunks } from '../documents/useChunks';
import { useToast } from '../../shared/contexts/ToastContext';
import { ADMIN_PANELS, ADMIN_TABS } from '../../shared/constants';

/**
 * Custom hook to coordinate admin dashboard state, panel drawer, tab navigation,
 * and multi-resource refresh coordinator.
 *
 * @returns {object} Admin dashboard operations, tabs, and panel states
 */
export function useAdminDashboard({ isOffline = false, defaultTab = ADMIN_TABS.KNOWLEDGE } = {}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(defaultTab);

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  const drawer = useDrawer(ADMIN_PANELS.DOCUMENTS);
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
    onOpenDocumentPanel: () => drawer.openDrawer(ADMIN_PANELS.DOCUMENTS),
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
    activeTab,
    setActiveTab,
    drawer,
    chunksState,
    kb,
    docs,
    handleRefresh,
  };
}
