# SpendWise — Implementation Guidelines & Verification Standards

> **Audience:** Implementation Agents (`Agent-Backend`, `Agent-Frontend`) and Code Auditors  
> **Related Rules:** [`.agents/rules/project-basics.md`](../../.agents/rules/project-basics.md), [`.agents/rules/backend.md`](../../.agents/rules/backend.md), [`.agents/rules/frontend.md`](../../.agents/rules/frontend.md), [`.agents/rules/ai-and-rag.md`](../../.agents/rules/ai-and-rag.md)

---

## 1. Mandatory Rules for All Implementation Agents

1. **Strict Task & File Scope:**
   - Only modify the source files and test files explicitly listed for your assigned `TASK-XX` in [`refactoring-plan.md`](./refactoring-plan.md).
   - Never touch files listed under "Excluded Files" or owned by the other agent.
2. **Preserve Existing User Work & Git History:**
   - Never run destructive Git commands (`git reset --hard`, `git checkout .`, `git clean -fd`).
   - Do not commit or push unless explicitly instructed by the user.
3. **No Silent Contract Changes:**
   - Do not alter REST endpoint URLs, HTTP status codes for valid requests, response JSON keys, or Supabase RPC parameter names.
   - Do not modify existing SQL migration files in `supabase/migrations/`.
4. **Evidence-Based Reporting:**
   - Never claim a test, build, or container check passed unless you executed the command in the current session and observed exit code `0`.

---

## 2. Domain-Specific Technical Invariants

### 2.1 Financial Amounts & Single-Currency VND Ledger (`TASK-06`, `TASK-08`)
- **VND Ledger Invariant:** `public.expense_transactions` stores amounts in **VND**.
- **Receipt Amount Normalization (`normalizeReceiptAmount` in `receipt.schemas.js`):**
  - Strip currency symbols/codes (`$`, `₫`, `€`, `£`, `¥`, `VND`, `USD`, `EUR`) and whitespace.
  - **Dot-Separated Thousands (`"1.250.000"`, `"45.000₫"`):**
    - Strings matching multiple dot-separated 3-digit groups (`/^[+-]?\d{1,3}(\.\d{3})+$/`) or a single dot followed by 3 digits (`/^[+-]?\d{1,3}\.\d{3}$/`) must strip `.` as a thousands separator (`"1.250.000"` → `1250000`, `"45.000₫"` → `45000`).
  - **Decimal Amounts (`"12.50"`, `42.5`):**
    - Strings with 1 or 2 digits after a single decimal point (`/^[+-]?\d+\.\d{1,2}$/`) must retain exact decimal semantics (`"12.50"` → `12.5`).
  - **Zero Handling:**
    - `normalizeReceiptAmount(0)` must return `null` so `totalAmount` cannot be `0`.
    - Line items (`normalizeReceiptItems`) must allow `0` (`amount: 0` or `"0"` → `0`) so zero-value promotional/discount items are preserved as `0`.
- **Non-VND Receipt Handling:**
  - Do **not** silently convert foreign currencies to VND, and do **not** run `normalizeLikelyVndThousands` (`* 1000`) when `currency !== 'VND'`.
  - When `extraction.currency !== 'VND'`, append a clear warning to `extraction.warnings` and set `draft.amount = ''` (preserving `draft.foreignAmount = extraction.totalAmount`) in `toDraft(extraction)` so the user must explicitly enter the VND amount in `ReceiptReview.jsx` before confirming.

### 2.2 Calendar Date Validation (`TASK-05`, `TASK-08`)
- Regex `/^\d{4}-\d{2}-\d{2}$/` alone is **insufficient** because JavaScript `new Date("2026-02-30T00:00:00Z")` silently rolls over to `2026-03-02`, whereas PostgreSQL `DATE` throws a runtime error (`HTTP 500`).
- Always verify calendar validity using UTC round-trip checking:
  ```js
  export function isValidIsoCalendarDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [y, m, d] = value.split('-').map(Number);
    const utc = new Date(Date.UTC(y, m - 1, d));
    return (
      utc.getUTCFullYear() === y &&
      utc.getUTCMonth() === m - 1 &&
      utc.getUTCDate() === d
    );
  }
  ```
