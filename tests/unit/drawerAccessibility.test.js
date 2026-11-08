import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  FOCUSABLE_SELECTOR,
  getFocusableElements,
  lockBodyScroll,
  resolveInitialFocusTarget,
  resolveTabTarget,
  restoreFocus,
} from '../../client/src/shared/utils/drawerFocus.js';
import {
  pushOverlay,
  isTopmostOverlay,
  getTopmostOverlay,
  clearOverlayStack,
} from '../../client/src/shared/utils/overlayStack.js';
import { useDrawer } from '../../client/src/shared/hooks/useDrawer.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readSource = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const clientRequire = createRequire(path.join(ROOT, 'client', 'package.json'));
const React = (await import(pathToFileURL(clientRequire.resolve('react')).href)).default;
const { renderToStaticMarkup } = (
  await import(pathToFileURL(clientRequire.resolve('react-dom/server')).href)
).default;

/** Minimal element double: only what the focus helpers touch. */
function fakeElement(name, { connected = true, attrs = {}, children = [] } = {}) {
  const element = {
    name,
    isConnected: connected,
    focused: false,
    children,
    focus() {
      this.focused = true;
    },
    hasAttribute: (key) => key in attrs,
    getAttribute: (key) => attrs[key] ?? null,
    contains(other) {
      return other === this || this.children.includes(other);
    },
    querySelectorAll: () => children,
  };
  return element;
}

