import { useState, useEffect, useCallback, useRef } from 'react';
import { useWorkspace } from '../../app/providers/index.js';
import { createTransactionDraftController } from './draftController.js';

export { createTransactionDraftController };

/**
 * Hook to manage user-scoped local transaction drafts in IndexedDB.
 *
 * @param {object} [options]
 * @param {string} [options.userId] - Explicit user ID override (defaults to authenticated Workspace user)
 * @param {boolean} [options.autoFetch=true]
 * @param {'pending_review'|'confirmed'|'rejected'} [options.status='pending_review']
 */
export function useTransactionDrafts({
  userId,
  autoFetch = true,
  status = 'pending_review',
} = {}) {
  const { user: workspaceUser, draftsVersion = 0, notifyDraftsChanged } = useWorkspace();
  const resolvedUserId = userId ?? workspaceUser?.id ?? null;

  const [state, setState] = useState({
    drafts: [],
    loading: Boolean(autoFetch && resolvedUserId),
    error: null,
  });

  const controllerRef = useRef(null);
  const lastDraftsVersionRef = useRef(draftsVersion);
  const skipNextVersionSyncRef = useRef(false);

  if (!controllerRef.current) {
    controllerRef.current = createTransactionDraftController({
      onStateChange: setState,
    });
  }

  useEffect(() => {
    const controller = controllerRef.current;
    controller.setUserId(resolvedUserId);
    if (autoFetch && resolvedUserId) {
      controller.reloadDrafts({ status });
    }
  }, [resolvedUserId, autoFetch, status]);

  useEffect(() => {
    if (draftsVersion !== lastDraftsVersionRef.current) {
      lastDraftsVersionRef.current = draftsVersion;
      if (skipNextVersionSyncRef.current) {
        skipNextVersionSyncRef.current = false;
        return;
      }
      if (autoFetch && resolvedUserId) {
        controllerRef.current.reloadDrafts({ status });
      }
    }
  }, [draftsVersion, autoFetch, resolvedUserId, status]);

  useEffect(() => {
    const controller = controllerRef.current;
    return () => {
      controller.dispose();
    };
  }, []);

  const notifyLocalMutation = useCallback(() => {
    skipNextVersionSyncRef.current = true;
    notifyDraftsChanged?.();
  }, [notifyDraftsChanged]);

  const reloadDrafts = useCallback(
    () => controllerRef.current.reloadDrafts({ status }),
    [status]
  );

  const createDraft = useCallback(
    async (input) => {
      const created = await controllerRef.current.createDraft(input, { status });
      notifyLocalMutation();
      return created;
    },
    [status, notifyLocalMutation]
  );

  const confirmDraft = useCallback(
    async (id, reviewedFields) => {
      const result = await controllerRef.current.confirmDraft(id, reviewedFields);
      notifyLocalMutation();
      return result;
    },
    [notifyLocalMutation]
  );

  const rejectDraft = useCallback(
    async (id) => {
      const result = await controllerRef.current.rejectDraft(id);
      notifyLocalMutation();
      return result;
    },
    [notifyLocalMutation]
  );

  const updateDraft = useCallback(
    async (id, patch) => {
      const updated = await controllerRef.current.updateDraft(id, patch);
      notifyLocalMutation();
      return updated;
    },
    [notifyLocalMutation]
  );

  const saveDraft = useCallback(
    async (id, reviewedData) => {
      const updated = await controllerRef.current.saveDraft(id, reviewedData);
      notifyLocalMutation();
      return updated;
    },
    [notifyLocalMutation]
  );

  const getPreviewUrl = useCallback(
    (draft, consumerId) => controllerRef.current.getPreviewUrl(draft, consumerId),
    []
  );

  const releasePreviewUrl = useCallback(
    (draftId, consumerId) => controllerRef.current.releasePreviewUrl(draftId, consumerId),
    []
  );

  const setDrafts = useCallback((updater) => {
    setState((prev) => ({
      ...prev,
      drafts: typeof updater === 'function' ? updater(prev.drafts) : updater,
    }));
  }, []);

  return {
    drafts: state.drafts,
    loading: state.loading,
    error: state.error,
    reloadDrafts,
    createDraft,
    confirmDraft,
    rejectDraft,
    updateDraft,
    saveDraft,
    getPreviewUrl,
    releasePreviewUrl,
    setDrafts,
  };
}