- Apply this check across `transactionSchema`, `transactionQuerySchema`, `receiptConfirmSchema`, `validateReceiptExtraction`, and client-side transaction confirmation forms.

### 2.3 Cross-OS Markdown Prompt Loading (`TASK-02`)
- Whenever reading `.md` or `.txt` prompt templates via `fs.readFileSync(..., 'utf-8')`, always chain `.replace(/\r\n/g, '\n').trim()` so prompt assembly and SHA-256 prompt hashing (`hashPrompt`) behave identically on Windows and Linux.

### 2.4 Tailwind-Exclusive Styling & Design Token Standards (`FE-REF-11`, `ADR-0005`)
- **Single Stylesheet Entry Point:** All styling originates from `client/src/index.css` (`:root` design tokens, `@tailwind base; @tailwind components; @tailwind utilities;`, and `@layer base` defaults). Zero standalone `.css` files exist or may be created in `client/src/` (all 19 legacy stylesheets have been consolidated and deleted).
- **Centralized Design Token Consumption:** All component, layout, and feature styling must consume design tokens configured in `client/tailwind.config.js`:
  - Colors (`brand`, `surface`, `content`, `border`, `success`, `danger`/`error`, `warning`, `info`, `income`, `expense`, `sidebar`, `overlay`).
  - Spacing: 4px grid (`0`..`14`) and semantic tokens (`none`, `2xs`, `xs`, `sm`, `md`, `lg`, `xl`, `2xl`).
  - Typography: `fontFamily` (`sans`, `mono`), `fontSize` (`2xs`..`display`), `fontWeight` (`normal`, `medium`, `semibold`, `bold`), `lineHeight`, `letterSpacing`.
  - Radii (`sm: 4px`, `md: 6px`, `lg: 8px`, `xl: 12px`, `full: 9999px`), Shadows (`card`, `modal`, `drawer`, `sidebar`, `toast`, `focus`, etc.), Z-Index scale (`sidebar: 5`, `assistant: 20`, `mobile-assistant: 100`, `mobile-drawer: 101`, `modal: 1000`, `backdrop: 1000`, `drawer: 1001`, `toast: 2000`), Layout Dimensions (`sidebar: 280px`, `push-drawer: 410px`, `drawer: 720px`, `workspace: 1340px`), and Screens (`xs: 420px`, `mobile: 540px`, `tablet: 840px`, `desktop: 1120px`).
- **Controlled Variant APIs & ClassName Stripping:** Base Primitives (`primitives/**`) and Composites (`composites/**`) must **not** accept external `className` or `style` props. Strip them before rendering to native DOM nodes. Control appearance strictly through explicit semantic props (`variant`, `size`, `disabled`, `invalid`, `fullWidth`).
- **Layout vs. Appearance Separation:** Primitives own internal appearance. External spacing, margins, and positioning must be handled by Layout Primitives (`Stack`, `Inline`, `Grid`, `Spacer`, `Divider`) or semantic layout containers (`<header>`, `<section>`, `<form>`).
- **Workspace Layout & Route Architecture (`FE-REF-13`):**
  - Authenticated routes are hosted in a persistent layout shell (`WorkspaceRouteShell`), where `AuthenticatedRouteGuard` resolves `user` and `onSignOut` and passes them to `WorkspaceLayout`. `WorkspaceLayout` instantiates `WorkspaceProvider` (`useWorkspace()`), rendering `<WorkspaceSidebar />` with zero props and eliminating all `sidebarProps` or `onSignOut` prop forwarding from feature pages.
  - `WorkspaceExpenseAssistant` is mounted at the shell level as a non-flow fixed companion overlay without collapsing content width or losing state during navigation.
  - Expense domain routes are nested under `/expense/*` with `ExpensePage.jsx` serving as the layout shell and outlet for `/expense/transactions` (`TransactionView.jsx`), `/expense/receipts` (`ReceiptsView.jsx`), and `/expense/categories` (`CategoriesView.jsx`), defaulting from `/expense` via `ExpenseIndexRedirect`.
  - Notifications follow the shared toast convention: root `<ToastContainer>` with `useToast()` for asynchronous domain updates and background health warnings, while `ExpensePage.jsx` provides a dismissible page-level `<Alert variant="error">` banner (`setError` via `Outlet` context) alongside inline `FormField` / `ErrorText` for form validation.
  - Shared page structure follows `FeaturePage -> PageHeader -> Stack` with responsive toolbar wrapping (`Inline wrap`) and contained table scrolling (`Table responsive`).
