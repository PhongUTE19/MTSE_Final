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
  const { user: workspaceUser } = useWorkspace();
  const resolvedUserId = userId ?? workspaceUser?.id ?? null;

  const [state, setState] = useState({
    drafts: [],
    loading: Boolean(autoFetch && resolvedUserId),
    error: null,
  });

  const controllerRef = useRef(null);
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
    const controller = controllerRef.current;
    return () => {
      controller.dispose();
    };
  }, []);

  const reloadDrafts = useCallback(
    () => controllerRef.current.reloadDrafts({ status }),
    [status]
  );

  const createDraft = useCallback(
    (input) => controllerRef.current.createDraft(input, { status }),
    [status]
  );

  const confirmDraft = useCallback(
    (id, reviewedFields) => controllerRef.current.confirmDraft(id, reviewedFields),
    []
  );

  const rejectDraft = useCallback(
    (id) => controllerRef.current.rejectDraft(id),
    []
  );

  const saveDraft = useCallback(
    (id, reviewedData) => controllerRef.current.saveDraft(id, reviewedData),
    []
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
    saveDraft,
    getPreviewUrl,
    releasePreviewUrl,
    setDrafts,
  };
}
