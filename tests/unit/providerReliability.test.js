import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readSource = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

// These are source-level contract checks: the repository has no DOM renderer, so provider
// lifecycles are asserted structurally rather than by mounting the components.
describe('FE-REF-07: provider reliability contracts', () => {
  describe('ConfirmProvider', () => {
    const source = readSource('client/src/app/providers/ConfirmProvider.jsx');

    it('settles a superseded pending confirmation before registering a new one', () => {
      const confirmBody = source.slice(source.indexOf('const confirm = useCallback'));
      const settleIndex = confirmBody.indexOf('settle(false)');
      const registerIndex = confirmBody.indexOf('resolverRef.current = resolve');
      assert.ok(settleIndex !== -1 && registerIndex !== -1);
      assert.ok(settleIndex < registerIndex, 'previous promise must be settled before the ref is reassigned');
    });

    it('clears the resolver before invoking it so a promise cannot settle twice', () => {
      assert.match(source, /resolverRef\.current = null;\s*resolve\?\.\(result\);/);
    });

    it('resolves any pending confirmation when the provider unmounts', () => {
      assert.match(source, /useEffect\(\(\) => \(\) => settle\(false\), \[settle\]\)/);
    });

    it('drops the unused loading state and setter', () => {
      assert.doesNotMatch(source, /setConfirmLoading|isLoading/);
    });

    it('memoizes the context value', () => {
      assert.match(source, /useMemo\(\(\) => \(\{ confirm \}\), \[confirm\]\)/);
    });
  });

  describe('ToastProvider', () => {
    const source = readSource('client/src/app/providers/ToastProvider.jsx');

    it('memoizes the context value including the toast helper object', () => {
      assert.match(source, /const value = useMemo\(\(\) => \(\{[\s\S]*?toast: \{[\s\S]*?\}\), \[showToast, dismissToast, clearAllToasts\]\)/);
      assert.match(source, /<ToastContext\.Provider value=\{value\}>/);
    });

    it('prunes expired error-dedupe entries so the map stays bounded', () => {
      assert.match(source, /for \(const \[seenMessage, seenAt\] of recentErrorsRef\.current\)/);
      assert.match(source, /recentErrorsRef\.current\.delete\(seenMessage\)/);
      assert.match(source, /ERROR_DEDUPE_WINDOW_MS/);
    });

    it('keeps error deduplication within the window', () => {
      assert.match(source, /recentErrorsRef\.current\.has\(message\)/);
    });
  });
});