- **Exceptional CSS Policy:** Pure Vanilla CSS is strictly disallowed for ordinary styling (currently zero exceptions exist). Inline `style={{ ... }}` attributes are permitted exclusively for dynamic data-driven values calculated at runtime (e.g., `ChartBar.jsx` percentage dimensions and dynamic colors). Consumer-supplied `style` props on Primitives and Composites are strictly stripped.

### 2.5 Loading & Feedback UI Standardization (`FE-REF-13`)
- **Shared `Spinner` Primitive:**
  - Standardizes loading presentation across full-viewport loading shells, section fallbacks, empty states, and table loading states (`client/src/primitives/feedback/Spinner.jsx`).
  - Reused exclusively across asynchronous data-fetching and non-button loading states (`App.jsx`, `AuthenticatedRouteGuard.jsx`, `AnalyticsCharts.jsx`, `AnalyticsHistoryTable.jsx`, `TransactionTable.jsx`, etc.).
  - Supports sizes (`xs`, `sm`, `md`, `lg`) and variants (`primary`, `default`, `inverse`).
  - Preserves accessible screen-reader semantics (`aria-label`, `role="status"`, or `ariaHidden={true}`).
- **Action Button Loading Behavior:**
  - When an action is processing, the button is disabled (`disabled={isLoading}`).
  - The button's normal label remains unchanged (e.g., "Save", "Refresh", "Confirm and save transaction", "Discard").
  - Do not render a `Spinner` inside the button or swap the label for transient processing text ("Saving...", "Loading...", "Processing...").
  - Preserves click handlers, submission logic, and prevents duplicate submissions while keeping UI stable and eliminating layout shifts.
- **Controlled Variant APIs & Prop Stripping:**
  - Base Primitives (`primitives/**`) and Composites (`composites/**`) prevent unsupported `className` and `style` escape hatches from leaking to native DOM nodes.
  - Repeated prop filtering is centralized into the pure utility `omitProps(props, keysToOmit = ['className', 'style'])` (`client/src/shared/utils/domProps.js`).
  - Architectural test invariants: `Button.jsx`, `Stack.jsx`, `Inline.jsx`, `Grid.jsx`, and `CardTitle.jsx` retain explicit destructuring (`const { className: _strippedClassName, style: _strippedStyle, ...domProps } = rest;`) to satisfy regression test contracts in `frontendStandardization.test.js`.
- **Expense Assistant Push-Drawer Mechanics:**
  - `ExpenseAssistant` operates as a push drawer coexisting within `WorkspaceLayout` rather than occluding page contents.
  - `WorkspaceLayout` coordinates `assistantOpen` state via `WorkspaceProvider` (`useWorkspace().setAssistantOpen`), conditionally appending `pr-push-drawer max-tablet:pr-0` with `transition-padding-right duration-200 ease-out` to the main shell.
  - On desktop/tablet viewports, content width is smoothly reduced by `410px` (`w-push-drawer`) without horizontal overflow (`min-w-0`), while narrow mobile screens (`< 840px`) fall back gracefully to overlay presentation.
- **Display SVG Extraction & Icon Registry:**
  - Standalone SVG graphics are centralized in `client/src/primitives/display/Icons.jsx` (`WalletSparklesIcon`, `EditIcon`, `DeleteIcon`, `GoogleMark`) and re-exported via `display/index.js` and registered in `Icon.jsx` (`ICON_NAMES`).
  - Data-driven or dynamically computed SVGs (such as SVG charts in `AnalyticsCharts.jsx`) remain local to their domain rendering contexts.
