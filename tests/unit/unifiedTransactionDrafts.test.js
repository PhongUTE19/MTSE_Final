import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  draftStorage,
  getDraftSourceLabel,
  isReceiptDraft,
  resetMemoryDraftStorageForTests,
} from '../../client/src/features/transactionDraft/draftStorage.js';
import { createTransactionDraftController } from '../../client/src/features/transactionDraft/draftController.js';
import { createDraftAutoSaveSession } from '../../client/src/features/transactionDraft/draftAutoSaveSession.js';
import { WORKSPACE_NAV_ITEMS } from '../../client/src/layouts/sidebarConfig.js';
import { APP_ROUTES } from '../../client/src/shared/constants/routes.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readClientFile = (relPath) => fs.readFileSync(path.join(ROOT, 'client', 'src', relPath), 'utf8');

describe('Unified Transaction Draft Management & Add Transaction Suite', () => {
  beforeEach(() => {
    resetMemoryDraftStorageForTests();
  });

  describe('1. Automatic First-Edit Draft Creation & Auto-Save Persistence', () => {
    it('does not create a draft when opened without user edits, creates exactly one on first edit, and updates the same draft on subsequent edits', async () => {
      const controller = createTransactionDraftController();
      controller.setUserId('user-1');

      const session = createDraftAutoSaveSession({
        createDraft: (input) => controller.createDraft(input),
        updateDraft: (id, patch) => controller.updateDraft(id, patch),
        debounceMs: 10,
      });

      // Opening popup without editing creates zero drafts
      assert.equal(session.getDraftId(), null);
      assert.equal(session.hasDraft(), false);
      assert.equal((await controller.reloadDrafts()).length, 0);

      // First user edit with partial/incomplete values (empty amount, empty merchant) creates 1 draft
      await session.recordFieldChange({
        type: 'expense',
        amount: '',
        date: '2026-11-18',
        category: 'Food & dining',
        merchant: 'Coffee',
        note: '',
      });

      const firstDraftId = session.getDraftId();
      assert.ok(firstDraftId);
      let drafts = await controller.reloadDrafts();
      assert.equal(drafts.length, 1);
      assert.equal(getDraftSourceLabel(drafts[0]), 'Manual');
      assert.equal(drafts[0].reviewedData.merchant, 'Coffee');
      assert.equal(drafts[0].reviewedData.amount, '');

      // Rapid subsequent edits update the exact same draft
      session.recordFieldChange({
        type: 'expense',
        amount: '45000',
        date: '2026-11-18',
        category: 'Food & dining',
        merchant: 'Coffee House',
        note: 'Iced latte',
      });
      await session.flush();

      drafts = await controller.reloadDrafts();
      assert.equal(drafts.length, 1);
      assert.equal(drafts[0].id, firstDraftId);
      assert.equal(drafts[0].reviewedData.merchant, 'Coffee House');
      assert.equal(drafts[0].reviewedData.amount, '45000');

      // Reinitialize controller to simulate page refresh / browser restart
      const refreshed = createTransactionDraftController();
      refreshed.setUserId('user-1');
      const recovered = await refreshed.reloadDrafts();
      assert.equal(recovered.length, 1);
      assert.equal(recovered[0].reviewedData.merchant, 'Coffee House');
      assert.equal(recovered[0].reviewedData.note, 'Iced latte');

      // User isolation: user-2 cannot see user-1 drafts
      const otherUser = createTransactionDraftController();
      otherUser.setUserId('user-2');
      assert.equal((await otherUser.reloadDrafts()).length, 0);
    });

    it('creates/upgrades a draft with receiptBlob on image selection and retains Blob + source label across recovery', async () => {
      const controller = createTransactionDraftController();
      controller.setUserId('user-1');

      const session = createDraftAutoSaveSession({
        createDraft: (input) => controller.createDraft(input),
        updateDraft: (id, patch) => controller.updateDraft(id, patch),
        debounceMs: 10,
      });

      const blob = new Blob(['receipt-bytes'], { type: 'image/png' });
      Object.defineProperty(blob, 'name', { value: 'store.png' });

      await session.recordReceiptSelection(blob, {
        type: 'expense',
        amount: '',
        date: '2026-11-18',
        category: 'Shopping',
        merchant: '',
        note: '',
      });

      await session.recordOcrExtraction(
        {
          type: 'expense',
          amount: 125000,
          date: '2026-11-18',
          category: 'Shopping',
          merchant: 'WinMart',
          note: '',
        },
        {
          warnings: [],
          aiModel: 'gemini-3.5-flash-lite',
          promptVersion: 'receipt-v3',
        }
      );

      const refreshed = createTransactionDraftController();
      refreshed.setUserId('user-1');
      const drafts = await refreshed.reloadDrafts();
      assert.equal(drafts.length, 1);
      assert.equal(isReceiptDraft(drafts[0]), true);
      assert.equal(getDraftSourceLabel(drafts[0]), 'Receipt');
      assert.ok(drafts[0].receiptBlob instanceof Blob);
      assert.equal(drafts[0].reviewedData.merchant, 'WinMart');
      assert.equal(drafts[0].reviewedData.amount, 125000);
    });

    it('confirms Manual drafts via transaction API and legacy Receipt drafts via receipt confirm API', async () => {
      const receiptCalls = [];
      const txCalls = [];
      const controller = createTransactionDraftController({
        confirmReceiptApi: async (payload) => {
          receiptCalls.push(payload);
          return { receipt: { id: 'r-1' }, transaction: { id: 'tx-r1' } };
        },
        createTransactionApi: async (payload) => {
          txCalls.push(payload);
          return { transaction: { id: payload.id } };
        },
      });
      controller.setUserId('user-1');

      const manual = await controller.createDraft({
        sourceType: 'manual',
        originalData: {
          type: 'expense',
          amount: 50000,
          date: '2026-11-18',
          category: 'Transportation',
          merchant: 'Grab',
          note: '',
        },
      });

      await controller.confirmDraft(manual.id, manual.originalData);
      assert.equal(txCalls.length, 1);
      assert.equal(receiptCalls.length, 0);

      const legacyBlob = new Blob(['legacy-receipt'], { type: 'image/jpeg' });
      const legacyReceipt = await draftStorage.createDraft('user-1', {
        sourceType: 'receipt',
        receiptBlob: legacyBlob,
        originalData: {
          type: 'expense',
          amount: 88000,
          date: '2026-11-17',
          category: 'Food & dining',
          merchant: 'Highlands Coffee',
        },
      });

      assert.equal(isReceiptDraft(legacyReceipt), true);
      assert.equal(getDraftSourceLabel(legacyReceipt), 'Receipt');

      await controller.confirmDraft(legacyReceipt.id, legacyReceipt.originalData);
      assert.equal(receiptCalls.length, 1);
    });
  });

  describe('2. Unified Navigation, Drafts Table, Add Transaction Popup & Button System', () => {
    it('exposes exactly Transactions and Drafts in Workspace sidebar without Scan Receipt', () => {
      assert.deepEqual(
        WORKSPACE_NAV_ITEMS.map((item) => item.label),
        ['Transactions', 'Drafts']
      );
      assert.equal(WORKSPACE_NAV_ITEMS[1].path, APP_ROUTES.EXPENSE_DRAFTS);
    });

    it('renders DraftsTable with TransactionPage-compatible Table primitives, source badges, and Edit/Confirm/Discard actions', () => {
      const tableSource = readClientFile('features/transactionDraft/DraftsTable.jsx');
      const pageSource = readClientFile('features/transactionDraft/DraftsPage.jsx');
      assert.match(tableSource, /TableHead/);
      assert.match(tableSource, /TableBody/);
      assert.match(tableSource, /TableRow/);
      assert.match(tableSource, /getDraftSourceLabel/);
      assert.match(tableSource, /Loading drafts/);
      assert.match(tableSource, /No saved drafts yet/);
      assert.match(tableSource, />\s*Edit\s*</);
      assert.match(tableSource, />\s*Confirm\s*</);
      assert.match(tableSource, />\s*Discard\s*</);
      assert.match(pageSource, /Alert variant="error"/);
    });

    it('implements two-column Add Transaction popup with image picker, Scan placeholder, and no Upload or Save-as-draft buttons', () => {
      const txPageSource = readClientFile('features/transaction/TransactionPage.jsx');
      const manualEntrySource = readClientFile('features/transaction/ManualEntry.jsx');

      assert.match(txPageSource, /Add Transaction/);
      assert.doesNotMatch(txPageSource, /Enter manually/);

      assert.match(manualEntrySource, /<Grid columns=\{2\}/);
      assert.match(manualEntrySource, /border-2 border-dashed/);
      assert.match(manualEntrySource, /Click to select receipt image/);
      assert.match(manualEntrySource, />\s*Scan\s*</);
      assert.match(manualEntrySource, /handleScanPlaceholder/);
      assert.match(manualEntrySource, /Confirm transaction/);

      assert.doesNotMatch(manualEntrySource, />\s*Upload\s*</);
      assert.doesNotMatch(manualEntrySource, /Save as Draft/i);
    });

    it('standardizes Button interaction states (hover, active/pressed, focus-visible, disabled, loading)', () => {
      const buttonSource = readClientFile('primitives/buttons/Button.jsx');
      assert.match(buttonSource, /active:enabled:scale-\[0\.98\]/);
      assert.match(buttonSource, /focus-visible:shadow-focus/);
      assert.match(buttonSource, /disabled:opacity-60/);
      assert.match(buttonSource, /data-loading=\{loading \? 'true' : undefined\}/);
      assert.match(buttonSource, /<Spinner size="xs"/);
    });
  });
});
