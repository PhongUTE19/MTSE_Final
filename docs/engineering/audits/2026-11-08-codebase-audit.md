# SpendWise — Repository-Wide Codebase Audit & Finding Reassessment

> **Audit Baseline Date:** 2026-11-08  
> **Baseline Test Result (`npm test`):** 489 tests across 142 suites — **480 passing, 9 failing**  
> **Related Documents:** [`../architecture.md`](../architecture.md), [`../refactoring-plan.md`](../refactoring-plan.md), [`../progress.md`](../progress.md)

---

## 1. Summary of Findings & Reassessment Matrix

Each finding from the initial audit has been reassessed against existing unit/integration test contracts, approved product decisions, and regression risks.

| Finding ID | Priority | Task Type(s) | Summary | Reassessment Status | Target Task(s) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`P0-01`** | **P0 (Critical)** | `BUGFIX` | Self-referential `"spendwise": "file:.."` in `client/` and `server/` breaks isolated Docker builds | **Confirmed & Refined:** Must also verify `docker compose build` and `client` Vite production build in baseline verification (`TASK-00`). | `TASK-01` |
| **`P1-01`** | **P1 (High)** | `BUGFIX` | Unauthenticated LLM execution & `HTTP 500` crash on `/api/user/chat` and `/api/assistant/chat` | **Confirmed & Refined:** Guard must be placed in `runExpenseAssistantForUser` (and non-injected `orchestrateAgentChat`) so existing unit tests in `chatOrchestrator.test.js` that pass mock `agentRunner` without `user.token` do not regress. | `TASK-04` |
| **`P1-02`** | **P1 (High)** | `BUGFIX` | Windows CRLF (`\r\n`) in `.md` prompt loaders causes 5 test failures and cross-OS prompt hash drift | **Confirmed:** Normalize `.replace(/\r\n/g, '\n')` in `ragPrompt.js`, `expenseAgentPrompt.js`, and `receiptPrompt.js`. | `TASK-02` |
| **`P1-03`** | **P1 (High)** | `BUGFIX` + `BEHAVIOR_CHANGE` | 4 failing sidebar/auth tests & admins locked out of Workspace links | **Refined per Product Decision:** Admins see both `Workspace` (`Transactions`, `Receipts`) and `Administration` sections; `CategoriesView.jsx` remains outside the sidebar; update `adminLayoutSidebar.test.js` to expect 2 workspace items while restoring legacy route normalization (`/admin.html`, `/admin`, `/analytics`) and fixing `/home` active state. | `TASK-03` |
| **`P1-04`** | **P1 (High)** | `BUGFIX` + `BEHAVIOR_CHANGE` | `ReceiptReview.jsx` suppresses `draft.warnings` and `draft.items`, and locks `showType={false}` | **Confirmed & Sequenced:** Must execute **after** receipt amount/currency normalization (`TASK-06`) so non-VND and 1000x-scaling warnings are properly surfaced and acknowledged in `ReceiptReview.jsx`. | `TASK-08` |
| **`P1-05`** | **P1 (High)** | `BUGFIX` + `REFACTOR` | Invalid calendar dates (`2026-02-30`) pass `transactionSchema`, `transactionQuerySchema`, `receiptConfirmSchema`, and `receiptGuardrails.js` | **Refined on Reassessment:** `normalizeReceiptDate` in `receipt.schemas.js` already validates calendar dates, but `receiptConfirmSchema`, `transactionSchema`, `transactionQuerySchema`, and `receiptGuardrails.js` do not. Consolidate calendar-date validation across all four. | `TASK-05` |
| **`P2-01`** | **P2 (Medium)** | `BUGFIX` | `geminiProvider.js` uses `config.geminiReceiptModel` instead of `config.geminiModel` in `generateAnswer` and `generateAnswerStream` | **Confirmed:** Simple 2-line fix in `geminiProvider.js`. | `TASK-04` |
| **`P2-02`** | **P2 (Medium)** | `BUGFIX` + `BEHAVIOR_CHANGE` | Dot-separated VND strings (`"1.250.000"`, `"45.000₫"`) fail `normalizeReceiptAmount`; zero-amount items become `null`; non-VND receipts lack warning/review gate | **Refined on Reassessment:** `normalizeReceiptAmount(0)` must remain `null` for `totalAmount` (preserving `receiptDateAndAmountRegression.test.js:113`), while line-item normalization preserves `0`. Dot-grouped thousands (`"1.250.000"`, `"45.000₫"`) must parse to `1250000` and `45000` while `"12.50"` stays `12.5`. Non-VND receipts must emit a warning and not silently pre-fill foreign amounts as VND. | `TASK-06` |
| **`P2-03`** | **P2 (Medium)** | `BUGFIX` + `DOCUMENTATION` | `docker-compose.yml` sets wrong `PROMPT_FILE` path (`/app/data/system_prompt.txt`); `README.md` references non-existent `deploy.ps1`/`deploy.sh` | **Confirmed:** Fix `PROMPT_FILE` in `docker-compose.yml` during `TASK-01`; defer `README.md` cleanup to `TASK-11`. | `TASK-01`, `TASK-11` |
| **`P2-04`** | **P2 (Medium)** | `REFACTOR` | Shared AI provider imports feature modules; features bypass `shared/integrations/ai/index.js` | **Refined (Minimal Scope):** `tests/unit/receiptServiceContract.test.js:278` imports `extractReceiptImage` directly from `geminiProvider.js`. Re-export `getGeminiClient` from `shared/integrations/ai/index.js` for feature callers, but **do not** move `extractReceiptImage` out of `geminiProvider.js` to avoid breaking test contracts. | `TASK-10` |
| **`P2-05`** | **P2 (Medium)** | `BUGFIX` | Unbounded in-memory `proposals` Map in `expenseAgent.service.js`; global upload concurrency counter in `receiptUpload.middleware.js` | **Refined:** Prune expired proposals opportunistically in `createTransactionProposal` (`TASK-07`). Keep `MAX_CONCURRENT_RECEIPT_UPLOADS = 2` unchanged because `tests/unit/receiptUpload.test.js` explicitly tests that concurrency contract. | `TASK-07` |
| **`P2-06`** | **P2 (Medium)** | `BUGFIX` | Search clear (`×`) on page 1 does not reload transactions; inconsistent `validateTransactionData` usage in `TransactionForm.jsx` and `TransactionProposalCard.jsx` | **Confirmed:** Trigger filter reload on search clear and reuse `validateTransactionData` across all three transaction entry surfaces. | `TASK-09` |
| **`P3-01`** | **P3 (Low)** | `REFACTOR` | Dead code (`pngDimensions`, `jpegDimensions`, `webpDimensions`, `createReceiptDraft`, `RECEIPT_EXTRACTION_PENDING`, unused `CategoriesView.jsx`) | **Refined:** Remove only verified dead backend helpers in Phase 4 (`TASK-10`). Keep `receiptSchema` in `expenses.schemas.js` (used by `tests/unit/expenses.test.js:70`) and keep `CategoriesView.jsx` untouched per product decision. | `TASK-10` |
| **`P3-02`** | **P3 (Low)** | `DOCUMENTATION` | Missing base `public.expense_transactions` DDL in migrations; outdated paths/counts in `README.md` and `docs/README/*` | **Refined:** Document the prerequisite `public.expense_transactions` bootstrap DDL in `IMPLEMENTATION_GUIDELINES.md` without modifying applied migrations; update docs in Phase 4 (`TASK-11`). | `TASK-11` |

