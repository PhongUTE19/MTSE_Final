const DRAFT_DB_NAME = 'spendwise_transaction_drafts';
const DRAFT_DB_VERSION = 1;
const DRAFT_STORE_NAME = 'drafts';
const DRAFT_USER_INDEX = 'by_user_id';

/**
 * Isolated in-memory fallback store used only when IndexedDB is unavailable
 * (e.g., Node/JSDOM unit tests). Does not persist across page refreshes.
 */
const memoryDrafts = new Map();

function getIndexedDBFactory() {
  if (typeof window !== 'undefined' && window.indexedDB) {
    return window.indexedDB;
  }
  if (typeof globalThis !== 'undefined' && globalThis.indexedDB) {
    return globalThis.indexedDB;
  }
  return null;
}

export function isIndexedDBAvailable() {
  return Boolean(getIndexedDBFactory());
}

export function assertValidUserId(userId) {
  if (typeof userId !== 'string' || !userId.trim()) {
    throw new Error('Authenticated userId is required for draft storage.');
  }
  return userId.trim();
}

export function isReceiptDraft(draft) {
  if (!draft || typeof draft !== 'object') return false;
  if (draft.sourceType === 'receipt_extraction' || draft.sourceType === 'receipt') {
    return true;
  }
  if (!draft.sourceType) {
    return Boolean(draft.receiptBlob || draft.fileMeta);
  }
  return false;
}

export function getDraftSourceLabel(draft) {
  return isReceiptDraft(draft) ? 'Receipt' : 'Manual';
}

export function isValidDraftRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return false;
  }
  if (typeof record.id !== 'string' || !record.id.trim()) {
    return false;
  }
  if (typeof record.userId !== 'string' || !record.userId.trim()) {
    return false;
  }
  return true;
}

