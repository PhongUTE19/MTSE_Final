import { useEffect, useRef, useState } from 'react';
import { MAX_RECEIPT_SIZE_BYTES, RECEIPT_ACCEPTED_TYPES } from '../../shared/transactions/expenseConstants.js';

/**
 * Framework-free receipt upload / review lifecycle shared by ScanReceiptView and
 * ExpenseAssistant: file validation, object-URL ownership, stale-upload
 * protection, and confirm/discard sequencing.
 *
 * It is separate from the hook so it can be unit tested without a renderer.
 *
 * Options are read through `getOptions()` on every call so callers can pass
 * fresh closures each render:
 * - upload(file) / confirm(id, payload) / discard(id): API calls
 * - validationMessage: error shown for a rejected file
 * - onError(message): error sink ('' clears)
 * - onUploadStart() / onUploadSettled(): bracket the in-flight upload
 * - onUploadFailed(): awaited after an upload error was reported
 * - onConfirmSaved(payload) / onDiscardSaved(): awaited after the API call,
 *   before the review is closed
 * - onConfirmClosed(payload) / onDiscardClosed(): awaited after it is closed
 * - reportActionErrors: when true confirm/discard errors go to onError,
 *   otherwise they are rethrown so the review UI can show them
 *
 * @param {() => object} getOptions
 * @param {{ setReceipt: Function, setProcessing: Function, urls?: object }} bindings
 */
export function createReceiptUploadController(getOptions, { setReceipt, setProcessing, urls = URL }) {
  let actionId = 0;
  let currentReceipt = null;

  function showReceipt(receipt) {
    currentReceipt = receipt;
    setReceipt(receipt);
  }

  function revokeLocalPreview(receipt) {
    if (receipt?.localPreview && receipt.previewUrl) urls.revokeObjectURL(receipt.previewUrl);
  }

  function closeReceipt() {
    actionId++;
    revokeLocalPreview(currentReceipt);
    showReceipt(null);
  }

  function isValidReceiptFile(file) {
    return RECEIPT_ACCEPTED_TYPES.includes(file.type) && file.size <= MAX_RECEIPT_SIZE_BYTES;
  }

  async function uploadFile(file) {
    const options = getOptions();
    if (!file) return;
    if (!isValidReceiptFile(file)) {
      options.onError?.(options.validationMessage);
      return;
    }

    const uploadId = ++actionId;
    const previewUrl = urls.createObjectURL(file);
    let keepPreview = false;
    options.onError?.('');
    setProcessing({ file, previewUrl });
    options.onUploadStart?.();

    try {
      const result = await options.upload(file);
      if (uploadId !== actionId) return; // superseded; the finally block revokes the preview
      const receipt = result?.receipt;
      const draft = receipt?.draft || (receipt?.extraction ? { id: receipt.id, originalData: receipt.extraction } : null);
      if (!receipt || !draft) {
        options.onError?.('Receipt was uploaded, but no draft was created. Please retry.');
        await options.onUploadFailed?.();
        return;
      }
      keepPreview = true;
      showReceipt({
        id: receipt.id,
        file,
        previewUrl,
        localPreview: true,
        draft: receipt.draft || draft,
      });
    } catch (requestError) {
      if (uploadId === actionId) {
        options.onError?.(requestError.message);
        await options.onUploadFailed?.();
      }
    } finally {
      if (uploadId === actionId) {
        setProcessing(null);
        options.onUploadSettled?.();
      }
      if (!keepPreview) urls.revokeObjectURL(previewUrl);
    }
  }

  // Runs confirm/discard so errors follow the caller's chosen policy.
  async function runAction(work) {
    const { reportActionErrors, onError } = getOptions();
    if (!reportActionErrors) return work();
    try {
      return await work();
    } catch (requestError) {
      onError?.(requestError.message);
      return undefined;
    }
  }

  async function confirmPendingReceipt(payload) {
    const receipt = currentReceipt;
    if (!receipt) return;
    actionId++; // an in-flight upload must not replace the receipt being saved
    await runAction(async () => {
      const options = getOptions();
      await options.confirm(receipt.id, payload);
      await options.onConfirmSaved?.(payload);
      closeReceipt();
      await options.onConfirmClosed?.(payload);
    });
  }

  async function discardPendingReceipt() {
    const receipt = currentReceipt;
    if (!receipt) return;
    actionId++;
    await runAction(async () => {
      const options = getOptions();
      await options.discard(receipt.id);
      await options.onDiscardSaved?.();
      closeReceipt();
      await options.onDiscardClosed?.();
    });
  }

  // Unmount: invalidate in-flight work and release the preview we own.
  function dispose() {
    actionId++;
    revokeLocalPreview(currentReceipt);
    currentReceipt = null;
  }

  return {
    uploadFile,
    confirmPendingReceipt,
    discardPendingReceipt,
    closeReceipt,
    showReceipt,
    dispose,
    /** Starts a caller-managed async action (e.g. resuming a pending review). */
    beginAction: () => ++actionId,
    isCurrentAction: (id) => id === actionId,
  };
}

/**
 * React binding for the receipt upload controller.
 *
 * @param {object} options - See createReceiptUploadController
 * @returns {object} `receipt`, `processing` state plus the controller actions
 */
export function useReceiptUpload(options) {
  const [receipt, setReceipt] = useState(null);
  const [processing, setProcessing] = useState(null);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const controllerRef = useRef(null);
  if (!controllerRef.current) {
    controllerRef.current = createReceiptUploadController(() => optionsRef.current, {
      setReceipt,
      setProcessing,
    });
  }
  const controller = controllerRef.current;

  useEffect(() => () => controller.dispose(), [controller]);

  return { receipt, processing, ...controller };
}
