# ADR 0002: Separation of PushDrawer and OverlayDrawer Architectures

* **Status:** Accepted  
* **Date:** 2026-11-14  
* **Deciders:** Engineering Team  
* **Consulted:** Accessibility Reviewer, Frontend Developers  
* **Informed:** All Contributors  

---

## 1. Context

Earlier iterations of SpendWise attempted to use a single `Drawer.jsx` component with configuration flags (`variant="push" | "overlay"` or `hideBackdrop={true}`) to serve two fundamentally different user experience patterns:
1. The AI Expense Assistant companion side panel on `/expense`.
2. The Knowledge Base document inspection slide-over panel on `/admin/knowledge-base`.

This unification led to serious UX and accessibility bugs:
* Competing `Escape` keydown listeners where closing an inner dialog dismissed the entire drawer.
* Body scroll locks being applied inappropriately to companion panels where users needed to continue scrolling transactions.
* Broken `Tab` focus trapping and conflicting stacking contexts between the modal backdrop and the push drawer.

## 2. Decision Drivers

1. **Accessibility Correctness:** Companion panels must **not** trap focus or lock document body scrolling; modal slide-overs **must** trap focus and lock body scrolling.
2. **Layout Integration:** Push drawers participate in CSS grid/flex layout and push main content; overlay drawers float above content on a dedicated z-index layer.
3. **Event Independence:** Dismissal keys and backdrop clicks must have clear single-ownership semantics without boolean prop cascades.

## 3. Considered Alternatives

* **Alternative 1: Unified Configurable Drawer Component:** Rejected because conditional logic for focus traps, scroll locking, and ARIA attributes created fragile state machines and constant regressions.
* **Alternative 2: Third-Party Drawer Library (e.g. Radix Dialog or Vaul):** Rejected to avoid external runtime dependencies and preserve custom layout transitions.

## 4. Decision

Explicitly decouple the two interaction patterns into two separate, dedicated components under `composites/overlays/`:

1. **`PushDrawer.jsx` (`composites/overlays/PushDrawer.jsx`):**
   - **Pattern:** Non-modal companion side panel.
   - **Behavior:** No backdrop, no body scroll locking, no focus trap. Main page controls remain interactive while open.
   - **Focus Management:** Focuses initial target on open; restores focus to trigger button on close.
2. **`OverlayDrawer.jsx` (`composites/overlays/OverlayDrawer.jsx`):**
   - **Pattern:** Modal slide-over dialog.
   - **Behavior:** Renders `Backdrop`, locks body scroll (`lockBodyScroll`), traps `Tab` focus (`resolveTabTarget`), enforces `role="dialog"` and `aria-modal="true"`.
   - **Focus Management:** Traps focus strictly within panel; handles `Escape` dismissal cleanly.

Re-exporting `Drawer.jsx` as a backwards-compatibility wrapper was eliminated in favor of direct canonical imports.

## 5. Consequences

### Positive
* Zero accessibility leaks between modal and companion side panels.
* Clean separation of CSS ownership (`shared/styles/components/drawer.css`).
* Predictable keyboard navigation and focus restoration.

### Negative / Trade-offs
* Two distinct components must be maintained rather than one. Shared low-level DOM utilities (`drawerFocus.js`, `overlayStack.js`) are shared in `shared/utils/` to prevent code duplication.

## 6. Related References

* Architecture Reference: [`docs/engineering/architecture.md`](../architecture.md)
* Implementation Tasks: `FE-FIX-01`, `FE-FIX-02`, and `DRAWER-REWORK-01` in [`docs/engineering/refactoring-plan.md`](../refactoring-plan.md)
* Verification: [`tests/unit/chatbotPushDrawerFix.test.js`](../../../tests/unit/chatbotPushDrawerFix.test.js), [`tests/unit/overlayDrawerFix.test.js`](../../../tests/unit/overlayDrawerFix.test.js)