- **Transaction Table Action Buttons:**
  - Actions in `TransactionTable.jsx` use explicit text `Button` components (`variant="secondary"` "Edit", `variant="danger"` "Delete") instead of icon-only `IconButton`s, improving clarity and hit targets.
- **Shared Data Controls & Pagination Architecture (`FE-REF-14`):**
  - **Domain-Independent Responsibility Naming:** Shared data controls are organized by functional responsibility without context-specific prefixes (`Table*` prefix eliminated):
    - `ItemRangeSummary` (`composites/dataDisplay/ItemRangeSummary.jsx`): Displays active record range and total count ("Showing 1–10 of 42 records") with custom unit and formatter support.
    - `PageSizeSelector` (`composites/dataDisplay/PageSizeSelector.jsx`): Standardizes per-page limit selection with accessible `Label` and `Select` controls.
    - `Pagination` (`composites/navigation/Pagination.jsx`): Canonical single pagination component coordinating `ItemRangeSummary`, `PageSizeSelector`, and accessible Previous/Next/Jump page navigation.
    - `DateRangeFilter` (`composites/filters/DateRangeFilter.jsx`): Standardizes From / To date range inputs with optional Apply action.
    - `SearchField` (`composites/filters/SearchField.jsx`): Standardizes search inputs with clear button, optional label, and enter-key submission.
  - **Pagination Consolidation (`Pagination` vs. `TablePagination`):**
    - Redundant `TablePagination` abstraction was eliminated. `Pagination` serves as the sole canonical component for multi-page data sets across both tabular views (`TransactionTable`, `AnalyticsHistoryTable`, `DocumentTable`) and non-tabular card lists (`ChunkReview`).
    - Internal navigation actions (`Previous`, `safePage / totalPages`, `Next`, `Go to page`) and item count indicators (`ItemRangeSummary`, `PageSizeSelector`) are directly assembled within `Pagination`'s responsive layout shell.
  - **Feature Composition:** Feature views (`TransactionTable`, `AnalyticsHistoryTable`, `DocumentTable`, `ChunkReview`) own all query state, filtering, sorting, and API communication, composing only the specific UI groups required without universal table lock-in.
  - **Component API Standards:** Controlled values and explicit callbacks, accessible ARIA labeling, keyboard triggers (`Enter` on search and page jump), strict stripping of external styling escape hatches via `omitProps(rest)`.
- **Toast Responsibility (`useToast`):**
  - Toast is strictly responsible for transient notifications regarding asynchronous operation outcomes and application-level errors (API/network failures, background data sync errors, successful entity creation/updates/deletions).
  - Must not be used for field-level input validation or static contextual guidance.
  - Exposes user-friendly, non-technical outcome messaging.
- **Alert Responsibility (`Alert`):**
  - Alert is primarily responsible for contextual guidance, callouts, and multi-field validation summaries that require user attention.
  - Variants: `info`, `warning`, `error`, `success`.
  - Not used for transient generic network failures (which belong to Toast).
- **Field-Level Validation Feedback (`ErrorText`, `FormField`):**
  - Field-level validation errors must be rendered near the relevant input using `ErrorText` or `FormField` with appropriate accessibility associations (`aria-invalid="true"`, `aria-describedby`, `role="alert"`).
  - Never shown prematurely before user interaction or form submission. Neutral instructional text uses `HelperText` instead of `ErrorText` or `Alert`.

### 2.5 Domain Architecture: Expense, Transaction, Receipt, Chat, and Assistant
- **Transaction (`client/src/features/transaction/`):**
  - **Ownership:** Financial transaction ledger (`TransactionPage.jsx`, `TransactionTable.jsx`, `ManualEntry.jsx`, `TransactionDetails.jsx`, `TransactionSummaryCards.jsx`, `transactionApi.js`). The `/expense/*` workspace route shell lives in `client/src/layouts/ExpenseLayout.jsx`.
  - **Contract:** Manages transaction query, filtering, sorting, server pagination, manual transaction creation, and details modal inspection with linked receipt preview access.
