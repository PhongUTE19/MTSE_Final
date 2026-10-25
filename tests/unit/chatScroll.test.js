import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isUserScrolledUp } from '../../client/src/shared/hooks/useChatScroll.js';

describe('Chat Auto-Scroll & Scroll Tracking Suite', () => {
  describe('1. isUserScrolledUp calculation logic', () => {
    it('returns false when container is null or undefined', () => {
      assert.equal(isUserScrolledUp(null), false);
      assert.equal(isUserScrolledUp(undefined), false);
    });

    it('returns false when scrolled exactly to bottom (distanceFromBottom is 0)', () => {
      const el = {
        scrollHeight: 1000,
        scrollTop: 600,
        clientHeight: 400,
      };
      // scrollHeight (1000) - scrollTop (600) - clientHeight (400) = 0 <= 60
      assert.equal(isUserScrolledUp(el, 60), false);
    });

    it('returns false when near bottom within threshold tolerance', () => {
      const el = {
        scrollHeight: 1000,
        scrollTop: 560,
        clientHeight: 400,
      };
      // distanceFromBottom = 1000 - 560 - 400 = 40 <= 60
      assert.equal(isUserScrolledUp(el, 60), false);
    });

    it('returns false exactly at the threshold boundary', () => {
      const el = {
        scrollHeight: 1000,
        scrollTop: 540,
        clientHeight: 400,
      };
      // distanceFromBottom = 1000 - 540 - 400 = 60 <= 60
      assert.equal(isUserScrolledUp(el, 60), false);
    });

    it('returns true when user scrolls up beyond threshold', () => {
      const el = {
        scrollHeight: 1000,
        scrollTop: 500,
        clientHeight: 400,
      };
      // distanceFromBottom = 1000 - 500 - 400 = 100 > 60
      assert.equal(isUserScrolledUp(el, 60), true);
    });

    it('supports custom threshold values', () => {
      const el = {
        scrollHeight: 1000,
        scrollTop: 580,
        clientHeight: 400,
      };
      // distanceFromBottom = 20
      assert.equal(isUserScrolledUp(el, 10), true); // 20 > 10
      assert.equal(isUserScrolledUp(el, 30), false); // 20 <= 30
    });
  });

  describe('2. Auto-scroll behavior simulation during streaming & manual interaction', () => {
    it('follows new content when user has not scrolled up', () => {
      const container = {
        scrollHeight: 500,
        scrollTop: 200,
        clientHeight: 300,
      };

      let userScrolledUp = isUserScrolledUp(container);
      assert.equal(userScrolledUp, false, 'Initial state is at bottom');

      // New content arrives (e.g. streaming chunks or new message)
      container.scrollHeight = 800;

      // Auto-scroll logic: if !userScrolledUp, scroll to bottom
      if (!userScrolledUp) {
        container.scrollTop = container.scrollHeight;
      }

      assert.equal(container.scrollTop, 800, 'scrollTop updated to bottom of new content');
    });

    it('pauses auto-scroll when user scrolls upward to read history', () => {
      const container = {
        scrollHeight: 1000,
        scrollTop: 400, // User scrolled way up
        clientHeight: 300,
      };

      const userScrolledUp = isUserScrolledUp(container, 60);
      assert.equal(userScrolledUp, true, 'User is detected as scrolled up');

      // Streaming content continues to arrive in background
      container.scrollHeight = 1400;

      // Auto-scroll handler checks userScrolledUp
      if (!userScrolledUp) {
        container.scrollTop = container.scrollHeight;
      }

      assert.equal(container.scrollTop, 400, 'User scroll position is preserved without fighting the reader');
    });

    it('resumes auto-scroll when user scrolls back to bottom or force-scrolls on send', () => {
      const container = {
        scrollHeight: 1200,
        scrollTop: 400,
        clientHeight: 300,
      };

      let userScrolledUp = isUserScrolledUp(container, 60);
      assert.equal(userScrolledUp, true);

      // Force scroll on new user message send
      const scrollToBottom = (force = false) => {
        if (force) {
          userScrolledUp = false;
          container.scrollTop = container.scrollHeight;
        } else if (!userScrolledUp) {
          container.scrollTop = container.scrollHeight;
        }
      };

      scrollToBottom(true);
      assert.equal(userScrolledUp, false, 'userScrolledUp reset to false on forced scroll');
      assert.equal(container.scrollTop, 1200, 'container scrolled to bottom immediately');

      // Next streaming chunk auto-scrolls normally
      container.scrollHeight = 1350;
      scrollToBottom(false);
      assert.equal(container.scrollTop, 1350, 'subsequent streaming updates scroll to bottom');
    });
  });

  describe('3. Observer lifecycle & dynamic DOM mounting', () => {
    it('disconnects previous observer and re-observes when container mounts dynamically', () => {
      const disconnected = [];
      const observed = [];

      class MockMutationObserver {
        constructor(callback) {
          this.callback = callback;
        }
        observe(target, options) {
          observed.push({ target, options });
        }
        disconnect() {
          disconnected.push(true);
        }
      }

      // Initial state: popup closed, element is null
      let currentEl = null;
      let observedEl = null;
      let observer = null;

      const syncObserver = (el) => {
        if (el !== observedEl) {
          if (observer) {
            observer.disconnect();
            observer = null;
          }
          observedEl = el;
          if (el) {
            observer = new MockMutationObserver(() => {});
            observer.observe(el, { childList: true, subtree: true, characterData: true });
          }
        }
      };

      // 1. Popup closed: no observation
      syncObserver(currentEl);
      assert.equal(observed.length, 0);

      // 2. User opens popup: element mounts
      currentEl = { id: 'chat-history-div' };
      syncObserver(currentEl);
      assert.equal(observed.length, 1);
      assert.equal(observed[0].target.id, 'chat-history-div');

      // 3. User closes popup: element unmounts
      currentEl = null;
      syncObserver(currentEl);
      assert.equal(disconnected.length, 1);
      assert.equal(observer, null);
    });
  });
});
