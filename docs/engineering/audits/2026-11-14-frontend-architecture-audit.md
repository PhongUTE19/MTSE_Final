# SpendWise — Frontend Architecture Baseline & Design Audit

> **Audit Baseline Date:** 2026-11-14  
> **Baseline Commit:** `6a4ab5e` (`Finalizes task completion and updates project docs`)  
> **Baseline Test Result (`npm test`):** 513 passed / 0 failed (38 test files, 11 frontend suites)  
> **Scope:** Frontend shell, routing, design tokens, stylesheet cascades, component inventory, and cross-layer dependencies.  
> **Related Engineering Documents:** [`../architecture.md`](../architecture.md), [`../refactoring-plan.md`](../refactoring-plan.md), [`../progress.md`](../progress.md)

---

## 1. Executive Summary & Baseline Measurements

This document records the comprehensive frontend audit conducted on 2026-11-14 prior to the frontend refactoring waves (`FE-TASK-01` through `FE-TASK-09` and subsequent standardizations). It consolidates the baseline metrics, design system analysis, component inventory, and dependency findings into a single historical reference.

### 1.1 Baseline Verification Status at Audit Time

| Verification Check | Command Executed | Result | Notes |
| :--- | :--- | :---: | :--- |
| Automated Test Suite | `npm test` | **PASS** | 513/513 tests passing across 38 suites. |
| Production Build | `npm --prefix client run build` | **PASS** | Vite 7.3.1 production bundle emitted with code-split route chunks. |
| Working Tree Status | `git status --short` | **VERIFIED** | Clean baseline with protected user modifications in `ConfirmDialog.jsx`. |

---

## 2. Design System Tokens & Stylesheet Hierarchy

### 2.1 CSS Custom Property Token Architecture (`tokens.css`)
The baseline design system was established with a two-tier token system:
* **Tier 1 (Primitive Scales):**
  - Slate Neutrals: `--slate-50` (`#f8fafc`) through `--slate-900` (`#0f172a`).
  - Brand Blue: `--blue-50` (`#eff6ff`) through `--blue-700` (`#1d4ed8`).
  - Semantic Status: Emerald (Success), Red (Danger), Amber (Warning).
  - Spacing Scale: `--space-1` (`4px`) through `--space-12` (`48px`).
  - Radii & Shadows: `--radius-xs` (`4px`) to `--radius-full`, `--shadow-xs` to `--shadow-lg`.
* **Tier 2 (Semantic Tokens):**
  - Surfaces: `--bg-app`, `--bg-surface`, `--bg-subtle`, `--bg-muted`.
  - Typography: `--text-main`, `--text-secondary`, `--text-muted`.
  - Borders: `--border-subtle`, `--border-default`, `--border-focus`.

### 2.2 Global Stylesheet Cascade Order (`client/src/index.css`)
1. `shared/styles/tokens.css` (custom properties).
2. `shared/styles/reset.css` (element box-sizing & resets).
3. `shared/styles/base.css` (body typography, focus ring).
4. `shared/styles/layout.css` (`.app-shell`, `.dashboard-content-layout`).
5. Modular component stylesheets: `common.css`, `buttons.css`, `badges.css`, `forms.css`, `alerts.css`, `toast.css`, `panels.css`, `cards.css`, `stats.css`, `tables.css`, `drawer.css`, `chat.css`, `confirmDialog.css`.

### 2.3 Identified CSS & Styling Defects
1. **Chat CSS Fragmentation:** Active `.ai-*` and `.agent-*` selectors were fragmented across three cascading override blocks in `expense.css`.
2. **Global Selector Leakage:** Unscoped `table`, `th`, and `td` rules in `workspaceLayout.css` leaked into admin `.data-table` views.
3. **Dead CSS Selectors:** Unused `.home-badge*`, `.home-grid`, and `.home-card*` rules remained in `home.css`.
4. **Ad-Hoc Inline Styles:** Static inline style objects in `AnalyticsPage.jsx` and `AnalyticsKpiCards.jsx` bypassed the design system.

---

## 3. Dependency Boundaries & Cross-Layer Issues

### 3.1 Drawer Ownership Conflicts
The application previously attempted to use a single `Drawer.jsx` component for both companion push panels and modal slide-overs:
* Competing `Escape` key handlers closed parent drawers when child dialogs closed.
* Body scroll locks (`overflow: hidden`) were mistakenly applied to the non-modal AI assistant.
* Missing focus trapping and ambiguous focus restoration targets caused accessibility failures.

### 3.2 Duplicate Receipt Upload State Machines
`ReceiptsView.jsx` and `ExpenseAssistant.jsx` maintained duplicate state machines for file validation, preview URL creation, error handling, and upload dispatch, risking memory leaks from unrevoked object URLs.

### 3.3 Provider Placement Discrepancies
`ToastProvider` was mounted inconsistently inside individual feature pages (`AnalyticsPage.jsx`, `KnowledgeBasePage.jsx`) rather than globally at the `App.jsx` root, causing toast notifications to disappear across route transitions.

---

## 4. Pre-Refactoring Component Inventory Summary

At the time of this baseline audit, `client/src/` contained 37 React components and 13 custom hooks:

| Layer Category | Component Count | Key Components Audited | Primary Audit Recommendation |
| :--- | :---: | :--- | :--- |
| **Shell & Layouts** | 5 | `App`, `AuthenticatedRouteGuard`, `AdminRouteGuard`, `WorkspaceLayout`, `AppSidebar` | Scope workspace table CSS; mount `ToastProvider` at root. |
| **Shared Base** | 9 | `Icons`, `SearchInput`, `SortableHeader`, `Pagination`, `Drawer`, `ConfirmDialog`, `ToastContainer`, `ToastItem`, `FormattedMessageText` | Separate push from overlay drawer; standardize button usage. |
| **Shared Composites** | 6 | `HealthBadge`, `ChatDrawer`, `ChatComposer`, `ChatHistoryTab`, `ChatMessageItem`, `PasswordField` | Encapsulate chat message input; standardize password visibility toggle. |
| **Feature Components** | 17 | `ExpenseSummaryCards`, `TransactionFields`, `TransactionTable`, `ReceiptsView`, `ReceiptReview`, `Analytics*`, `Document*`, `KnowledgeBase*` | Deduplicate transaction fields; separate OCR warning semantics from errors. |

---

## 5. Derived Action Items & Task Sequencing

The audit established the original 9-task frontend refactoring wave (`FE-TASK-01` through `FE-TASK-09`), which was subsequently executed and verified:
1. `FE-TASK-01`: Root shell, mojibake cleanup, root `ToastProvider` mounting.
2. `FE-TASK-02`: Dead CSS pruning in Admin & Home views.
3. `FE-TASK-03`: Scoped workspace table styles and form-error disambiguation.
4. `FE-TASK-04`: Consolidated chat CSS into `chat.css`.
5. `FE-TASK-05`: Single-owner drawer `Escape` handling and focus restoration.
6. `FE-TASK-06`: TransactionForm modal accessibility and receipt warning semantics.
7. `FE-TASK-07`: Shared `useReceiptUpload` hook extraction.
8. `FE-TASK-08`: Verification gate (tests, build, visual regressions).
9. `FE-TASK-09`: Engineering documentation synchronization.

---

> [!NOTE]
> All findings identified in this audit were subsequently resolved in refactoring waves `FE-TASK-01`..`FE-TASK-09`, `FE-FIX-01`..`FE-FIX-05`, `FE-REF-06`, `FE-REF-07`, and `FE-TEST-08`. This document is retained purely as an immutable historical record.