- **Receipt (`client/src/features/receipt/`):**
  - **Ownership:** Multimodal document ingestion, OCR extraction, pending review management, and extraction retry (`ScanReceiptPage.jsx`, `useReceiptUpload.js`, `receiptApi.js`).
  - **Contract:** Scoped strictly to document upload, preview, list, and OCR retry via `receiptApi.js`. Uses the unified `TransactionDraftReview` composite for reviewing candidate drafts. Emits `notifyTransactionsChanged()` and `notifyReceiptsChanged()` upon successful confirmation.
- **Transaction Draft (`client/src/features/transactionDraft/`):**
  - **Ownership:** Browser-local IndexedDB candidate transaction store (`draftStorage.js`, `draftController.js`, `previewUrlManager.js`, `useTransactionDrafts.js`).
  - **Contract:** Stages unconfirmed receipt and assistant drafts locally per `userId` (including temporary `receiptBlob` for OCR previews) and commits confirmed drafts to `POST /api/receipt/confirm` or `POST /api/transaction` (`client_request_id` idempotency). Legacy `transactionDraftApi.js` and `/api/transaction-draft` are retired.
- **Shared Transactions (`client/src/shared/transactions/`):**
  - **Ownership:** Domain-wide financial calculation utilities, schemas, and constants (`transactionFieldsUtils.js`, `expenseConstants.js`, `expenseCategories.js`).
- **Composites (`client/src/composites/transactions/`):**
  - **Ownership:** Reusable transaction UI components: `TransactionFields.jsx` (controlled input fields) and `TransactionDraftReview.jsx` (unified review, validation, foreign currency warnings, itemized line items, and confirm/reject actions).
- **Chat (`client/src/features/chat/`):**
  - **Ownership:** Generic, domain-agnostic conversation interface, SSE stream consumer, and drawer presentation system (`Chatbot.jsx`, `ChatComposer.jsx`, `ChatMessageItem.jsx`, `ChatHistoryTab.jsx`, `ChatHistoryItem.jsx`, `FormattedMessageText.jsx`, `useChat.js`, `chatController.js`, `sseParser.js`, `chatHistory.js`, `chatApi.js`).
  - **Contract:** Zero coupling to expense, transaction, or receipt business logic. Exposes controlled slot props (`avatarIcon`, `quickActions`, `renderToolResult`, `renderBeforeComposer`, `renderAttachmentAction`).
- **Expense Assistant (`client/src/features/expenseAssistant/`):**
  - **Ownership:** Domain-specific AI assistant composition (`ExpenseAssistant.jsx`) wired in `client/src/app/App.jsx` to canonical `POST /api/chat-assistant` and `POST /api/chat-assistant/stream` (`sendChatMessage` / `sendChatMessageStream`).
  - **Contract:** Composes `features/chat/` (`Chatbot`, `useChat`), renders custom financial tool results (`ExpenseToolResult.jsx`), handles Human-in-the-Loop transaction draft reviews via `TransactionDraftReview`, enables in-assistant receipt uploads (`useReceiptUpload.js`), and syncs updates via `WorkspaceContext`. Legacy `POST /api/expense-assistant` remains mounted as a JSON compatibility facade.

### 2.6 Transaction Drafts, Receipt Lifecycle, Chat Persistence & Phase 2 Migrations
- **Browser-Local Candidate Staging (`TransactionDraft`):**
  - Unconfirmed candidate transactions (from stateless `POST /api/receipt/upload` OCR or assistant `propose_transaction` calls) live only in user-scoped IndexedDB (`spendwise_transaction_drafts`) and are **not** persisted to PostgreSQL until explicit user confirmation.
  - Unconfirmed receipt images remain browser-local `Blob` objects in IndexedDB and are uploaded to private Supabase Storage (`receipts` bucket) only upon confirmation.
  - Because drafts are browser-local, unconfirmed drafts do not synchronize across devices; historical assistant `propose_transaction` messages without a local draft render read-only with explicit re-staging.