function generateDraftId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `draft_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeNewDraft(userId, input = {}) {
  const validUserId = assertValidUserId(userId);
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Draft payload must be an object.');
  }
  const now = new Date().toISOString();
  const receiptBlob = input.receiptBlob ?? null;
  if (receiptBlob !== null && typeof Blob !== 'undefined' && !(receiptBlob instanceof Blob)) {
    throw new Error('receiptBlob must be a Blob or null.');
  }

  return {
    id: typeof input.id === 'string' && input.id.trim() ? input.id.trim() : generateDraftId(),
    userId: validUserId,
    sourceType: typeof input.sourceType === 'string' && input.sourceType.trim() ? input.sourceType : 'manual',
    sourceRef: input.sourceRef ?? null,
    originalData: input.originalData && typeof input.originalData === 'object' ? { ...input.originalData } : {},
    reviewedData:
      input.reviewedData && typeof input.reviewedData === 'object'
        ? { ...input.reviewedData }
        : input.originalData && typeof input.originalData === 'object'
          ? { ...input.originalData }
          : {},
    warnings: Array.isArray(input.warnings) ? [...input.warnings] : [],
    receiptBlob,
    fileMeta: input.fileMeta && typeof input.fileMeta === 'object' ? { ...input.fileMeta } : null,
    aiModel: input.aiModel ?? null,
    promptVersion: input.promptVersion ?? null,
    status: typeof input.status === 'string' && input.status.trim() ? input.status : 'pending_review',
    transactionId: input.transactionId ?? null,
    createdAt: typeof input.createdAt === 'string' && input.createdAt ? input.createdAt : now,
    updatedAt: typeof input.updatedAt === 'string' && input.updatedAt ? input.updatedAt : now,
  };
}

function sortDraftsNewestFirst(drafts) {
  return [...drafts].sort((a, b) => {
    const timeA = Date.parse(a.updatedAt || a.createdAt || '') || 0;
    const timeB = Date.parse(b.updatedAt || b.createdAt || '') || 0;
    return timeB - timeA;
  });
}

/**
 * Opens the IndexedDB database for SpendWise transaction drafts.
 *
 * @returns {Promise<IDBDatabase>}
 */
export function openDraftDatabase() {
  const idb = getIndexedDBFactory();
  if (!idb) {
    return Promise.reject(new Error('IndexedDB is not available in this environment.'));
  }

  return new Promise((resolve, reject) => {
    let request;
    try {
      request = idb.open(DRAFT_DB_NAME, DRAFT_DB_VERSION);
    } catch (err) {
      reject(new Error(`Failed to open draft database: ${err?.message || 'Unknown error'}`));
      return;
    }

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      let store;
      if (!db.objectStoreNames.contains(DRAFT_STORE_NAME)) {
        store = db.createObjectStore(DRAFT_STORE_NAME, { keyPath: 'id' });
      } else {
        store = event.target.transaction.objectStore(DRAFT_STORE_NAME);
      }
      if (!store.indexNames.contains(DRAFT_USER_INDEX)) {
        store.createIndex(DRAFT_USER_INDEX, 'userId', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      const err = event.target?.error;
      reject(new Error(`Failed to open draft database: ${err?.message || 'Database error'}`));
    };

    request.onblocked = () => {
      reject(new Error('Draft database upgrade was blocked by another open tab.'));
    };
  });
}

async function runIdbTransaction(mode, executor) {
  const db = await openDraftDatabase();
  try {
    return await new Promise((resolve, reject) => {
      let settled = false;
      const fail = (err) => {
        if (!settled) {
          settled = true;
          reject(err instanceof Error ? err : new Error(String(err || 'IndexedDB transaction failed')));
        }
      };

      let tx;
      try {
        tx = db.transaction(DRAFT_STORE_NAME, mode);
      } catch (err) {
        fail(new Error(`Failed to start draft transaction: ${err?.message || 'Unknown error'}`));
        return;
      }

      const store = tx.objectStore(DRAFT_STORE_NAME);
      let resultValue;

      tx.oncomplete = () => {
        if (!settled) {
          settled = true;
          resolve(resultValue);
        }
      };
      tx.onerror = (event) => {
        const err = event.target?.error || tx.error;
        fail(new Error(`Draft transaction failed: ${err?.message || 'Unknown error'}`));
      };
      tx.onabort = (event) => {
        const err = event.target?.error || tx.error;
        fail(new Error(`Draft transaction aborted: ${err?.message || 'Aborted'}`));
      };

      executor(store, (val) => {
        resultValue = val;
      }, fail);
    });
  } finally {
    if (typeof db?.close === 'function') {
      db.close();
    }
  }
}

export async function createDraft(userId, input) {
  const record = normalizeNewDraft(userId, input);

  if (!isIndexedDBAvailable()) {
    memoryDrafts.set(record.id, record);
    return record;
  }

  return runIdbTransaction('readwrite', (store, setResult, fail) => {
    const req = store.add(record);
    req.onsuccess = () => setResult(record);
    req.onerror = (event) => fail(event.target?.error || new Error('Failed to create draft.'));
  });
}

export async function listDrafts(userId, { status } = {}) {
  const validUserId = assertValidUserId(userId);

  let records;
  if (!isIndexedDBAvailable()) {
    records = Array.from(memoryDrafts.values()).filter(
      (item) => isValidDraftRecord(item) && item.userId === validUserId
    );
  } else {
    records = await runIdbTransaction('readonly', (store, setResult, fail) => {
      const index = store.index(DRAFT_USER_INDEX);
      const req = index.getAll(IDBKeyRange.only(validUserId));
      req.onsuccess = (event) => {
        const raw = Array.isArray(event.target.result) ? event.target.result : [];
        const valid = raw.filter((item) => isValidDraftRecord(item) && item.userId === validUserId);
        setResult(valid);
      };
      req.onerror = (event) => fail(event.target?.error || new Error('Failed to list drafts.'));
    });
  }

  const filtered = status ? records.filter((item) => item.status === status) : records;
  return sortDraftsNewestFirst(filtered);
}

export async function getDraft(userId, id) {
  const validUserId = assertValidUserId(userId);
  if (typeof id !== 'string' || !id.trim()) {
    return null;
  }
  const targetId = id.trim();

  if (!isIndexedDBAvailable()) {
    const record = memoryDrafts.get(targetId);
    if (!isValidDraftRecord(record) || record.userId !== validUserId) {
      return null;
    }
    return record;
  }

  return runIdbTransaction('readonly', (store, setResult, fail) => {
    const req = store.get(targetId);
    req.onsuccess = (event) => {
      const record = event.target.result;
      if (!isValidDraftRecord(record) || record.userId !== validUserId) {
        setResult(null);
        return;
      }
      setResult(record);
    };
    req.onerror = (event) => fail(event.target?.error || new Error('Failed to retrieve draft.'));
  });
}

function applyDraftPatch(existing, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new Error('Draft update payload must be an object.');
  }

  const nextReceiptBlob =
    patch.receiptBlob !== undefined ? patch.receiptBlob : existing.receiptBlob;
  if (
    nextReceiptBlob !== null &&
    nextReceiptBlob !== undefined &&
    typeof Blob !== 'undefined' &&
    !(nextReceiptBlob instanceof Blob)
  ) {
    throw new Error('receiptBlob must be a Blob or null.');
  }

  const nextReviewedData =
    patch.reviewedData !== undefined
      ? { ...(existing.reviewedData || {}), ...patch.reviewedData }
      : existing.reviewedData;

  return {
    ...existing,
    id: existing.id,
    userId: existing.userId,
    createdAt: existing.createdAt,
    sourceType:
      typeof patch.sourceType === 'string' && patch.sourceType.trim()
        ? patch.sourceType.trim()
        : existing.sourceType,
    sourceRef: patch.sourceRef !== undefined ? patch.sourceRef : existing.sourceRef,
    originalData:
      patch.originalData !== undefined && patch.originalData && typeof patch.originalData === 'object'
        ? { ...patch.originalData }
        : existing.originalData,
    reviewedData: nextReviewedData,
    warnings: patch.warnings !== undefined ? [...patch.warnings] : existing.warnings,
    receiptBlob: nextReceiptBlob ?? null,
    fileMeta: patch.fileMeta !== undefined ? patch.fileMeta : existing.fileMeta,
    aiModel: patch.aiModel !== undefined ? patch.aiModel : existing.aiModel,
    promptVersion: patch.promptVersion !== undefined ? patch.promptVersion : existing.promptVersion,
    status: typeof patch.status === 'string' && patch.status.trim() ? patch.status : existing.status,
    transactionId: patch.transactionId !== undefined ? patch.transactionId : existing.transactionId,
    updatedAt: new Date().toISOString(),
  };
}

export async function updateDraft(userId, id, patch) {
  const validUserId = assertValidUserId(userId);
  if (typeof id !== 'string' || !id.trim()) {
    throw new Error('Draft id is required.');
  }
  const targetId = id.trim();

  if (!isIndexedDBAvailable()) {
    const existing = memoryDrafts.get(targetId);
    if (!isValidDraftRecord(existing) || existing.userId !== validUserId) {
      throw new Error('Transaction draft not found.');
    }
    const updated = applyDraftPatch(existing, patch);
    memoryDrafts.set(targetId, updated);
    return updated;
  }

  return runIdbTransaction('readwrite', (store, setResult, fail) => {
    const getReq = store.get(targetId);
    getReq.onsuccess = (event) => {
      const existing = event.target.result;
      if (!isValidDraftRecord(existing) || existing.userId !== validUserId) {
        fail(new Error('Transaction draft not found.'));
        return;
      }
      let updated;
      try {
        updated = applyDraftPatch(existing, patch);
      } catch (err) {
        fail(err);
        return;
      }
      const putReq = store.put(updated);
      putReq.onsuccess = () => setResult(updated);
      putReq.onerror = (putErrEvent) =>
        fail(putErrEvent.target?.error || new Error('Failed to update draft.'));
    };
    getReq.onerror = (event) => fail(event.target?.error || new Error('Failed to read draft for update.'));
  });
}

export async function deleteDraft(userId, id) {
  const validUserId = assertValidUserId(userId);
  if (typeof id !== 'string' || !id.trim()) {
    return false;
  }
  const targetId = id.trim();

  if (!isIndexedDBAvailable()) {
    const existing = memoryDrafts.get(targetId);
    if (!isValidDraftRecord(existing) || existing.userId !== validUserId) {
      return false;
    }
    memoryDrafts.delete(targetId);
    return true;
  }

  return runIdbTransaction('readwrite', (store, setResult, fail) => {
    const getReq = store.get(targetId);
    getReq.onsuccess = (event) => {
      const existing = event.target.result;
      if (!isValidDraftRecord(existing) || existing.userId !== validUserId) {
        setResult(false);
        return;
      }
      const delReq = store.delete(targetId);
      delReq.onsuccess = () => setResult(true);
      delReq.onerror = (delErrEvent) =>
        fail(delErrEvent.target?.error || new Error('Failed to delete draft.'));
    };
    getReq.onerror = (event) => fail(event.target?.error || new Error('Failed to read draft for deletion.'));
  });
}

export async function clearUserDrafts(userId) {
  const validUserId = assertValidUserId(userId);

  if (!isIndexedDBAvailable()) {
    let removed = 0;
    for (const [id, record] of memoryDrafts.entries()) {
      if (isValidDraftRecord(record) && record.userId === validUserId) {
        memoryDrafts.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  return runIdbTransaction('readwrite', (store, setResult, fail) => {
    const index = store.index(DRAFT_USER_INDEX);
    const req = index.getAllKeys(IDBKeyRange.only(validUserId));
    req.onsuccess = (event) => {
      const keys = Array.isArray(event.target.result) ? event.target.result : [];
      if (keys.length === 0) {
        setResult(0);
        return;
      }
      let remaining = keys.length;
      for (const key of keys) {
        const delReq = store.delete(key);
        delReq.onsuccess = () => {
          remaining -= 1;
          if (remaining === 0) {
            setResult(keys.length);
          }
        };
        delReq.onerror = (delErrEvent) =>
          fail(delErrEvent.target?.error || new Error('Failed to clear user drafts.'));
      }
    };
    req.onerror = (event) => fail(event.target?.error || new Error('Failed to enumerate user drafts.'));
  });
}

export function resetMemoryDraftStorageForTests() {
  memoryDrafts.clear();
}

export const draftStorage = {
  DB_NAME: DRAFT_DB_NAME,
  DB_VERSION: DRAFT_DB_VERSION,
  STORE_NAME: DRAFT_STORE_NAME,
  USER_INDEX: DRAFT_USER_INDEX,
  isIndexedDBAvailable,
  openDraftDatabase,
  createDraft,
  listDrafts,
  getDraft,
  updateDraft,
  deleteDraft,
  clearUserDrafts,
};
