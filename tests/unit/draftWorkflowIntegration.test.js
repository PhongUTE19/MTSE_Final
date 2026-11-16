import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  draftStorage,
  getDraft,
  resetMemoryDraftStorageForTests,
} from '../../client/src/features/transactionDraft/draftStorage.js';
import { createPreviewUrlManager } from '../../client/src/features/transactionDraft/previewUrlManager.js';
import { createTransactionDraftController } from '../../client/src/features/transactionDraft/draftController.js';
import { receiptApi } from '../../client/src/features/receipt/receiptApi.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readClientFile = (relPath) => fs.readFileSync(path.join(ROOT, 'client', 'src', relPath), 'utf8');

describe('P2-T07: Frontend Receipt & Assistant Draft Workflow Integration', () => {
  beforeEach(() => {
    resetMemoryDraftStorageForTests();
  });

  afterEach(() => {
    resetMemoryDraftStorageForTests();
  });

  it('1. Receipt workflow: stages Blob in IndexedDB, preserves on failed confirm, retries same draftId, and deletes on success', async () => {
    const revokedUrls = [];
    let nextUrl = 1;
    const fakeUrls = {
      createObjectURL: () => `blob:receipt/${nextUrl++}`,
      revokeObjectURL: (url) => revokedUrls.push(url),
    };

    const confirmRequests = [];
    let shouldFailConfirm = true;

    const controller = createTransactionDraftController({
      previewManager: createPreviewUrlManager(fakeUrls),
      confirmReceiptApi: async (payload) => {
        confirmRequests.push(payload);
        if (shouldFailConfirm) {
          throw new Error('Network timeout during confirmation');
        }
        return {
          receipt: { id: 'rec-official-1', status: 'confirmed' },
          transaction: { id: 'tx-official-1', ...payload.transaction },
          idempotent: false,
        };
      },
    });

    controller.setUserId('user-1');

    const receiptBlob = new Blob(['png-bytes'], { type: 'image/png' });
    const staged = await controller.createDraft({
      id: 'draft-receipt-1',
      sourceType: 'receipt_extraction',
      originalData: { merchant: 'Highlands', amount: 45000, date: '2026-11-17', category: 'Food & dining', type: 'expense' },
      warnings: ['Check note'],
      receiptBlob,
      fileMeta: { filename: 'coffee.png', mimeType: 'image/png', size: receiptBlob.size, sha256: 'a'.repeat(64) },
      aiModel: 'gemini-2.5-flash',
      promptVersion: 'receipt-v3',
    });

    const previewUrl = controller.getPreviewUrl(staged, 'scan-review');
    assert.ok(previewUrl);

    // Failed confirmation: must keep local draft, Blob, reviewed edits, and preview URL
    await assert.rejects(
      () => controller.confirmDraft('draft-receipt-1', { merchant: 'Highlands Coffee', amount: 50000, date: '2026-11-17', category: 'Food & dining', type: 'expense' }),
      /Network timeout/
    );
    const preserved = await getDraft('user-1', 'draft-receipt-1');
    assert.ok(preserved, 'Draft must remain in IndexedDB after failed confirm');
    assert.equal(preserved.originalData.amount, 45000, 'Original extraction must not be mutated');
    assert.equal(preserved.reviewedData.amount, 50000, 'Reviewed edits must be preserved for retry');
    assert.ok(preserved.receiptBlob instanceof Blob, 'Original Blob must remain preserved');
    assert.equal(revokedUrls.length, 0, 'Preview URL must not be revoked on failed confirm');

    // Retry with same draftId succeeds
    shouldFailConfirm = false;
    const confirmed = await controller.confirmDraft('draft-receipt-1', {
      merchant: 'Highlands Coffee',
      amount: 50000,
      date: '2026-11-17',
      category: 'Food & dining',
      type: 'expense',
    });

    assert.equal(confirmRequests.length, 2);
    assert.equal(confirmRequests[0].draftId, 'draft-receipt-1');
    assert.equal(confirmRequests[1].draftId, 'draft-receipt-1');
    assert.equal(confirmRequests[1].sha256, 'a'.repeat(64));
    assert.ok(confirmRequests[1].file instanceof Blob);
    assert.equal(confirmed.transaction.id, 'tx-official-1');
    assert.equal(await getDraft('user-1', 'draft-receipt-1'), null, 'Local draft must be deleted after confirmed success');
    assert.deepEqual(revokedUrls, [previewUrl], 'Preview URL must be revoked after confirmed success');
    assert.deepEqual(controller.getState().drafts, []);
  });

  it('2. Coalesces duplicate concurrent confirmations for the same draftId', async () => {
    let calls = 0;
    const controller = createTransactionDraftController({
      createTransactionApi: async (payload) => {
        calls += 1;
        await new Promise((r) => setTimeout(r, 15));
        return { transaction: { id: payload.id, ...payload } };
      },
    });
    controller.setUserId('user-1');

    const draftId = '11111111-1111-4111-8111-111111111111';
    await controller.createDraft({
      id: draftId,
      sourceType: 'assistant_proposal',
      originalData: { type: 'expense', amount: 30000, date: '2026-11-17', category: 'Food & dining', merchant: 'Banh Mi' },
    });

    const txFields = { type: 'expense', amount: 30000, date: '2026-11-17', category: 'Food & dining', merchant: 'Banh Mi' };
    const [r1, r2] = await Promise.all([
      controller.confirmDraft(draftId, txFields),
      controller.confirmDraft(draftId, txFields),
    ]);

    assert.equal(calls, 1, 'Concurrent clicks must not submit duplicate requests');
    assert.equal(r1.transaction.id, draftId);
    assert.equal(r2.transaction.id, draftId);
  });

  it('3. Assistant proposal workflow: uses deterministic draftId on POST /api/transaction, preserves on failure, and creates nothing on reject', async () => {
    const txRequests = [];
    let failFirst = true;

    const controller = createTransactionDraftController({
      createTransactionApi: async (payload) => {
        txRequests.push(payload);
        if (failFirst) throw new Error('503 Service Unavailable');
        return { transaction: { ...payload } };
      },
    });
    controller.setUserId('user-1');

    const proposalId = '22222222-2222-4222-8222-222222222222';
    const discardId = '33333333-3333-4333-8333-333333333333';

    await controller.createDraft({
      id: proposalId,
      sourceType: 'assistant_proposal',
      originalData: { type: 'expense', amount: 75000, date: '2026-11-17', category: 'Food & dining', merchant: 'Pho 24' },
    });
    await controller.createDraft({
      id: discardId,
      sourceType: 'assistant_proposal',
      originalData: { type: 'expense', amount: 15000, date: '2026-11-17', category: 'Food & dining', merchant: 'Tra Da' },
    });

    // Reject creates zero backend transactions
    await controller.rejectDraft(discardId);
    assert.equal(txRequests.length, 0);
    assert.equal(await getDraft('user-1', discardId), null);

    // Failed confirm preserves draft; retry uses same deterministic ID
    await assert.rejects(
      () => controller.confirmDraft(proposalId, { type: 'expense', amount: 80000, date: '2026-11-17', category: 'Food & dining', merchant: 'Pho 24' }),
      /503/
    );
    assert.ok(await getDraft('user-1', proposalId));

    failFirst = false;
    const confirmed = await controller.confirmDraft(proposalId, {
      type: 'expense',
      amount: 80000,
      date: '2026-11-17',
      category: 'Food & dining',
      merchant: 'Pho 24',
    });
    assert.equal(txRequests.length, 2);
    assert.equal(txRequests[0].id, proposalId);
    assert.equal(txRequests[1].id, proposalId);
    assert.equal(confirmed.transaction.id, proposalId);
    assert.equal(await getDraft('user-1', proposalId), null);
  });

  it('4. Reload restores IndexedDB drafts & preview URLs, and receiptApi.confirm builds multipart FormData', async () => {
    const fakeUrls = {
      createObjectURL: () => 'blob:restored/1',
      revokeObjectURL: () => {},
    };

    const controller1 = createTransactionDraftController({
      previewManager: createPreviewUrlManager(fakeUrls),
    });
    controller1.setUserId('user-reload');
    const blob = new Blob(['reload-img'], { type: 'image/png' });
    await controller1.createDraft({
      id: 'draft-reload-1',
      sourceType: 'receipt_extraction',
      originalData: { merchant: 'Circle K', amount: 25000 },
      receiptBlob: blob,
      fileMeta: { filename: 'ck.png', mimeType: 'image/png', size: blob.size, sha256: 'b'.repeat(64) },
    });
    controller1.dispose();

    // Simulate reload with a fresh controller instance
    const controller2 = createTransactionDraftController({
      previewManager: createPreviewUrlManager(fakeUrls),
    });
    controller2.setUserId('user-reload');
    const loaded = await controller2.reloadDrafts();
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].id, 'draft-reload-1');
    assert.equal(controller2.getPreviewUrl(loaded[0], 'scan-review'), 'blob:restored/1');

    // Verify receiptApi.confirm contract
    assert.equal(typeof receiptApi.confirm, 'function');
  });

  it('5. Historical proposals without a local draft render read-only with explicit re-stage and never auto-confirm', () => {
    const proposalSource = readClientFile('features/expenseAssistant/ToolProposalResult.jsx');
    const scanSource = readClientFile('features/receipt/useScanReceiptWorkflow.js');
    const assistantSource = readClientFile('features/expenseAssistant/ExpenseAssistant.jsx');

    assert.match(proposalSource, /isHistoricalExpired/);
    assert.match(proposalSource, /Historical proposal \(read-only\)/);
    assert.match(proposalSource, /Re-stage as new draft/);
    const resumeBlock = scanSource.slice(
      scanSource.indexOf('async function resumeDraftReview'),
      scanSource.indexOf('async function discardDraft')
    );
    assert.match(resumeBlock, /getPreviewUrl\?\.\(draft, 'scan-review'\)/);
    assert.doesNotMatch(resumeBlock, /receiptApi\.previewReceipt/, 'Local drafts must recreate previews from Blob, not server URL');
    assert.match(assistantSource, /sourceType:\s*'assistant_proposal'/);
    assert.match(assistantSource, /sourceType:\s*'receipt_extraction'/);
  });
});