describe('Drawer Architecture: Separate PushDrawer and OverlayDrawer', () => {
  const overlayDrawerSource = readSource('client/src/composites/overlays/OverlayDrawer.jsx');
  const pushDrawerSource = readSource('client/src/composites/overlays/PushDrawer.jsx');
  const hookSource = readSource('client/src/shared/hooks/useDrawer.js');
  const chatbotSource = readSource('client/src/features/chat/Chatbot.jsx');
  const kbPageSource = readSource('client/src/features/knowledgeBase/KnowledgeBasePage.jsx');

  describe('1. OverlayDrawer modal lifecycle and accessibility', () => {
    it('registers exactly one keydown listener in OverlayDrawer.jsx and removes it on cleanup', () => {
      const added = overlayDrawerSource.match(/addEventListener\('keydown'/g) || [];
      const removed = overlayDrawerSource.match(/removeEventListener\('keydown'/g) || [];
      assert.equal(added.length, 1, 'OverlayDrawer must attach a single keydown listener');
      assert.equal(removed.length, 1, 'OverlayDrawer must remove its keydown listener on cleanup');
      assert.match(overlayDrawerSource, /event\.key === 'Escape'/);
      assert.match(overlayDrawerSource, /event\.key !== 'Tab'/);
      assert.match(overlayDrawerSource, /resolveTabTarget/);
    });

    it('OverlayDrawer owns focus placement, restoration and body scroll locking', () => {
      assert.match(overlayDrawerSource, /document\.activeElement/);
      assert.match(overlayDrawerSource, /restoreFocus\(previouslyFocused\)/);
      assert.match(overlayDrawerSource, /clearTimeout\(timer\)/);
      assert.match(overlayDrawerSource, /lockBodyScroll\(document\.body\)/);
      assert.match(overlayDrawerSource, /drawerRef \|\| internalRef/);
    });

    it('OverlayDrawer renders modal backdrop, dialog role and aria-modal="true"', () => {
      assert.match(overlayDrawerSource, /import Backdrop from/);
      assert.match(overlayDrawerSource, /<Backdrop[\s\S]*?open=\{isOpen\}[\s\S]*?onDismiss=\{onClose\}/);
      assert.match(overlayDrawerSource, /role="dialog"/);
      assert.match(overlayDrawerSource, /aria-modal="true"/);
    });

    it('OverlayDrawer manages aria-hidden, slide transition, and active open/closed classes', () => {
      assert.match(overlayDrawerSource, /aria-hidden=\{!isOpen\}/);
      assert.match(
        overlayDrawerSource,
        /isOpen\s*\?\s*'translate-x-0 visible'\s*:\s*'translate-x-full invisible'/
      );
      assert.match(overlayDrawerSource, /transition-\[transform,visibility\] duration-300 ease-out/);
      assert.match(overlayDrawerSource, /bodyClasses = 'flex-1 overflow-y-auto p-4 flex flex-col gap-4'/);
    });

    it('OverlayDrawer applies inert attribute when closed to prevent keyboard focus into closed drawer', () => {
      assert.match(overlayDrawerSource, /inert=\{!isOpen \? true : undefined\}/);
    });
  });

  describe('2. PushDrawer non-modal lifecycle and layout companion behavior', () => {
    it('PushDrawer does not render a modal backdrop and does not lock body scrolling', () => {
      assert.doesNotMatch(pushDrawerSource, /<Backdrop\b/, 'PushDrawer must not render any backdrop');
      assert.doesNotMatch(pushDrawerSource, /drawer-backdrop/, 'PushDrawer must not render any backdrop');
      assert.doesNotMatch(pushDrawerSource, /aria-modal="true"/, 'PushDrawer must not have aria-modal="true"');
      assert.match(pushDrawerSource, /w-push-drawer-max/);
      assert.match(pushDrawerSource, /w-push-drawer/);

      assert.doesNotMatch(pushDrawerSource, /lockBodyScroll/, 'PushDrawer must not lock body scroll');
      assert.doesNotMatch(pushDrawerSource, /resolveTabTarget/, 'PushDrawer must not trap Tab focus away from page');
    });

    it('PushDrawer registers keydown listener for Escape dismissal without trapping Tab', () => {
      const added = pushDrawerSource.match(/addEventListener\('keydown'/g) || [];
      const removed = pushDrawerSource.match(/removeEventListener\('keydown'/g) || [];
      assert.equal(added.length, 1, 'PushDrawer must attach a single keydown listener for Escape');
      assert.equal(removed.length, 1, 'PushDrawer must remove keydown listener on cleanup');
      assert.match(pushDrawerSource, /event\.key === 'Escape'/);
      assert.doesNotMatch(pushDrawerSource, /event\.key === 'Tab'/);
    });

    it('PushDrawer owns initial focus and focus restoration to the trigger', () => {
      assert.match(pushDrawerSource, /resolveInitialFocusTarget/);
      assert.match(pushDrawerSource, /restoreFocus\(previouslyFocused\)/);
      assert.match(pushDrawerSource, /clearTimeout\(timer\)/);
    });
  });

  describe('3. Canonical components and consumer integration', () => {
    it('verifies obsolete Drawer.jsx alias has been removed in favor of explicit OverlayDrawer', () => {
      const obsoleteSharedDrawer = fs.existsSync(path.join(ROOT, 'client/src/shared/components/Drawer.jsx'));
      const obsoleteOverlayDrawer = fs.existsSync(path.join(ROOT, 'client/src/composites/overlays/Drawer.jsx'));
      assert.equal(obsoleteSharedDrawer, false, 'Obsolete shared/components/Drawer.jsx must not exist');
      assert.equal(obsoleteOverlayDrawer, false, 'Obsolete compositeComponents/overlays/Drawer.jsx must not exist');
    });

    it('Expense Chat uses PushDrawer with fab trigger restoration', () => {
      assert.match(chatbotSource, /import PushDrawer from/);
      assert.match(chatbotSource, /<PushDrawer/);
      assert.match(chatbotSource, /<\/PushDrawer>/);
      assert.doesNotMatch(chatbotSource, /<Drawer/);
      assert.match(chatbotSource, /triggerRef=\{fabRef\}/);
    });

    it('Knowledge Base uses OverlayDrawer explicitly', () => {
      assert.match(kbPageSource, /import OverlayDrawer from/);
      assert.match(kbPageSource, /<OverlayDrawer/);
      assert.match(kbPageSource, /<\/OverlayDrawer>/);
      assert.doesNotMatch(kbPageSource, /<Drawer/);
    });
  });

  describe('4. useDrawer public contract', () => {
    it('keeps useDrawer free of DOM side effects', () => {
      assert.doesNotMatch(hookSource, /addEventListener/);
      assert.doesNotMatch(hookSource, /removeEventListener/);
      assert.doesNotMatch(hookSource, /setTimeout/);
      assert.doesNotMatch(hookSource, /body\.style/);
      assert.doesNotMatch(hookSource, /useEffect/);
    });

    it('retains its full return shape', () => {
      let captured;
      function Probe() {
        captured = useDrawer();
        return null;
      }
      renderToStaticMarkup(React.createElement(Probe));

      assert.deepEqual(Object.keys(captured).sort(), [
        'closeBtnRef',
        'closeDrawer',
        'drawerRef',
        'isDrawerOpen',
        'isOpen',
        'openDrawer',
        'setIsDrawerOpen',
        'setIsOpen',
        'toggleDrawer',
        'triggerRef',
      ]);
      assert.equal(captured.isOpen, false);
      assert.equal(captured.isDrawerOpen, false);
    });
  });

  describe('5. Shared focus utilities (drawerFocus.js)', () => {
    describe('Initial focus', () => {
      it('prefers an explicit element, then the first focusable control, then the container', () => {
        const first = fakeElement('first');
        const container = fakeElement('aside', { children: [first, fakeElement('second')] });
        const explicit = fakeElement('explicit');

        assert.equal(resolveInitialFocusTarget({ initialFocusElement: explicit, container }), explicit);
        assert.equal(resolveInitialFocusTarget({ container }), first);
        assert.equal(resolveInitialFocusTarget({ container: fakeElement('empty') }).name, 'empty');
        assert.equal(resolveInitialFocusTarget({ container: null }), null);
      });

      it('ignores hidden and aria-hidden descendants when listing focusables', () => {
        const visible = fakeElement('visible');
        const hidden = fakeElement('hidden', { attrs: { hidden: '' } });
        const ariaHidden = fakeElement('aria', { attrs: { 'aria-hidden': 'true' } });
        const container = fakeElement('aside', { children: [hidden, ariaHidden, visible] });
        assert.deepEqual(getFocusableElements(container).map((e) => e.name), ['visible']);
        assert.deepEqual(getFocusableElements(null), []);
        assert.match(FOCUSABLE_SELECTOR, /button:not\(\[disabled\]\)/);
      });
    });

    describe('Tab / Shift+Tab focus trap (OverlayDrawer)', () => {
      const first = fakeElement('first');
      const middle = fakeElement('middle');
      const last = fakeElement('last');
      const focusable = [first, middle, last];
      const container = fakeElement('aside', { children: focusable });
      const outside = fakeElement('outside');

      it('wraps Tab from the last control to the first', () => {
        assert.equal(resolveTabTarget({ focusable, activeElement: last, container, shiftKey: false }), first);
      });

      it('wraps Shift+Tab from the first control (or the container) to the last', () => {
        assert.equal(resolveTabTarget({ focusable, activeElement: first, container, shiftKey: true }), last);
        assert.equal(resolveTabTarget({ focusable, activeElement: container, container, shiftKey: true }), last);
      });

      it('leaves default movement alone while focus stays inside', () => {
        assert.equal(resolveTabTarget({ focusable, activeElement: middle, container, shiftKey: false }), null);
        assert.equal(resolveTabTarget({ focusable, activeElement: middle, container, shiftKey: true }), null);
      });

      it('pulls focus back in when it has escaped the drawer', () => {
        assert.equal(resolveTabTarget({ focusable, activeElement: outside, container, shiftKey: false }), first);
        assert.equal(resolveTabTarget({ focusable, activeElement: outside, container, shiftKey: true }), last);
      });

      it('keeps focus on the container when it has no focusable controls', () => {
        assert.equal(
          resolveTabTarget({ focusable: [], activeElement: container, container, shiftKey: false }),
          container
        );
      });
    });

    describe('Focus restoration and scroll lock', () => {
      it('restores focus to a connected trigger and skips detached, body or missing ones', () => {
        const trigger = fakeElement('trigger');
        const body = fakeElement('body');
        assert.equal(restoreFocus(trigger, body), true);
        assert.equal(trigger.focused, true);

        const detached = fakeElement('detached', { connected: false });
        assert.equal(restoreFocus(detached, body), false);
        assert.equal(detached.focused, false);

        assert.equal(restoreFocus(body, body), false);
        assert.equal(restoreFocus(null, body), false);
      });

      it('locks body scrolling and restores the previous overflow value on cleanup', () => {
        const body = { style: { overflow: 'auto' } };
        const unlock = lockBodyScroll(body);
        assert.equal(body.style.overflow, 'hidden');
        unlock();
        assert.equal(body.style.overflow, 'auto');
      });
    });
  });

  describe('6. LIFO Overlay Stack & Multi-layer Escape Coordination', () => {
    it('Scenario 1: OverlayDrawer open alone is topmost and responds to Escape', () => {
      clearOverlayStack();
      const drawer = { id: 'admin-drawer', dismissible: true };
      const unregister = pushOverlay(drawer);

      assert.equal(isTopmostOverlay(drawer), true);
      assert.equal(getTopmostOverlay(), drawer);

      unregister();
      assert.equal(getTopmostOverlay(), null);
    });

    it('Scenario 2: nested ConfirmDialog takes precedence over underlying OverlayDrawer', () => {
      clearOverlayStack();
      const drawer = { id: 'admin-drawer', dismissible: true };
      const dialog = { id: 'confirm-dialog', dismissible: true };

      const unregisterDrawer = pushOverlay(drawer);
      const unregisterDialog = pushOverlay(dialog);

      // Dialog is topmost; Drawer is blocked from responding to Escape
      assert.equal(isTopmostOverlay(dialog), true);
      assert.equal(isTopmostOverlay(drawer), false);

      // Scenario 3: Closing ConfirmDialog restores OverlayDrawer as topmost
      unregisterDialog();
      assert.equal(isTopmostOverlay(drawer), true);

      unregisterDrawer();
    });

    it('Scenario 4: non-dismissible overlay does not allow dismissal but blocks lower layers', () => {
      clearOverlayStack();
      const drawer = { id: 'admin-drawer', dismissible: false };
      const unregister = pushOverlay(drawer);

      assert.equal(isTopmostOverlay(drawer), true);
      assert.equal(drawer.dismissible, false);

      unregister();
    });

    it('Scenario 5: multiple stacked overlays maintain strict LIFO order', () => {
      clearOverlayStack();
      const layer1 = { id: 'layer-1', dismissible: true };
      const layer2 = { id: 'layer-2', dismissible: true };
      const layer3 = { id: 'layer-3', dismissible: true };

      const un1 = pushOverlay(layer1);
      const un2 = pushOverlay(layer2);
      const un3 = pushOverlay(layer3);

      assert.equal(isTopmostOverlay(layer3), true);
      assert.equal(isTopmostOverlay(layer2), false);
      assert.equal(isTopmostOverlay(layer1), false);

      un3();
      assert.equal(isTopmostOverlay(layer2), true);

      un2();
      assert.equal(isTopmostOverlay(layer1), true);

      un1();
      assert.equal(getTopmostOverlay(), null);
    });

    it('Scenario 6: PushDrawer and modal overlay co-exist without conflicting', () => {
      clearOverlayStack();
      const push = { id: 'push-drawer', dismissible: true };
      const modal = { id: 'overlay-drawer', dismissible: true };

      const unregisterPush = pushOverlay(push);
      const unregisterModal = pushOverlay(modal);

      // Modal is topmost; Escape only closes modal
      assert.equal(isTopmostOverlay(modal), true);
      assert.equal(isTopmostOverlay(push), false);

      // After modal closes, push is topmost and can be closed
      unregisterModal();
      assert.equal(isTopmostOverlay(push), true);

      unregisterPush();
    });
  });
});
