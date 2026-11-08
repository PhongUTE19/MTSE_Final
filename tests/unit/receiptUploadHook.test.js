import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReceiptUploadController } from '../../client/src/features/receipts/useReceiptUpload.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readSource = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const validFile = (name = 'receipt.png') => ({ name, type: 'image/png', size: 1024 });
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};
const uploadResult = (id) => ({ receipt: { id, extraction: { merchant: `m-${id}` } } });

/** Builds a controller wired to recording fakes. */
function setup(overrides = {}) {
  const log = [];
  const state = { receipt: null, processing: null };
  const urls = {
    created: 0,
    revoked: [],
    createObjectURL: () => `blob:${++urls.created}`,
    revokeObjectURL: (url) => urls.revoked.push(url),
  };
  const options = {
    upload: async (file) => uploadResult(`id-${file.name}`),
    confirm: async (id) => log.push(`confirm:${id}`),
    discard: async (id) => log.push(`discard:${id}`),
    validationMessage: 'bad file',
    reportActionErrors: true,
    onError: (message) => log.push(`error:${message}`),
    onUploadStart: () => log.push('start'),
    onUploadSettled: () => log.push('settled'),
    onUploadFailed: async () => log.push('failed'),
    onConfirmSaved: async () => log.push('confirmSaved'),
    onConfirmClosed: async () => log.push('confirmClosed'),
    onDiscardSaved: async () => log.push('discardSaved'),
    onDiscardClosed: async () => log.push('discardClosed'),
    ...overrides,
  };
  const controller = createReceiptUploadController(() => options, {
    setReceipt: (value) => {
      state.receipt = value;
    },
    setProcessing: (value) => {
      state.processing = value;
    },
    urls,
  });
  return { controller, state, urls, log, options };
}

