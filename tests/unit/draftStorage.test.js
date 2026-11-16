import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  draftStorage,
  createDraft,
  listDrafts,
  getDraft,
  updateDraft,
  deleteDraft,
  clearUserDrafts,
  openDraftDatabase,
  isIndexedDBAvailable,
  resetMemoryDraftStorageForTests,
} from '../../client/src/features/transactionDraft/draftStorage.js';
import { createPreviewUrlManager } from '../../client/src/features/transactionDraft/previewUrlManager.js';
import { createTransactionDraftController } from '../../client/src/features/transactionDraft/draftController.js';

/**
 * Minimal faithful fake IndexedDB implementation for testing real IDB code paths
 * (onupgradeneeded, objectStore, by_user_id index, transactions, and error/abort paths).
 */
function createFakeIndexedDB({ failOpen = false, blockOpen = false, failTx = false, abortTx = false } = {}) {
  const databases = new Map();

  function makeRequest(executor) {
    const req = {
      result: undefined,
      error: null,
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
      onblocked: null,
    };
    queueMicrotask(() => executor(req));
    return req;
  }

  const fakeIDBKeyRange = {
    only(value) {
      return { __only: value };
    },
  };

  const fakeIndexedDB = {
    open(name, version) {
      return makeRequest((req) => {
        if (blockOpen) {
          req.onblocked?.({ target: req });
          return;
        }
        if (failOpen) {
          req.error = new Error('Simulated IDB open failure');
          req.onerror?.({ target: req });
          return;
        }

        let dbState = databases.get(name);
        const needsUpgrade = !dbState || dbState.version < version;
        if (!dbState) {
          dbState = { name, version, stores: new Map() };
          databases.set(name, dbState);
        } else {
          dbState.version = version;
        }

        const db = {
          name,
          version,
          objectStoreNames: {
            contains: (storeName) => dbState.stores.has(storeName),
          },
          createObjectStore(storeName, opts = {}) {
            const storeData = {
              keyPath: opts.keyPath || 'id',
              records: new Map(),
              indexes: new Map(),
            };
            dbState.stores.set(storeName, storeData);
            return {
              indexNames: { contains: (idx) => storeData.indexes.has(idx) },
              createIndex(idxName, keyPath) {
                storeData.indexes.set(idxName, { keyPath });
              },
            };
          },
          transaction(storeName, _mode) {
            const storeData = dbState.stores.get(storeName);
            if (!storeData) throw new Error(`Object store ${storeName} not found`);

            const tx = {
              error: null,
              oncomplete: null,
              onerror: null,
              onabort: null,
              objectStore() {
                return {
                  indexNames: { contains: (idx) => storeData.indexes.has(idx) },
                  add(record) {
                    return makeRequest((r) => {
                      if (failTx) {
                        tx.error = new Error('Simulated tx error');
                        tx.onerror?.({ target: tx });
                        return;
                      }
                      if (abortTx) {
                        tx.error = new Error('Simulated tx abort');
                        tx.onabort?.({ target: tx });
                        return;
                      }
                      const key = record[storeData.keyPath];
                      if (storeData.records.has(key)) {
                        r.error = new Error('ConstraintError');
                        r.onerror?.({ target: r });
                        return;
                      }
                      storeData.records.set(key, record);
                      r.result = key;
                      r.onsuccess?.({ target: r });
                      queueMicrotask(() => tx.oncomplete?.());
                    });
                  },
                  put(record) {
                    return makeRequest((r) => {
                      const key = record[storeData.keyPath];
                      storeData.records.set(key, record);
                      r.result = key;
                      r.onsuccess?.({ target: r });
                      queueMicrotask(() => tx.oncomplete?.());
                    });
                  },
                  get(key) {
                    return makeRequest((r) => {
                      r.result = storeData.records.get(key);
                      r.onsuccess?.({ target: r });
                      queueMicrotask(() => tx.oncomplete?.());
                    });
                  },
                  delete(key) {
                    return makeRequest((r) => {
                      storeData.records.delete(key);
                      r.result = undefined;
                      r.onsuccess?.({ target: r });
                      queueMicrotask(() => tx.oncomplete?.());
                    });
                  },
                  index(idxName) {
                    const idx = storeData.indexes.get(idxName);
                    if (!idx) throw new Error(`Index ${idxName} not found`);
                    return {
                      getAll(range) {
                        return makeRequest((r) => {
                          const target = range?.__only;
                          const matched = Array.from(storeData.records.values()).filter(
                            (rec) => rec && rec[idx.keyPath] === target
                          );
                          r.result = matched;
                          r.onsuccess?.({ target: r });
                          queueMicrotask(() => tx.oncomplete?.());
                        });
                      },
                      getAllKeys(range) {
                        return makeRequest((r) => {
                          const target = range?.__only;
                          const keys = Array.from(storeData.records.entries())
                            .filter(([, rec]) => rec && rec[idx.keyPath] === target)
                            .map(([k]) => k);
                          r.result = keys;
                          r.onsuccess?.({ target: r });
                          queueMicrotask(() => tx.oncomplete?.());
                        });
                      },
                    };
                  },
                };
              },
            };
            return tx;
          },
          close() {},
        };

        if (needsUpgrade) {
          req.result = db;
          req.onupgradeneeded?.({ target: { result: db, transaction: { objectStore: () => ({ indexNames: { contains: () => false }, createIndex() {} }) } } });
        }
        req.result = db;
        req.onsuccess?.({ target: req });
      });
    },
  };

  return { fakeIndexedDB, fakeIDBKeyRange, databases };
}

