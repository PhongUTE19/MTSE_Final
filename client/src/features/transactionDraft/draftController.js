import { draftStorage, isReceiptDraft } from './draftStorage.js';
import { createPreviewUrlManager } from './previewUrlManager.js';
import { receiptApi } from '../receipt/receiptApi.js';
import { transactionApi } from '../transaction/transactionApi.js';

/**
 * Framework-free controller for user-scoped local transaction draft state and
 * preview Object URL lifecycle. Used by `useTransactionDrafts` and directly unit-testable.
 */
export function createTransactionDraftController({
  storage = draftStorage,
  previewManager = createPreviewUrlManager(),
  confirmReceiptApi = receiptApi.confirm,
  createTransactionApi = transactionApi.create,
  onStateChange,
} = {}) {
  let activeUserId = null;
  let requestSeq = 0;
  const inFlightConfirmations = new Map();
  let state = {
    drafts: [],
    loading: false,
    error: null,
  };

  function setState(patch) {
    state = typeof patch === 'function' ? patch(state) : { ...state, ...patch };
    onStateChange?.(state);
  }

  function requireUserId(explicitUserId) {
    const uid = explicitUserId ?? activeUserId;
    if (typeof uid !== 'string' || !uid.trim()) {
      throw new Error('Authentication is required to manage transaction drafts.');
    }
    return uid.trim();
  }

  function setUserId(nextUserId) {
    const normalized = typeof nextUserId === 'string' && nextUserId.trim() ? nextUserId.trim() : null;
    if (normalized === activeUserId) return;
    activeUserId = normalized;
    requestSeq += 1;
    previewManager.revokeAll();
    setState({ drafts: [], loading: false, error: null });
  }

  async function reloadDrafts({ status = 'pending_review' } = {}) {
    if (!activeUserId) {
      setState({ drafts: [], loading: false, error: null });
      return [];
    }

    const targetUserId = activeUserId;
    const seq = ++requestSeq;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const records = await storage.listDrafts(targetUserId, { status });
      if (seq !== requestSeq || activeUserId !== targetUserId) {
        return [];
      }
      setState({ drafts: records, loading: false, error: null });
      return records;
    } catch (err) {
      if (seq !== requestSeq || activeUserId !== targetUserId) {
        return [];
      }
      const message = err?.message || 'Failed to load transaction drafts.';
      setState((prev) => ({ ...prev, loading: false, error: message }));
      return [];
    }
  }

  async function createDraft(input, { status = 'pending_review' } = {}) {
    const targetUserId = requireUserId();
    const seq = requestSeq;
    const created = await storage.createDraft(targetUserId, input);
    if (seq === requestSeq && activeUserId === targetUserId) {
      if (!status || created.status === status) {
        setState((prev) => ({
          ...prev,
          drafts: [created, ...prev.drafts.filter((d) => d.id !== created.id)],
        }));
      }
    }
    return created;
  }

  async function updateDraft(id, patch) {
    const targetUserId = requireUserId();
    const seq = requestSeq;
    const updated = await storage.updateDraft(targetUserId, id, patch);
    if (seq === requestSeq && activeUserId === targetUserId) {
      setState((prev) => ({
        ...prev,
        drafts: prev.drafts.map((d) => (d.id === id ? { ...d, ...updated } : d)),
      }));
    }
    return updated;
  }

  async function saveDraft(id, reviewedData) {
    return updateDraft(id, { reviewedData });
  }

  async function rejectDraft(id) {
    const targetUserId = requireUserId();
    const seq = requestSeq;
    const deleted = await storage.deleteDraft(targetUserId, id);
    previewManager.revokeDraft(id);
    if (seq === requestSeq && activeUserId === targetUserId) {
      setState((prev) => ({
        ...prev,
        drafts: prev.drafts.filter((d) => d.id !== id),
      }));
    }
    return { discarded: deleted, id };
  }

  /**
   * Confirms a local draft against the authoritative backend API:
   * - `receipt_extraction`: sends original Blob + reviewed fields to POST /api/receipt/confirm
   * - `assistant_proposal` / `manual`: sends deterministic draftId + reviewed fields to POST /api/transaction
   * Only removes the local IndexedDB draft and revokes preview URLs after backend success.
   */
  async function confirmDraft(id, reviewedFields = {}, options = {}) {
    const targetUserId = requireUserId();
    const lockKey = `${targetUserId}:${id}`;
    const existingFlight = inFlightConfirmations.get(lockKey);
    if (existingFlight) {
      return existingFlight;
    }

    const execute = async () => {
      const seq = requestSeq;
      const draft = await storage.getDraft(targetUserId, id);
      if (!draft) {
        throw new Error('Transaction draft not found or has expired.');
      }

      try {
        let confirmedResult;
        if (isReceiptDraft(draft)) {
          if (typeof Blob !== 'undefined' && !(draft.receiptBlob instanceof Blob)) {
            throw new Error('Receipt image is missing or corrupted. Please discard and re-upload the receipt.');
          }
          const confirmFn = options.confirmReceiptApi || confirmReceiptApi;
          const res = await confirmFn({
            draftId: draft.id,
            file: draft.receiptBlob,
            filename: draft.fileMeta?.filename || 'receipt.png',
            transaction: reviewedFields,
            sha256: draft.fileMeta?.sha256,
            extraction: draft.originalData,
            warnings: draft.warnings,
            aiModel: draft.aiModel ?? null,
            promptVersion: draft.promptVersion ?? null,
          });
          confirmedResult = {
            receipt: res?.receipt || null,
            transaction: res?.transaction || null,
            idempotent: Boolean(res?.idempotent),
          };
        } else {
          const createTxFn = options.createTransactionApi || createTransactionApi;
          const res = await createTxFn({
            id: draft.id,
            ...reviewedFields,
          });
          confirmedResult = {
            transaction: res?.transaction || res,
          };
        }

        // Only remove local draft and revoke Object URLs after confirmed backend success.
        await storage.deleteDraft(targetUserId, id);
        previewManager.revokeDraft(id);
        if (seq === requestSeq && activeUserId === targetUserId) {
          setState((prev) => ({
            ...prev,
            drafts: prev.drafts.filter((d) => d.id !== id),
          }));
        }
        return confirmedResult;
      } catch (err) {
        // Preserve local draft, Blob, and reviewed edits so the user can safely retry with the same draftId.
        try {
          const updated = await storage.updateDraft(targetUserId, id, { reviewedData: reviewedFields });
          if (seq === requestSeq && activeUserId === targetUserId) {
            setState((prev) => ({
              ...prev,
              drafts: prev.drafts.map((d) => (d.id === id ? { ...d, ...updated } : d)),
            }));
          }
        } catch {
          // Best-effort preservation of reviewed edits
        }
        throw err;
      }
    };

    const flight = execute().finally(() => {
      inFlightConfirmations.delete(lockKey);
    });
    inFlightConfirmations.set(lockKey, flight);
    return flight;
  }

  function getPreviewUrl(draft, consumerId = 'default') {
    if (!draft?.id || !draft?.receiptBlob) return null;
    return previewManager.acquire(draft.id, draft.receiptBlob, consumerId);
  }

  function releasePreviewUrl(draftId, consumerId = 'default') {
    return previewManager.release(draftId, consumerId);
  }

  function dispose() {
    requestSeq += 1;
    previewManager.revokeAll();
  }

  return {
    getState: () => state,
    setUserId,
    reloadDrafts,
    createDraft,
    updateDraft,
    saveDraft,
    rejectDraft,
    confirmDraft,
    getPreviewUrl,
    releasePreviewUrl,
    dispose,
  };
}
