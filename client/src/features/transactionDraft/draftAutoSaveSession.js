/**
 * Coordinates automatic draft creation on first user edit and serialized/debounced
 * IndexedDB updates for the Add Transaction popup.
 *
 * - Opening the popup without user edits never creates a draft.
 * - First user edit (field change or receipt image selection) creates exactly one draft.
 * - Subsequent edits update the same draft sequentially without out-of-order writes.
 */
export function createDraftAutoSaveSession({
  createDraft,
  updateDraft,
  debounceMs = 250,
  onError,
} = {}) {
  let draftId = null;
  let hasReceipt = false;
  let pendingPatch = null;
  let timer = null;
  let createPromise = null;
  let writeChain = Promise.resolve();

  function clearTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function enqueueWrite(fn) {
    writeChain = writeChain
      .catch(() => {})
      .then(fn)
      .catch((err) => {
        onError?.(err);
        throw err;
      });
    return writeChain;
  }

  function ensureDraftCreated(initialPayload) {
    if (draftId) {
      return Promise.resolve(draftId);
    }
    if (createPromise) {
      return createPromise;
    }
    createPromise = enqueueWrite(async () => {
      const created = await createDraft(initialPayload);
      draftId = created.id;
      return draftId;
    });
    return createPromise;
  }

  function scheduleUpdate(patch, { immediate = false } = {}) {
    pendingPatch = pendingPatch ? { ...pendingPatch, ...patch } : { ...patch };
    clearTimer();

    if (immediate) {
      return flush();
    }

    return new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        flush().then(resolve, reject);
      }, debounceMs);
    });
  }

  async function flush() {
    clearTimer();
    if (createPromise) {
      try {
        await createPromise;
      } catch {
        // Error already reported via enqueueWrite
      }
    }
    const patchToWrite = pendingPatch;
    pendingPatch = null;
    if (patchToWrite && draftId) {
      await enqueueWrite(() => updateDraft(draftId, patchToWrite));
    } else {
      await writeChain.catch(() => {});
    }
  }

  function recordFieldChange(formValues, options = {}) {
    if (!draftId && !createPromise) {
      return ensureDraftCreated({
        sourceType: hasReceipt ? 'receipt_extraction' : 'manual',
        originalData: { ...formValues },
        reviewedData: { ...formValues },
      });
    }
    return scheduleUpdate({ reviewedData: { ...formValues } }, options);
  }

  function recordReceiptSelection(file, formValues, options = {}) {
    hasReceipt = true;
    const fileMeta = file
      ? {
          filename: file.name || 'receipt.png',
          mimeType: file.type || 'image/png',
          size: file.size ?? null,
        }
      : null;

    if (!draftId && !createPromise) {
      return ensureDraftCreated({
        sourceType: 'receipt_extraction',
        receiptBlob: file || null,
        fileMeta,
        originalData: { ...formValues },
        reviewedData: { ...formValues },
      });
    }

    return scheduleUpdate(
      {
        sourceType: 'receipt_extraction',
        receiptBlob: file || null,
        fileMeta,
        reviewedData: { ...formValues },
      },
      { immediate: true, ...options }
    );
  }

  function recordOcrExtraction(
    extractedValues,
    { originalData, warnings, aiModel, promptVersion } = {}
  ) {
    const patch = {
      sourceType: 'receipt_extraction',
      reviewedData: { ...extractedValues },
      ...(originalData !== undefined ? { originalData: { ...originalData } } : {}),
      ...(warnings !== undefined ? { warnings: [...warnings] } : {}),
      ...(aiModel !== undefined ? { aiModel } : {}),
      ...(promptVersion !== undefined ? { promptVersion } : {}),
    };

    if (!draftId && !createPromise) {
      return ensureDraftCreated(patch);
    }
    return scheduleUpdate(patch, { immediate: true });
  }

  function reset() {
    clearTimer();
    draftId = null;
    hasReceipt = false;
    pendingPatch = null;
    createPromise = null;
  }

  return {
    recordFieldChange,
    recordReceiptSelection,
    recordOcrExtraction,
    flush,
    reset,
    getDraftId: () => draftId,
    hasDraft: () => Boolean(draftId || createPromise),
  };
}
