import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  fallbackConfirm,
  normalizeConfirmOptions,
} from '../../client/src/shared/utils/confirmUtils.js';

describe('ConfirmDialog & confirmUtils Suite', () => {
  describe('normalizeConfirmOptions', () => {
    it('normalizes string message into default confirm options', () => {
      const options = normalizeConfirmOptions('Are you sure you want to proceed?');
      assert.deepEqual(options, {
        title: 'Confirmation',
        message: 'Are you sure you want to proceed?',
        confirmText: 'Confirm',
        cancelText: 'Cancel',
        variant: 'primary',
        isLoading: false,
      });
    });

    it('normalizes empty or null input with safe defaults', () => {
      const defaultOptions = normalizeConfirmOptions();
      assert.equal(defaultOptions.title, 'Confirmation');
      assert.equal(defaultOptions.message, '');
      assert.equal(defaultOptions.confirmText, 'Confirm');
      assert.equal(defaultOptions.cancelText, 'Cancel');
      assert.equal(defaultOptions.variant, 'primary');
      assert.equal(defaultOptions.isLoading, false);

      const nullOptions = normalizeConfirmOptions(null);
      assert.equal(nullOptions.title, 'Confirmation');
      assert.equal(nullOptions.message, '');
    });

    it('supports custom title, Yes/No button labels', () => {
      const options = normalizeConfirmOptions({
        title: 'Save Changes',
        message: 'Do you want to save current progress?',
        confirmText: 'Yes',
        cancelText: 'No',
      });

      assert.equal(options.title, 'Save Changes');
      assert.equal(options.message, 'Do you want to save current progress?');
      assert.equal(options.confirmText, 'Yes');
      assert.equal(options.cancelText, 'No');
      assert.equal(options.variant, 'primary');
    });

    it('supports Delete/Cancel button labels with danger variant', () => {
      const options = normalizeConfirmOptions({
        title: 'Delete Item',
        message: 'This action cannot be undone.',
        confirmText: 'Delete',
        cancelText: 'Cancel',
        variant: 'danger',
      });

      assert.equal(options.title, 'Delete Item');
      assert.equal(options.confirmText, 'Delete');
      assert.equal(options.cancelText, 'Cancel');
      assert.equal(options.variant, 'danger');
    });

    it('maps isDestructive: true to variant: danger', () => {
      const options = normalizeConfirmOptions({
        title: 'Reset Prompt',
        message: 'Reset all custom prompt configurations?',
        isDestructive: true,
      });

      assert.equal(options.variant, 'danger');
    });

    it('preserves and casts isLoading state', () => {
      const loadingOptions = normalizeConfirmOptions({
        message: 'Processing...',
        isLoading: true,
      });
      assert.equal(loadingOptions.isLoading, true);

      const notLoadingOptions = normalizeConfirmOptions({
        message: 'Ready',
        isLoading: 0,
      });
      assert.equal(notLoadingOptions.isLoading, false);
    });
  });

  describe('fallbackConfirm', () => {
    it('returns false in non-browser environment without window', async () => {
      const originalWindow = globalThis.window;
      try {
        delete globalThis.window;
        const result = await fallbackConfirm('Test message');
        assert.equal(result, false);
      } finally {
        if (originalWindow !== undefined) {
          globalThis.window = originalWindow;
        }
      }
    });

    it('calls window.confirm when window is present', async () => {
      const originalWindow = globalThis.window;
      let confirmedWith = '';
      try {
        globalThis.window = {
          confirm: (msg) => {
            confirmedWith = msg;
            return true;
          },
        };
        const result = await fallbackConfirm({ title: 'Alert', message: 'Proceed?' });
        assert.equal(result, true);
        assert.equal(confirmedWith, 'Proceed?');
      } finally {
        if (originalWindow !== undefined) {
          globalThis.window = originalWindow;
        } else {
          delete globalThis.window;
        }
      }
    });
  });
});