---

## 2. Detailed Reassessment of Priority Areas

### 2.1 `P0-01` — Docker Build Context & Self-Dependency
- **Evidence:** [`server/package.json:33`](../../server/package.json#L33), [`client/package.json:16`](../../client/package.json#L16), [`server/package-lock.json:22`](../../server/package-lock.json#L22), [`client/package-lock.json:15`](../../client/package-lock.json#L15).
- **Reassessment:** Removing `"spendwise": "file:.."` from both `package.json` files and cleaning their lockfiles is a pure `BUGFIX`. It has zero runtime impact because neither `client/` nor `server/` imports `spendwise`.
- **Previously Overlooked Dependency:** `docker-compose.yml` also contains the broken `PROMPT_FILE: /app/data/system_prompt.txt` path (`P2-03`), which should be fixed in the same infrastructure task (`TASK-01`) so container verification succeeds end-to-end.

### 2.2 `P1-01` — Authentication Requirements Across Assistant Strategies
- **Evidence:** [`assistant.routes.js:9-13`](../../server/src/features/assistant/assistant.routes.js#L9-L13), [`assistant.service.js:16-49`](../../server/src/features/assistant/assistant.service.js#L16-L49), [`expenseAgent.service.js:114-162`](../../server/src/features/expenseAgent/expenseAgent.service.js#L114-L162).
- **Reassessment & Regression Check:**
  - `POST /api/user/chat` and `POST /api/assistant/chat` use `optionalAuthenticate`.
  - [`tests/integration/apiRoutes.test.js:58-68`](../../tests/integration/apiRoutes.test.js#L58-L68) and `line 165` send unauthenticated invalid payloads (`{ message: '   ' }`, `{ message: null }`) to `/api/user/chat` and assert `HTTP 400` from `validateChatQuery`.
  - [`tests/unit/chatOrchestrator.test.js:18`](../../tests/unit/chatOrchestrator.test.js#L18) calls `orchestrateChat('Today expenses', { agentRunner: mockAgentRunner, user: { id: 'u1' } })` (without `user.token`), and `line 99` calls `orchestrateChatStream('Hello', emit, { agentRunner: mockAgentRunner })` (without `user` at all!).
  - **Crucial Conclusion:** If we rejected missing `user.token` inside `orchestrateAgentChat` even when a custom `agentRunner` is injected, `tests/unit/chatOrchestrator.test.js` lines 18 and 99 would break! Instead:
    1. Enforce `if (!user?.id || !user?.token) throw new AppError(SERVER_MESSAGES.AUTH.AUTH_REQUIRED, HTTP_STATUS.UNAUTHORIZED);` at the entry of `runExpenseAssistantForUser` (and `searchTransactionsForUser`, `getSpendingSummaryForUser`, `createTransactionProposalForUser`) in [`expenseAgent.service.js`](../../server/src/features/expenseAgent/expenseAgent.service.js).
    2. In `orchestrateAgentChat` ([`assistant.service.js`](../../server/src/features/assistant/assistant.service.js)), when using the default `runExpenseAssistantForUser` runner and `!user?.id`, throw a 401 error before invoking the agent.
    3. Keep `rag` and `prompt` strategies compatible with existing unit/integration tests.

### 2.3 `P1-03` — Admin Navigation & Legacy Route Compatibility
- **Evidence:** [`sidebarConfig.js:7-84`](../../client/src/layouts/sidebarConfig.js#L7-L84), [`AppSidebar.jsx:71-107`](../../client/src/layouts/AppSidebar.jsx#L71-L107), [`supabaseAuth.js:27-34`](../../client/src/shared/services/supabaseAuth.js#L27-L34), [`adminLayoutSidebar.test.js`](../../tests/unit/adminLayoutSidebar.test.js), [`clientAuth.test.js`](../../tests/unit/clientAuth.test.js).
- **Reassessment per Approved Product Decisions:**
  - Classification: **`BUGFIX` + `BEHAVIOR_CHANGE`**.
  - `WORKSPACE_NAV_ITEMS` in `sidebarConfig.js` must contain the 2 active workspace items: `Transactions` (`id: 'transactions'`, `view: 'transactions'`) and `Receipts` (`id: 'receipts'`, `view: 'receipts'`). `CategoriesView.jsx` stays outside the sidebar.
  - `AppSidebar.jsx` must render the `Workspace` section for **all** authenticated users (including admins) and render the `Administration` section (`Knowledge Base`, `Analytics`) additionally when `admin === true`.
  - `isWorkspaceItemActive(item, currentPath, activeView)` must return `false` unless `currentPath` is `/expenses` or `/workspace` (preventing `/home` from highlighting `Transactions`).
  - `isAdminItemActive` in `sidebarConfig.js` must support legacy paths `/admin` (activating Knowledge Base) and `/analytics` (activating Analytics), and `safeNextPath` in `supabaseAuth.js` must normalize `/admin.html` → `/admin/knowledge-base`.
  - `tests/unit/adminLayoutSidebar.test.js` must be updated to expect 2 workspace items (`['transactions', 'receipts']`) while verifying both sections render for admins and active states work across `/home`, `/expenses`, `/admin/knowledge-base`, `/admin/analytics`, `/admin`, and `/analytics`.

### 2.4 `P1-04` & `P2-02` — Receipt Normalization, Non-VND Handling & Human Confirmation
- **Evidence:** [`receipt.schemas.js:76-222`](../../server/src/features/expenses/receipt.schemas.js#L76-L222), [`receipt.service.js:70-79`](../../server/src/features/expenses/receipt.service.js#L70-L79), [`ReceiptReview.jsx:5-100`](../../client/src/features/receipts/ReceiptReview.jsx#L5-L100).
- **Reassessment & Sequencing:**
  - **Dependency:** Backend normalization (`TASK-06`) **must** precede frontend `ReceiptReview.jsx` updates (`TASK-08`).
  - **Dot-Separated Amount Parsing (`normalizeReceiptAmount`):**
    - Must parse `"1.250.000"` → `1250000` and `"45.000₫"` → `45000`.
    - Must preserve decimal semantics for `"12.50"` → `12.5` and `42.5` → `42.5`.
    - Specifically: after stripping currency symbols/codes (`$₫€£¥|VND|USD|EUR`) and whitespace:
      - If the string matches multiple dot-thousand groups (`/^[+-]?\d{1,3}(\.\d{3})+$/`) OR matches a single dot-thousand group (`/^[+-]?\d{1,3}\.\d{3}$/`) when a VND marker (`₫` or `VND`) was present in the input string (or when no comma is present and it matches `/^\d{1,3}(\.\d{3})+$/`), strip the dots before `Number()`.
      - If the string has 1 or 2 decimal digits after a single dot (e.g., `"12.50"`, `"42.5"`), parse as standard decimal `12.5` / `42.5`.
  - **Zero-Value Line Items:**
    - `normalizeReceiptAmount(0)` must continue to return `null` so `totalAmount: 0` is rejected (`tests/unit/receiptDateAndAmountRegression.test.js:113`).
    - Introduce `normalizeReceiptItemAmount(value)` (or `{ allowZero: true }`) inside `normalizeReceiptItems` (`receipt.schemas.js:90-100`) so a line item with `amount: 0` or `"0"` remains `0` instead of becoming `null`.
  - **Non-VND Currency Handling:**
    - When `extraction.currency !== 'VND'`, `receiptExtractionSchema` must append a warning: `"Receipt currency is ${extraction.currency}. SpendWise records transactions in VND; please review and enter the VND amount before confirming."`
    - In `toDraft(extraction)` (`receipt.service.js:70-79`), when `extraction.currency && extraction.currency !== 'VND'`, do **not** silently populate the foreign-currency number into `draft.amount`; set `draft.amount = ''` and `draft.foreignAmount = extraction.totalAmount` so the user is forced to enter/confirm the VND amount explicitly.
    - In `receiptConfirmSchema` (`receipt.schemas.js:204-222`), reject confirmation if `currency` is explicitly passed as a non-VND currency without confirmation override, or ensure `ReceiptReview.jsx` requires explicit user review of warnings and VND amount entry.
  - **ReceiptReview UI (`TASK-08`):**
    - Render `draft.warnings` in an alert banner and display extracted `draft.items` when present.
    - Enable `showType={true}` on `TransactionFields` so users can review/switch `expense` vs. `income`, and normalize initial `category` in `buildInitialForm` using `categoriesForType` so an invalid category/type pairing never desynchronizes the `<select>`.

### 2.5 `P1-05` — Shared Calendar-Date Validation
- **Evidence:** [`expenses.schemas.js:11-24`](../../server/src/features/expenses/expenses.schemas.js#L11-L24), [`receipt.schemas.js:25-30`](../../server/src/features/expenses/receipt.schemas.js#L25-L30) and `line 208`, [`receiptGuardrails.js:49-56`](../../server/src/features/expenses/receiptGuardrails.js#L49-L56), [`expenseAgent.schemas.js:6-9`](../../server/src/features/expenseAgent/expenseAgent.schemas.js#L6-L9).
- **Reassessment:**
  - `normalizeReceiptDate` in `receipt.schemas.js` already rejects `2026-02-30` and accepts leap day `2024-02-29`.
  - However, `receiptConfirmSchema` (`receipt.schemas.js:208`), `transactionSchema` (`expenses.schemas.js:11`), and `transactionQuerySchema` (`expenses.schemas.js:22-23`) only check `/^\d{4}-\d{2}-\d{2}$/`, allowing `2026-02-30` to reach PostgreSQL and cause an unhandled `HTTP 500`.
  - Additionally, `validateReceiptExtraction` in `receiptGuardrails.js:50` uses `new Date(`${dateStr}T00:00:00Z`)`, which silently rolls `2026-02-30` over to `2026-03-02` instead of rejecting it with `ReceiptGuardrailError('INVALID_DATE')`.
  - **Fix:** Validate calendar dates (`isValidIsoCalendarDate`) in `expenses.schemas.js`, `receipt.schemas.js` (`receiptConfirmSchema`), and `receiptGuardrails.js`.

### 2.6 `P2-04` — AI Provider Dependency Boundaries
- **Reassessment:** [`tests/unit/receiptServiceContract.test.js:278`](../../tests/unit/receiptServiceContract.test.js#L278) dynamically imports `{ extractReceiptImage, setAIClientForTests }` directly from `server/src/shared/integrations/ai/providers/geminiProvider.js`. Moving `extractReceiptImage` out of `geminiProvider.js` would break that test. Therefore, keep `extractReceiptImage` in `geminiProvider.js` and limit `P2-04` refactoring to exporting `getGeminiClient` from `shared/integrations/ai/index.js` so `assistant.service.js` and `geminiExpenseAgent.js` import through `shared/integrations/ai/index.js`.

### 2.7 `P2-05` — In-Memory Proposal Lifecycle & Upload Concurrency
- **Reassessment:**
  - Opportunistically sweeping expired proposals inside `createTransactionProposal` (`expenseAgent.service.js`) is safe and prevents memory leaks while preserving all tests in `tests/unit/transactionProposal.test.js` (including `setProposalClockForTests`).
  - Global upload concurrency (`MAX_CONCURRENT_RECEIPT_UPLOADS = 2` in `receiptUpload.middleware.js`) must remain unchanged for this iteration because `tests/unit/receiptUpload.test.js` tests the exact 2-upload cap.

### 2.8 `P3-02` — Fresh Supabase Environment Provisioning
- **Reassessment:** Do not alter existing migration files in `supabase/migrations/`. Document the idempotent `CREATE TABLE IF NOT EXISTS public.expense_transactions` bootstrap SQL in `IMPLEMENTATION_GUIDELINES.md` so any new developer or grader provisioning a fresh Supabase project can run it prior to applying `supabase/migrations/`.