describe('useReceiptUpload controller', () => {
  describe('1. File validation', () => {
    it('rejects unsupported types and oversized files with the caller message and no side effects', async () => {
      const { controller, state, urls, log } = setup();
      await controller.uploadFile({ name: 'a.gif', type: 'image/gif', size: 10 });
      await controller.uploadFile({ name: 'big.png', type: 'image/png', size: 5 * 1024 * 1024 + 1 });
      assert.deepEqual(log, ['error:bad file', 'error:bad file']);
      assert.equal(urls.created, 0);
      assert.equal(state.receipt, null);
      assert.equal(state.processing, null);
    });

    it('ignores a missing file and accepts the 5 MB boundary', async () => {
      const { controller, state, log } = setup();
      await controller.uploadFile(undefined);
      assert.deepEqual(log, []);
      await controller.uploadFile({ name: 'edge.webp', type: 'image/webp', size: 5 * 1024 * 1024 });
      assert.equal(state.receipt.id, 'id-edge.webp');
    });
  });

  describe('2. Upload lifecycle', () => {
    it('publishes processing then the review receipt with a local preview and clears errors first', async () => {
      const { controller, state, log } = setup();
      const file = validFile();
      await controller.uploadFile(file);
      assert.deepEqual(log, ['error:', 'start', 'settled']);
      assert.equal(state.processing, null);
      assert.deepEqual(state.receipt, {
        id: 'id-receipt.png',
        file,
        previewUrl: 'blob:1',
        localPreview: true,
        draft: { merchant: 'm-id-receipt.png' },
      });
    });

    it('reports an upload failure, runs onUploadFailed and revokes the preview', async () => {
      const { controller, state, urls, log } = setup({
        upload: async () => {
          throw new Error('OCR down');
        },
      });
      await controller.uploadFile(validFile());
      assert.deepEqual(log, ['error:', 'start', 'error:OCR down', 'failed', 'settled']);
      assert.deepEqual(urls.revoked, ['blob:1']);
      assert.equal(state.receipt, null);
      assert.equal(state.processing, null);
    });

    it('drops a superseded upload: no receipt, preview revoked, no settle/error for it', async () => {
      const first = deferred();
      let call = 0;
      const { controller, state, urls, log } = setup({
        upload: (file) => (++call === 1 ? first.promise : Promise.resolve(uploadResult(`id-${file.name}`))),
      });
      const firstUpload = controller.uploadFile(validFile('one.png'));
      await controller.uploadFile(validFile('two.png'));
      assert.equal(state.receipt.id, 'id-two.png');

      first.resolve(uploadResult('id-one.png'));
      await firstUpload;
      assert.equal(state.receipt.id, 'id-two.png', 'stale result must not replace the newer receipt');
      assert.deepEqual(urls.revoked, ['blob:1']);
      assert.equal(log.filter((entry) => entry === 'settled').length, 1);
    });

    it('swallows errors from a superseded upload', async () => {
      const first = deferred();
      let call = 0;
      const { controller, log } = setup({
        upload: (file) => (++call === 1 ? first.promise : Promise.resolve(uploadResult(file.name))),
      });
      const firstUpload = controller.uploadFile(validFile('one.png'));
      await controller.uploadFile(validFile('two.png'));
      first.reject(new Error('late failure'));
      await firstUpload;
      assert.equal(log.includes('error:late failure'), false);
    });
  });

  describe('3. Confirm', () => {
    it('saves, runs onConfirmSaved, closes (revoking the preview), then onConfirmClosed', async () => {
      const { controller, state, urls, log } = setup();
      await controller.uploadFile(validFile());
      log.length = 0;
      await controller.confirmPendingReceipt({ amount: 5 });
      assert.deepEqual(log, ['confirm:id-receipt.png', 'confirmSaved', 'confirmClosed']);
      assert.equal(state.receipt, null);
      assert.deepEqual(urls.revoked, ['blob:1']);
    });

    it('does nothing without an open receipt', async () => {
      const { controller, log } = setup();
      await controller.confirmPendingReceipt({});
      assert.deepEqual(log, []);
    });

    it('with reportActionErrors, reports the error and keeps the review open', async () => {
      const { controller, state, urls, log } = setup({
        confirm: async () => {
          throw new Error('save failed');
        },
      });
      await controller.uploadFile(validFile());
      log.length = 0;
      await controller.confirmPendingReceipt({});
      assert.deepEqual(log, ['error:save failed']);
      assert.ok(state.receipt, 'receipt stays open for another attempt');
      assert.deepEqual(urls.revoked, []);
    });

    it('without reportActionErrors, rethrows so the review UI can show the error', async () => {
      const { controller, state, log } = setup({
        reportActionErrors: false,
        confirm: async () => {
          throw new Error('save failed');
        },
      });
      await controller.uploadFile(validFile());
      log.length = 0;
      await assert.rejects(() => controller.confirmPendingReceipt({}), /save failed/);
      assert.deepEqual(log, []);
      assert.ok(state.receipt);
    });

    it('invalidates an in-flight upload so it cannot replace the receipt being saved', async () => {
      const slow = deferred();
      let call = 0;
      const { controller, state } = setup({
        upload: (file) => (++call === 1 ? Promise.resolve(uploadResult('first')) : slow.promise),
      });
      await controller.uploadFile(validFile('a.png'));
      const inFlight = controller.uploadFile(validFile('b.png'));
      await controller.confirmPendingReceipt({});
      slow.resolve(uploadResult('second'));
      await inFlight;
      assert.equal(state.receipt, null);
    });
  });

  describe('4. Discard', () => {
    it('deletes, runs onDiscardSaved, closes and revokes, then onDiscardClosed', async () => {
      const { controller, state, urls, log } = setup();
      await controller.uploadFile(validFile());
      log.length = 0;
      await controller.discardPendingReceipt();
      assert.deepEqual(log, ['discard:id-receipt.png', 'discardSaved', 'discardClosed']);
      assert.equal(state.receipt, null);
      assert.deepEqual(urls.revoked, ['blob:1']);
    });

    it('applies the same error policies as confirm', async () => {
      const failing = {
        discard: async () => {
          throw new Error('delete failed');
        },
      };
      const reported = setup(failing);
      await reported.controller.uploadFile(validFile());
      reported.log.length = 0;
      await reported.controller.discardPendingReceipt();
      assert.deepEqual(reported.log, ['error:delete failed']);
      assert.ok(reported.state.receipt);

      const thrown = setup({ ...failing, reportActionErrors: false });
      await thrown.controller.uploadFile(validFile());
      await assert.rejects(() => thrown.controller.discardPendingReceipt(), /delete failed/);
    });
  });

  describe('5. Preview ownership, resume actions and unmount', () => {
    it('only revokes previews it created locally', () => {
      const { controller, urls, state } = setup();
      controller.showReceipt({ id: 'remote', previewUrl: 'https://signed/url', localPreview: false });
      controller.closeReceipt();
      assert.deepEqual(urls.revoked, []);
      assert.equal(state.receipt, null);
    });

    it('lets callers run guarded actions with beginAction / isCurrentAction', () => {
      const { controller } = setup();
      const first = controller.beginAction();
      assert.equal(controller.isCurrentAction(first), true);
      const second = controller.beginAction();
      assert.equal(controller.isCurrentAction(first), false);
      assert.equal(controller.isCurrentAction(second), true);
      controller.closeReceipt();
      assert.equal(controller.isCurrentAction(second), false);
    });

    it('revokes the open preview on dispose', async () => {
      const { controller, urls } = setup();
      await controller.uploadFile(validFile());
      controller.dispose();
      assert.deepEqual(urls.revoked, ['blob:1']);
    });

    it('revokes an in-flight upload preview and publishes nothing when disposed mid-upload', async () => {
      const slow = deferred();
      const { controller, state, urls, log } = setup({ upload: () => slow.promise });
      const upload = controller.uploadFile(validFile());
      controller.dispose();
      slow.resolve(uploadResult('late'));
      await upload;
      assert.equal(state.receipt, null);
      assert.deepEqual(urls.revoked, ['blob:1']);
      assert.equal(log.includes('settled'), false);
    });
  });

  describe('6. Consumers share the hook', () => {
    const view = readSource('client/src/features/receipts/ReceiptsView.jsx');
    const assistant = readSource('client/src/features/expense/assistant/ExpenseAssistant.jsx');

    it('no longer duplicates upload plumbing in ReceiptsView or ExpenseAssistant', () => {
      for (const [name, source] of [['ReceiptsView', view], ['ExpenseAssistant', assistant]]) {
        assert.match(source, /useReceiptUpload/, `${name} must use useReceiptUpload`);
        assert.doesNotMatch(source, /URL\.createObjectURL|URL\.revokeObjectURL/, `${name} must not manage object URLs`);
        assert.doesNotMatch(source, /RECEIPT_ACCEPTED_TYPES|MAX_RECEIPT_SIZE_BYTES/, `${name} must not validate files`);
      }
      assert.doesNotMatch(view, /activeUploadIdRef/);
      assert.doesNotMatch(assistant, /activeReceiptUploadRef/);
    });

    it('keeps each surface\'s existing messages and error policy', () => {
      assert.match(view, /Upload a JPG, PNG, or WebP file up to 5 MB\./);
      assert.match(view, /reportActionErrors: true/);
      assert.match(assistant, /validationMessage: ASSISTANT_LABELS\.RECEIPT_RESTRICTION/);
      assert.match(assistant, /reportActionErrors: false/);
      assert.match(assistant, /ASSISTANT_LABELS\.RECEIPT_SAVED/);
      assert.match(assistant, /ASSISTANT_LABELS\.RECEIPT_DISCARDED/);
    });
  });
});