- **Atomic Confirmation & Idempotency:**
  - **Receipt-backed drafts (`POST /api/receipt/confirm`):** Uploads the image to private Storage (`<user_id>/<draft_id>/original`) and calls `confirm_staged_receipt_transaction` RPC (`202611170009`), which atomically inserts into `public.expense_transactions` and `public.receipts` (`status = 'confirmed'`) with advisory-lock idempotency per `(user_id, draft_id)`.
  - **Assistant/manual transactions (`POST /api/transaction`):** Inserts into `public.expense_transactions` idempotently using `client_request_id`.
- **Server-Authoritative Chat Persistence & SSE (`202611170010`, `202611170012`, `202611170013`):**
  - `public.chat_conversations` and `public.chat_messages` store user-owned conversation history with RLS (`auth.uid() = user_id`) and ownership triggers.
  - `begin_chat_stream_turn` RPC atomically ensures the owned conversation, user message, and `'streaming'` assistant attempt row with `(user_id, request_id)` idempotency. Only `'completed'` non-empty messages are included in subsequent model context.
- **Phase 2 Migrations (`LOCAL ONLY` until remote deployment approval):**
  - `202611170009_confirm_staged_receipt_transaction.sql`: Atomic receipt + transaction confirmation RPC.
  - `202611170010_chat_history.sql`: `chat_conversations` and `chat_messages` tables + RLS.
  - `202611170011_retire_legacy_drafts_and_extractions.sql`: Drops legacy `public.transaction_drafts` and `public.receipt_extractions`.
  - `202611170012_chat_streaming_lifecycle.sql` & `202611170013_chat_stream_concurrency_hardening.sql`: Streaming lifecycle columns (`status`, `reply_to`, `request_id`, `error_message`, `completed_at`) and concurrency-safe `begin_chat_stream_turn`.
  - `202611170014_add_usage_source_to_ai_usage.sql`: Adds `usage_source` provenance column (`provider_reported`, `derived`, `unavailable`, `unknown`) to `public.ai_usage_analytics`.

---

## 3. Verification Matrix (Offline vs. External Service Requirements)

| Command | Requires Live Gemini API? | Requires Live Supabase DB? | Purpose |
| :--- | :---: | :---: | :--- |
| `npm test` (`node --test "tests/**/*.test.js"`) | **No** (mocked) | **No** (mocked) | Full unit + integration regression suite (719 tests across 209 suites). Must run after every task. |
| `npm --prefix client run build` | **No** | **No** | Verifies React/Vite syntax, imports, and production bundle compilation. |
| `docker compose config` | **No** | **No** | Validates `docker-compose.yml` syntax and variable interpolation. |
| `docker compose build` | **No** | **No** (requires `client/.env` or build context) | Verifies `server/Dockerfile` and `client/Dockerfile` image builds. Requires local Docker daemon. |
| `npm run eval:rag` / `eval:agent` / `eval:receipt` | **Yes** (`GEMINI_API_KEY`) | **No** | Live LLM evaluation benchmarks in `evals/`. Run only when explicitly requested with live credentials. |

---

## 4. Fresh Supabase Environment Provisioning (`P3-02` Reference)

Because [`supabase/migrations/202610230001_expense_transactions_ownership.sql`](../../supabase/migrations/202610230001_expense_transactions_ownership.sql) expects `public.expense_transactions` to exist before applying ownership constraints and RLS policies, provisioning a **brand-new** Supabase project requires executing this idempotent bootstrap DDL in the Supabase SQL Editor **before** running `supabase/migrations/`:

```sql
create table if not exists public.expense_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  type text not null check (type in ('income', 'expense')),
  amount numeric not null check (amount > 0),
  transaction_date date not null,
  category text not null,
  merchant text not null,
  note text not null default '',
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```
*(Do not modify the existing migration files in `supabase/migrations/` unless explicitly instructed.)*