describe('P2-T05: Frontend IndexedDB Draft Store & Lifecycle Suite', () => {
  const originalIndexedDB = globalThis.indexedDB;
  const originalIDBKeyRange = globalThis.IDBKeyRange;

  beforeEach(() => {
    resetMemoryDraftStorageForTests();
    delete globalThis.indexedDB;
    delete globalThis.IDBKeyRange;
  });

  afterEach(() => {
    resetMemoryDraftStorageForTests();
    if (originalIndexedDB !== undefined) {
      globalThis.indexedDB = originalIndexedDB;
    } else {
      delete globalThis.indexedDB;
    }
    if (originalIDBKeyRange !== undefined) {
      globalThis.IDBKeyRange = originalIDBKeyRange;
    } else {
      delete globalThis.IDBKeyRange;
    }
  });

  describe('1. In-Memory Fallback & Validation', () => {
    it('performs full CRUD and user-scoped listing when IndexedDB is unavailable', async () => {
      assert.equal(isIndexedDBAvailable(), false);

      const created = await createDraft('user-a', {
        sourceType: 'receipt_extraction',
        originalData: { amount: 45000, category: 'Food', merchant: 'Highlands' },
        warnings: ['Low confidence on note'],
        fileMeta: { name: 'receipt.png', type: 'image/png', size: 1024 },
      });

      assert.ok(created.id);
      assert.equal(created.userId, 'user-a');
      assert.equal(created.status, 'pending_review');
      assert.equal(created.originalData.amount, 45000);
      assert.equal(created.reviewedData.amount, 45000);

      const listed = await listDrafts('user-a');
      assert.equal(listed.length, 1);
      assert.equal(listed[0].id, created.id);

      const fetched = await getDraft('user-a', created.id);
      assert.equal(fetched.id, created.id);

      const updated = await updateDraft('user-a', created.id, {
        reviewedData: { amount: 50000, note: 'Iced coffee' },
      });
      assert.equal(updated.reviewedData.amount, 50000);
      assert.equal(updated.reviewedData.merchant, 'Highlands');

      const deleted = await deleteDraft('user-a', created.id);
      assert.equal(deleted, true);
      assert.equal(await getDraft('user-a', created.id), null);
      assert.deepEqual(await listDrafts('user-a'), []);
    });

    it('rejects missing or whitespace userId on all storage operations', async () => {
      for (const badUserId of [undefined, null, '', '   ', 123]) {
        await assert.rejects(() => createDraft(badUserId, { originalData: {} }), /userId is required/i);
        await assert.rejects(() => listDrafts(badUserId), /userId is required/i);
        await assert.rejects(() => getDraft(badUserId, 'd-1'), /userId is required/i);
        await assert.rejects(() => updateDraft(badUserId, 'd-1', { reviewedData: {} }), /userId is required/i);
        await assert.rejects(() => deleteDraft(badUserId, 'd-1'), /userId is required/i);
        await assert.rejects(() => clearUserDrafts(badUserId), /userId is required/i);
      }
    });

    it('enforces strict user isolation across get, list, update, delete, and clear', async () => {
      const draftA = await createDraft('user-a', {
        originalData: { amount: 25000, merchant: 'Pho 24' },
      });
      const draftB = await createDraft('user-b', {
        originalData: { amount: 80000, merchant: 'Lotte' },
      });

      assert.deepEqual((await listDrafts('user-a')).map((d) => d.id), [draftA.id]);
      assert.deepEqual((await listDrafts('user-b')).map((d) => d.id), [draftB.id]);

      // User B cannot get, update, or delete User A's draft by ID
      assert.equal(await getDraft('user-b', draftA.id), null);
      await assert.rejects(
        () => updateDraft('user-b', draftA.id, { reviewedData: { amount: 1 } }),
        /not found/i
      );
      assert.equal(await deleteDraft('user-b', draftA.id), false);
      assert.ok(await getDraft('user-a', draftA.id), 'User A draft must still exist');

      // Clearing User A drafts must leave User B intact
      const cleared = await clearUserDrafts('user-a');
      assert.equal(cleared, 1);
      assert.deepEqual(await listDrafts('user-a'), []);
      assert.deepEqual((await listDrafts('user-b')).map((d) => d.id), [draftB.id]);
    });
  });

  describe('2. IndexedDB Storage, Blob Round-Trip, Malformed Records & Failures', () => {
    it('persists receiptBlob in IndexedDB across simulated reloads without touching localStorage', async () => {
      const { fakeIndexedDB, fakeIDBKeyRange, databases } = createFakeIndexedDB();
      globalThis.indexedDB = fakeIndexedDB;
      globalThis.IDBKeyRange = fakeIDBKeyRange;

      let localStorageTouched = false;
      const originalLocalStorage = globalThis.localStorage;
      globalThis.localStorage = {
        setItem() { localStorageTouched = true; },
        getItem() { return null; },
      };

      try {
        const blob = new Blob(['fake-image-bytes'], { type: 'image/png' });
        const created = await createDraft('user-a', {
          sourceType: 'receipt_extraction',
          originalData: { amount: 120000, category: 'Food' },
          receiptBlob: blob,
          fileMeta: { name: 'lunch.png', type: 'image/png', size: blob.size },
        });

        // Inject a malformed record directly into the IDB store to test safe filtering
        const storeRecords = databases.get(draftStorage.DB_NAME).stores.get(draftStorage.STORE_NAME).records;
        storeRecords.set('corrupt-1', { id: 'corrupt-1', userId: '' });
        storeRecords.set('corrupt-2', null);

        // Simulate page reload by querying IndexedDB directly again
        const reloadedList = await listDrafts('user-a');
        assert.equal(reloadedList.length, 1);
        assert.equal(reloadedList[0].id, created.id);
        assert.ok(reloadedList[0].receiptBlob instanceof Blob);
        assert.equal(await reloadedList[0].receiptBlob.text(), 'fake-image-bytes');

        assert.equal(await getDraft('user-a', 'corrupt-1'), null);
        assert.equal(localStorageTouched, false, 'Blob data must never be serialized into localStorage');
      } finally {
        if (originalLocalStorage !== undefined) {
          globalThis.localStorage = originalLocalStorage;
        } else {
          delete globalThis.localStorage;
        }
      }
    });

    it('handles IndexedDB initialization errors, blocked upgrades, and transaction failures', async () => {
      globalThis.IDBKeyRange = { only: (v) => ({ __only: v }) };

      globalThis.indexedDB = createFakeIndexedDB({ failOpen: true }).fakeIndexedDB;
      await assert.rejects(() => openDraftDatabase(), /Failed to open draft database/);

      globalThis.indexedDB = createFakeIndexedDB({ blockOpen: true }).fakeIndexedDB;
      await assert.rejects(() => openDraftDatabase(), /blocked/i);

      globalThis.indexedDB = createFakeIndexedDB({ failTx: true }).fakeIndexedDB;
      await assert.rejects(() => createDraft('user-a', { originalData: {} }), /transaction failed/i);

      globalThis.indexedDB = createFakeIndexedDB({ abortTx: true }).fakeIndexedDB;
      await assert.rejects(() => createDraft('user-a', { originalData: {} }), /aborted/i);
    });
  });

  describe('3. Controller User-Switch Isolation, Stale Async Guard & Object URL Lifecycle', () => {
    it('prevents late async responses from User A from overwriting User B state and revokes URLs', async () => {
      const createdUrls = [];
      const revokedUrls = [];
      let nextUrlId = 1;
      const fakeUrls = {
        createObjectURL: () => {
          const url = `blob:test/${nextUrlId++}`;
          createdUrls.push(url);
          return url;
        },
        revokeObjectURL: (url) => revokedUrls.push(url),
      };

      let resolveUserAList;
      const delayedStorage = {
        ...draftStorage,
        listDrafts(userId) {
          if (userId === 'user-a') {
            return new Promise((resolve) => {
              resolveUserAList = resolve;
            });
          }
          return Promise.resolve([
            {
              id: 'draft-b-1',
              userId: 'user-b',
              status: 'pending_review',
              receiptBlob: new Blob(['b-bytes'], { type: 'image/png' }),
            },
          ]);
        },
      };

      const previewManager = createPreviewUrlManager(fakeUrls);
      const controller = createTransactionDraftController({
        storage: delayedStorage,
        previewManager,
      });

      // Start loading User A drafts (remains pending)
      controller.setUserId('user-a');
      const userAPromise = controller.reloadDrafts();

      // Switch to User B before User A resolves
      controller.setUserId('user-b');
      await controller.reloadDrafts();

      // Now resolve User A's late async response
      resolveUserAList([{ id: 'draft-a-1', userId: 'user-a', status: 'pending_review' }]);
      await userAPromise;

      // User B's state must NOT be overwritten by User A's late response
      assert.deepEqual(
        controller.getState().drafts.map((d) => d.id),
        ['draft-b-1']
      );

      // Recreate preview URL from stored Blob for User B
      const bDraft = controller.getState().drafts[0];
      const url1 = controller.getPreviewUrl(bDraft, 'panel-1');
      const url2 = controller.getPreviewUrl(bDraft, 'panel-2');
      assert.equal(url1, url2, 'Shared consumers reuse the same Object URL');
      assert.equal(createdUrls.length, 1);

      // Releasing one consumer must NOT revoke while another active consumer still needs it
      assert.equal(controller.releasePreviewUrl('draft-b-1', 'panel-1'), false);
      assert.equal(revokedUrls.length, 0);

      // Releasing the final consumer revokes it
      assert.equal(controller.releasePreviewUrl('draft-b-1', 'panel-2'), true);
      assert.deepEqual(revokedUrls, [url1]);

      // Switching to Guest (null) clears drafts and rejects mutations
      controller.getPreviewUrl(bDraft, 'panel-1');
      controller.setUserId(null);
      assert.deepEqual(controller.getState().drafts, []);
      assert.equal(previewManager.getActiveCount(), 0);
      await assert.rejects(() => controller.createDraft({ originalData: {} }), /Authentication is required/i);

      controller.dispose();
    });

    it('revokes preview URLs on Blob replacement, discard (rejectDraft), and confirmation (confirmDraft)', async () => {
      const revokedUrls = [];
      let nextUrlId = 1;
      const fakeUrls = {
        createObjectURL: () => `blob:test/${nextUrlId++}`,
        revokeObjectURL: (url) => revokedUrls.push(url),
      };

      const previewManager = createPreviewUrlManager(fakeUrls);
      const controller = createTransactionDraftController({
        previewManager,
        createTransactionApi: async (payload) => ({
          transaction: { id: payload.id, ...payload },
        }),
      });
      controller.setUserId('user-a');

      const blob1 = new Blob(['img-1'], { type: 'image/png' });
      const blob2 = new Blob(['img-2'], { type: 'image/png' });
      const d1 = await controller.createDraft({ originalData: { amount: 10000 }, receiptBlob: blob1 });
      const d2 = await controller.createDraft({ originalData: { amount: 20000 }, receiptBlob: blob1 });

      const url1 = controller.getPreviewUrl(d1, 'viewer');
      const replacedUrl = previewManager.acquire(d1.id, blob2, 'viewer');
      assert.notEqual(replacedUrl, url1);
      assert.ok(revokedUrls.includes(url1), 'Replacing Blob revokes previous Object URL');

      // Discard revokes URL and removes from storage
      await controller.rejectDraft(d1.id);
      assert.ok(revokedUrls.includes(replacedUrl), 'Discarding draft revokes Object URL');
      assert.equal(await getDraft('user-a', d1.id), null);

      // Confirm revokes URL and removes from pending drafts list
      const url2 = controller.getPreviewUrl(d2, 'viewer');
      await controller.confirmDraft(d2.id, { amount: 22000 });
      assert.ok(revokedUrls.includes(url2), 'Confirming draft revokes Object URL');
      assert.deepEqual(controller.getState().drafts, []);
    });
  });
});
