# Codebase Duplication & Reuse Audit: SpendWise Platform

> **Status**: Verified against active repository code (Post-Refactoring Audit)
> **Date**: October 2026
> **Audit Type**: Verification of duplication resolution, regression analysis, and prioritization of remaining opportunities.

---

## 1. Executive Summary

This re-audit evaluated the complete codebase (`client/`, `server/`, `tests/`, `evals/`, `supabase/`, `data/`) following recent refactoring iterations.

All **7 of the original primary duplication findings** have been confirmed resolved through targeted extraction and reuse of existing components, hooks, schemas, and error utilities. In addition, confirmed growth-risk duplications in query-string serialization and pagination validation have been consolidated.

No regressions, circular dependencies, or stale imports were introduced. The full test suite (261 unit tests, 31 integration tests) and production client build pass cleanly.

### Summary of Resolved & Prioritized Findings

| Item | Area | Initial Status | Verified Current Status | Resolution Mechanism |
| :--- | :--- | :--- | :--- | :--- |
| **Finding 1** | HTTP Client & 401 Interception | Confirmed Duplication | **Resolved** | [expenseApi.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/services/expenseApi.js) delegates to [apiClient.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/services/apiClient.js) with centralized 401 sign-out. |
| **Finding 2** | Session Gates & Route Protection | Confirmed Duplication | **Resolved** | Extracted [useSession](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/hooks/useSession.js) hook for Supabase subscription, validation, and cleanup. |
| **Finding 3** | Table Controls in TransactionTable | Confirmed Duplication | **Resolved** | [TransactionTable.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/components/expense/TransactionTable.jsx) reuses [Pagination.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/components/common/Pagination.jsx), [SortableHeader.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/components/common/SortableHeader.jsx), and [SearchInput.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/components/common/SearchInput.jsx). |
| **Finding 4** | Transaction & Receipt Field Inputs | Confirmed Duplication | **Resolved** | Extracted [TransactionFields.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/components/expense/TransactionFields.jsx) and shared form utilities. |
| **Finding 5** | AI Client & Telemetry Tracking | Confirmed Duplication | **Resolved** | [geminiExpenseAgent.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/server/src/features/expenseAgent/geminiExpenseAgent.js) reuses `getAIClient()`, retry utilities, and instruments `safeRecordUsage()`. |
| **Finding 6** | Database Error Handling | Confirmed Duplication | **Resolved** | Extracted [DatabaseError](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/server/src/shared/errors/AppError.js#L78) and [handleDatabaseError](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/server/src/shared/errors/AppError.js#L98) in [AppError.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/server/src/shared/errors/AppError.js). |
| **Finding 7** | Auth Email & Password Validation | Confirmed Duplication | **Resolved** | [AuthPage.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/components/auth/AuthPage.jsx) and [ResetPasswordPage.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/components/auth/ResetPasswordPage.jsx) reuse [validation.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/utils/validation.js). |
| **Growth Risk A** | Backend Pagination Validation | Potential Duplication | **Resolved** | Extracted [zodIntegerParam](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/server/src/shared/validation/pagination.js#L57) in [pagination.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/server/src/shared/validation/pagination.js); unified KB, Analytics, and Expenses. |
| **Growth Risk B** | URL Query String Serializers | Potential Duplication | **Resolved** | Extracted [toQueryString](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/utils/collectionUtils.js#L221) in [collectionUtils.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/utils/collectionUtils.js); unified Analytics and Expense APIs. |
| **Growth Risk C** | AI Rate Limiting Protection | Security / Reliability | **Resolved** | Implemented dedicated [expenseAgentRateLimiter](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/server/src/shared/middleware/rateLimiter.js#L67), [receiptOcrRateLimiter](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/server/src/shared/middleware/rateLimiter.js#L78), and user-aware [resolveRateLimitKey](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/server/src/shared/middleware/rateLimiter.js#L13). |
| **Remaining 1** | Root Toast Provider Mount | Architecture Consistency | **Open (Medium/Low Priority)** | [ToastProvider](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/context/ToastContext.jsx) mounted in HandbookLayout; Expense & Auth use local banner state. |

---

## 2. Re-Audit of Original Findings

### Finding 1: Private HTTP Request Function in `expenseApi.js` vs Shared `apiClient.js`
- **Classification**: **Resolved**
- **Verification Evidence**:
  - [expenseApi.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/services/expenseApi.js) imports `apiRequest` and `apiJsonRequest` from [apiClient.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/services/apiClient.js). The private `request()` helper has been completely removed.
  - [apiClient.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/services/apiClient.js#L5-L20) implements `handleUnauthorized()`, which signs out on HTTP 401 and emits the `spendwise:unauthorized` event with debounce protection.
- **Architectural Assessment**: Preserves uniform session invalidation across all feature APIs (`documentsApi`, `systemPromptApi`, `knowledgeBaseApi`, `analyticsApi`, and `expenseApi`).

---

### Finding 2: Session Subscription and Gate Lifecycle in `AdminRouteGuard` and `AuthenticatedRouteGuard`
- **Classification**: **Resolved**
- **Verification Evidence**:
  - [useSession.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/hooks/useSession.js) encapsulates Supabase session initialization, auth state change subscription, cleanup on unmount, and unauthorized callbacks.
  - [AdminRouteGuard.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/components/admin/AdminRouteGuard.jsx#L38-L41) and [AuthenticatedRouteGuard.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/components/expense/AuthenticatedRouteGuard.jsx#L28-L31) both call `useSession()`.
- **Architectural Assessment**: Gates retain their distinct authorization rules (Admin requires `'admin'` metadata role; Expense allows any authenticated user) and domain-specific loading shells without duplicating subscription plumbing.

---

### Finding 3: Table Controls in `TransactionTable.jsx` vs Reusable Common Components
- **Classification**: **Resolved**
- **Verification Evidence**:
  - [TransactionTable.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/components/expense/TransactionTable.jsx) imports and renders:
    - [SearchInput.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/components/common/SearchInput.jsx) for merchant/note filtering.
    - [SortableHeader.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/components/common/SortableHeader.jsx) on `Date` and `Amount` headers.
    - [Pagination.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/components/common/Pagination.jsx) with total item count and responsive page navigation.
  - Server-side query coordinates sorting and pagination at the HTTP boundary, avoiding accidental client-side sorting of paginated slices.
- **Architectural Assessment**: Visual styling, keyboard accessibility, and ARIA attributes are aligned across admin and expense tables without generic over-abstraction.

---

### Finding 4: Form Input Markup Across `TransactionForm`, `ReceiptReview`, and Assistant `Proposal`
- **Classification**: **Resolved**
- **Verification Evidence**:
  - [TransactionFields.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/components/expense/TransactionFields.jsx) and [transactionFields.utils.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/components/expense/transactionFields.utils.js) centralize the 6 financial input fields (`type`, `amount`, `date`, `category`, `merchant`, `note`), category-per-type transitions, and field validations.
  - Reused across:
    - [TransactionForm.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/components/expense/TransactionForm.jsx#L39-L43) (modal creation & editing).
    - [ReceiptReview.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/components/expense/ReceiptReview.jsx#L64-L71) (receipt image draft confirmation).
    - [AiExpenseAssistant.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/components/expense/AiExpenseAssistant.jsx#L123-L132) (AI proposal review card).
- **Architectural Assessment**: Form submission, receipt confirmation, and AI proposal lifecycles remain completely decoupled while eliminating field-level divergence.

---

### Finding 5: AI Client Initialization & Telemetry Tracking in `geminiExpenseAgent.js`
- **Classification**: **Resolved**
- **Verification Evidence**:
  - [geminiExpenseAgent.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/server/src/features/expenseAgent/geminiExpenseAgent.js#L63-L66) reuses `getAIClient()` and `executeWithRetry()` from the shared AI integration layer.
  - Every agent request (tool selection step and summary step) invokes `safeRecordUsage()`, logging duration, attempts, prompt hash, outcomes, and token usage into the admin telemetry system.
- **Architectural Assessment**: Eliminates independent client instantiation and provides full observability for Expense Assistant interactions in the admin analytics dashboard.

---

### Finding 6: Ad-hoc Database Error Wrapping in Expense Services
- **Classification**: **Resolved**
- **Verification Evidence**:
  - [AppError.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/server/src/shared/errors/AppError.js#L78-L111) defines `DatabaseError` (HTTP 500, operational) and `handleDatabaseError(serviceName, operation, error, clientMessage)`.
  - Re-exported from [server/src/shared/errors/index.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/server/src/shared/errors/index.js#L8-L9).
  - [expenses.service.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/server/src/features/expenses/expenses.service.js#L18-L20) and [receipt.service.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/server/src/features/expenses/receipt.service.js#L22-L24) delegate to `handleDatabaseError`.
- **Architectural Assessment**: Standardizes server-side Postgres diagnostic logging (`code`, `message`, `details`, `hint`) while consistently shielding internal database details from client responses.

---

### Finding 7: Email and Password Validation Logic in Auth Components
- **Classification**: **Resolved**
- **Verification Evidence**:
  - [AuthPage.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/components/auth/AuthPage.jsx#L11) imports `validateEmail` and `validateStringLength` from [validation.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/utils/validation.js) and applies them in `validate(form, mode)`.
  - [ResetPasswordPage.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/components/auth/ResetPasswordPage.jsx#L4) imports and applies `validateStringLength` for password length validation.
- **Architectural Assessment**: Eliminates duplicate inline regular expressions and aligns client validation rules with tested utilities.

---

## 3. Prioritized Remaining Opportunities & Growth Risks

### Growth Risk C: AI Rate Limiting for Expense Agent & Receipt Upload
- **Current Status**: **Resolved**
- **Verification Evidence**:
  - [rateLimiter.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/server/src/shared/middleware/rateLimiter.js) implements dedicated limiters:
    - [chatRateLimiter](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/server/src/shared/middleware/rateLimiter.js#L56) (30 req / min) for Handbook chat & streams.
    - [expenseAgentRateLimiter](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/server/src/shared/middleware/rateLimiter.js#L67) (30 req / min) protecting `/api/expense-agent/search`, `/summary`, `/assistant`, and `/create-proposal`.
    - [receiptOcrRateLimiter](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/server/src/shared/middleware/rateLimiter.js#L78) (15 req / min) protecting `/api/receipts/upload` (evaluated before multer file ingestion) and `/api/receipts/:id/retry`.
  - [resolveRateLimitKey](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/server/src/shared/middleware/rateLimiter.js#L13) keys authenticated users by `user:<id>` so callers receive dedicated quotas without IP collision, falling back to IPv6-normalized client IPs for guests.
  - Limits are configured in [RATE_LIMIT_CONFIG](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/server/src/constants/config.js#L70) and exposed via [config.rateLimits](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/server/src/config.js#L35).

---

### Remaining Issue 1 (Medium / Low Priority): Root Mount of `ToastProvider`
- **Current Status**: **Still Unconsolidated / Architecture Consistency**
- **Evidence**:
  - [ToastProvider](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/context/ToastContext.jsx#L9) is mounted only inside [HandbookLayout.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/components/HandbookLayout.jsx#L28).
  - Expense Tracker views (`ExpensePage`) and Auth views (`AuthPage`) manage local error and notification banner state (`<div className="expense-banner">{error}</div>`).
- **Recommended Action**:
  - Mount `ToastProvider` at root level in `App.jsx` to allow transient feedback (e.g., "Transaction saved", "Receipt deleted") to persist across route navigations if desired.
  - Keep inline validation error messages next to form fields (do not replace field errors with toasts).

---

### Reclassified: Items No Longer Recommended for Consolidation
1. **Loading / Empty States in Tables**:
   - *Status*: **No longer recommended for abstraction**.
   - *Rationale*: Table rows (`<tr><td className="empty">...</td></tr>`), card lists, and chat cards have distinct DOM semantics and layout constraints. Forcing a generic wrapper would add JSX indirection without meaningful maintenance benefits.
2. **Drawer vs Modal Backdrop**:
   - *Status*: **Intentional Separation**.
   - *Rationale*: Admin drawer is a persistent right slide-out panel allowing background inspection, while the expense transaction modal is an accessible dialog requiring focal trap and backdrop click-dismissal.

---

## 4. Intentional Architectural Separations (Preserve Boundaries)

1. **Demo Role Switching (`/demo`, `/handbook`) vs Real Account Role Management (`set-user-role.js`)**:
   - Demo mode is a client presentation feature that toggles local React state without active credentials. Real account role management alters Supabase `app_metadata.role` using server-side service credentials. These must never be unified.
2. **Handbook RAG Chunks vs Expense Receipts Storage**:
   - Handbook chunks are vectorized in Qdrant Cloud using 3072-dim embeddings for semantic similarity search over static institutional documents. Receipts are user-owned multimodal images stored in Supabase Storage with metadata in PostgreSQL RLS tables. Lifecycle and retention rules are fundamentally different.
3. **Admin Analytics (`ai_usage_analytics`) vs Personal Expense Transactions (`expense_transactions`)**:
   - AI usage analytics is system telemetry tracking model costs and latencies for administrators. Expense transactions represent private student financial data protected by strict user-level RLS. Sharing database structures or query handlers would violate tenant isolation.

---

## 5. Verification Matrix & Health Status

| Check | Target / Suite | Command | Observed Result |
| :--- | :--- | :--- | :--- |
| **Focused Unit Tests** | AI Rate Limiting Suite | `node --test tests/unit/aiRateLimiter.test.js` | **14 passed, 0 failed** (Quotas, limit exhaustion, user isolation, route stacks) |
| **Focused Unit Tests** | Shared Duplications Refactor | `node --test tests/unit/sharedDuplicationRefactor.test.js` | **13 passed, 0 failed** (Database errors, Zod pagination bounds, query string) |
| **All Unit Tests** | Full Client & Server Suite | `npm run test:unit` | **275 passed, 0 failed (34 suites)** |
| **All Integration Tests** | Full Pipeline Suite | `npm run test:integration` | **31 passed, 0 failed (10 suites)** |
| **Import Integrity** | Server, Client, Tests | `node check_imports.js` | **0 broken imports** across all folders |
| **Circular Dependencies** | Full Dependency Graph | `node detect_cycles.js` / `check_client_cycles.js` | **0 cycles detected (Clean DAG)** |
| **Frontend Production Build** | Vite Client Bundle | `npm --prefix client run build` | **Built cleanly in 11.82s, 0 errors** |
| **Whitespace / Lint Diff** | Working Tree | `git diff --check` | **Clean, 0 errors / warnings** |
| **Git Safety** | Working Tree & Remote | `git status` | **No commits or pushes performed** |