---

## 5. Repository Coding Conventions & Module Standards

1. **General JavaScript Formatting:** 2-space indentation, single quotes (`'...'`), semicolons (`;`), trailing commas in multi-line objects/arrays/parameters, and `async/await` for asynchronous flows.
2. **Naming Conventions:**
   - React components, component files (`.jsx`), and classes: `PascalCase`.
   - Custom hooks: `use` + `PascalCase` (files in `camelCase`, e.g., `useScanReceiptWorkflow.js`).
   - Functions, variables, event handlers (`handle*`), API/service/repository/schema/route `.js` files: `camelCase` (`<feature>.route.js`, `<feature>.controller.js`, `<feature>.service.js`, `<feature>.repository.js`, `<feature>.schema.js`).
   - Fixed domain/configuration constants: `UPPER_SNAKE_CASE`.
   - Booleans: `is*`, `has*`, `should*`, or `can*` prefixes where appropriate.
   - Directories: `camelCase` singular domain names (e.g., `transaction/`, `receipt/`, `aiUsage/`).
3. **Import Ordering:**
   - External packages (`react`, `react-router-dom`, `express`, `zod`) first.
   - Shared constants, services, hooks, and utilities (`../../shared/...`, `../../constants/...`).
   - Feature-local modules (`./...`).
   - UI primitives and composites (`../../primitives/...`, `../../composites/...`).
4. **Default vs. Named Exports:**
   - **Default exports:** React page and feature components (`ScanReceiptPage.jsx`, `AIUsageHistoryTable.jsx`), plus primitives/composites. Avoid mixing default and named exports in API, utility, or feature-component files.
   - **Named exports:** API modules (`*Api.js`), custom hooks (`use*.js`), constants, utilities, backend services, repositories, controllers, and Zod schemas.
5. **Barrel-File Policy (`index.js`):**
   - Use `index.js` only as a deliberate public interface for multi-file layers (`primitives/`, `composites/`, `shared/`, or multi-export feature APIs). Do not create barrels for single-file directories or wildcard re-exports that obscure ownership.
6. **React Component Conventions:**
   - Declare components as named `function`s with destructured props and explicit default values.
   - Keep route-level `*Page.jsx` components focused on composition; delegate complex conditional UI or multi-section layouts to feature components and workflows to hooks.
   - Avoid nested ternaries; use early returns, explicit conditional blocks, or lookup maps.
7. **Custom Hook Conventions:**
   - Prefix with `use`, keep dependencies explicit, derive values via `useMemo` instead of duplicating state, and extract hooks only for meaningful reusable or multi-handler workflow state.
8. **Frontend API Module Conventions:**
   - Encapsulate HTTP calls in `client/src/features/<feature>/<feature>Api.js` using `apiRequest` / `apiJsonRequest` and export named functions or a named `<feature>Api` object.
9. **Backend Layer Conventions:**
   - `*.route.js`: Express router wiring, middleware (`authenticate`, `authorize`, `rateLimiter`, `validateRequest`), and controller delegation only.
   - `*.controller.js`: HTTP extraction (`getValidatedData`), service invocation, and JSON/status formatting.
   - `*.service.js`: Domain business logic and orchestration.
   - `*.repository.js`: User-scoped Supabase/PostgreSQL persistence.
   - `*.schema.js`: Zod schemas and feature validation limits.
10. **Error Handling & Async Conventions:**
    - Use `async/await` with `try/catch` and `next(error)` in Express controllers; throw domain errors (`AppError`, `ValidationError`) rather than mixing thrown errors and ad-hoc error return objects.
11. **Constants & Configuration Conventions:**
    - Environment variables are read in `server/src/config.js`; shared server defaults live in `server/src/constants/`; client shared constants live in `client/src/shared/constants/`; feature-specific constants stay in their owning feature.
12. **Module Organization:**
    - Respect unidirectional frontend imports (`app -> features -> layouts -> composites -> primitives -> shared`) and keep feature logic isolated inside its owning feature directory.
