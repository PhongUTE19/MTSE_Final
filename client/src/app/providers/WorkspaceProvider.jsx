import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

const DEFAULT_WORKSPACE_CONTEXT = {
  user: null,
  onSignOut: null,
  health: null,
  checkHealth: null,
  isOffline: false,
  transactionsVersion: 0,
  notifyTransactionsChanged: () => {},
  receiptsVersion: 0,
  notifyReceiptsChanged: () => {},
  draftsVersion: 0,
  notifyDraftsChanged: () => {},
  assistantOpen: false,
  setAssistantOpen: () => {},
};

export const WorkspaceContext = createContext(DEFAULT_WORKSPACE_CONTEXT);

/**
 * WorkspaceProvider coordinates workspace-level user session, service health,
 * and cross-view synchronization notifications (e.g., when the assistant creates
 * transactions or confirms receipts).
 */
export function WorkspaceProvider({
  user = null,
  onSignOut,
  health,
  checkHealth,
  assistantOpen: controlledAssistantOpen,
  setAssistantOpen: controlledSetAssistantOpen,
  children,
}) {
  const [uncontrolledAssistantOpen, setUncontrolledAssistantOpen] = useState(false);
  const assistantOpen =
    controlledAssistantOpen !== undefined
      ? controlledAssistantOpen
      : uncontrolledAssistantOpen;
  const setAssistantOpen =
    controlledSetAssistantOpen || setUncontrolledAssistantOpen;

  const [transactionsVersion, setTransactionsVersion] = useState(0);
  const [receiptsVersion, setReceiptsVersion] = useState(0);
  const [draftsVersion, setDraftsVersion] = useState(0);

  const notifyTransactionsChanged = useCallback(() => {
    setTransactionsVersion((v) => v + 1);
  }, []);

  const notifyReceiptsChanged = useCallback(() => {
    setReceiptsVersion((v) => v + 1);
  }, []);

  const notifyDraftsChanged = useCallback(() => {
    setDraftsVersion((v) => v + 1);
  }, []);

  const isOffline = Boolean(health?.error);

  const value = useMemo(
    () => ({
      user,
      onSignOut,
      health,
      checkHealth,
      isOffline,
      transactionsVersion,
      notifyTransactionsChanged,
      receiptsVersion,
      notifyReceiptsChanged,
      draftsVersion,
      notifyDraftsChanged,
      assistantOpen,
      setAssistantOpen,
    }),
    [
      user,
      onSignOut,
      health,
      checkHealth,
      isOffline,
      transactionsVersion,
      notifyTransactionsChanged,
      receiptsVersion,
      notifyReceiptsChanged,
      draftsVersion,
      notifyDraftsChanged,
      assistantOpen,
      setAssistantOpen,
    ]
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

/**
 * Hook to consume current Workspace context.
 * Returns safe defaults if invoked outside a WorkspaceProvider.
 */
export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  return context || DEFAULT_WORKSPACE_CONTEXT;
}

export default WorkspaceProvider;
