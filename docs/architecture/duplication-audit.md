# Codebase Duplication & Reuse Audit: Student Handbook Assistant & SpendWise

> **Status**: Verified against active repository code  
> **Date**: October 2026  
> **Audit Type**: Read-only codebase duplication & reuse opportunity assessment.

---

## 1. Executive Summary

This audit evaluated the complete codebase (`client/`, `server/`, `tests/`, `evals/`, `supabase/`, `data/`) to identify confirmed duplication, incomplete reuse of established abstractions, and potential risks of logic divergence as the project scales.

### Key Audit Findings
1. **HTTP Client & 401 Interception**: [expenseApi.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/services/expenseApi.js) reimplements a private `request()` function with Bearer token injection, duplicating [apiClient.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/services/apiClient.js) while only `expenseApi` handles 401 auto-signout.
2. **Session Gates & Route Protection**: [AdminSessionGate.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/components/admin/AdminSessionGate.jsx) and [ExpenseSessionGate.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/components/expense/ExpenseSessionGate.jsx) duplicate Supabase session retrieval, auth state change subscription, cleanup, and redirection handling.
3. **Table Pagination, Search & Headers**: [DocumentTable.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/components/admin/DocumentTable.jsx), [AnalyticsHistoryTable.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/components/admin/analytics/AnalyticsHistoryTable.jsx), and [ChunkReview.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/components/admin/ChunkReview.jsx) successfully reuse shared primitives ([Pagination.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/components/common/Pagination.jsx), [SortableHeader.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/components/common/SortableHeader.jsx), [SearchInput.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/components/common/SearchInput.jsx)), but [TransactionTable.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/components/expense/TransactionTable.jsx) manually reimplements custom search, sort buttons, and pagination buttons.
4. **Transaction & Receipt Field Forms**: Core financial input fields (type, amount, date, category, merchant, note) are duplicated across [TransactionForm.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/components/expense/TransactionForm.jsx), [ReceiptReview.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/components/expense/ReceiptReview.jsx), and the `Proposal` component inside [AiExpenseAssistant.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/components/expense/AiExpenseAssistant.jsx).
5. **AI Telemetry & Provider Isolation Gap**: While [geminiProvider.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/server/src/shared/integrations/ai/providers/geminiProvider.js) instruments all calls (`embedText`, `generateAnswer`, `extractReceiptImage`) with exponential backoff retry and `recordUsage()`, [geminiExpenseAgent.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/server/src/features/expenseAgent/geminiExpenseAgent.js) initializes its own `GoogleGenAI` instance, lacks retry logic, and completely bypasses `recordUsage()`.
6. **Backend Query Pagination Coercion**: Four different features validate pagination query parameters in four different ways across Zod schemas (`.transform(parseIntegerParam)`, `z.preprocess`, `z.coerce.number()`, and raw `z.number().int()`).

---

## 2. Confirmed Duplications & Reusable Implementations

### Finding 1: Private HTTP Request Function in `expenseApi.js` vs Shared `apiClient.js`
- **Classification**: Confirmed Duplication
- **Evidence**:
  - `client/src/services/expenseApi.js` (lines 3–18):
    ```javascript
    const request = async (url, options = {}) => {
      const token = await getAccessToken();
      const headers = new Headers(options.headers);
      if (!(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
      if (token) headers.set('Authorization', `Bearer ${token}`);
      const response = await fetch(url, { ...options, headers });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) {
          await signOut();
          window.dispatchEvent(new CustomEvent('spendwise:unauthorized'));
        }
        throw new Error(body.error || 'Request failed.');
      }
      return body;
    };
    ```
  - `client/src/services/apiClient.js` (lines 16–41):
    ```javascript
    export async function apiRequest(url, options = {}, fallbackError) {
      const token = await getAccessToken();
      const headers = new Headers(options.headers);
      if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      const res = await fetch(url, { ...options, headers });
      const data = await res.json().catch(() => ({}));
      ...
    }
    ```
- **Existing Implementation to Reuse**: [apiClient.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/services/apiClient.js).
- **Recommended Action**:
  - Enhance `apiClient.js` to automatically handle HTTP 401 responses (calling `signOut()` and dispatching the unauthorized event).
  - Refactor `expenseApi.js` to call `apiRequest` and `apiJsonRequest`, deleting its private `request()` function.
- **Why This Reduces Duplication Without Premature Abstraction**:
  - Eliminates 16 lines of boilerplate fetch code.
  - Ensures all API services (`documentsApi`, `systemPromptApi`, `knowledgeBaseApi`, `analyticsApi`, `expenseApi`) behave consistently upon session expiration (auto-logout on 401).

---

### Finding 2: Session Subscription and Gate Lifecycle in `AdminSessionGate` and `ExpenseSessionGate`
- **Classification**: Confirmed Duplication
- **Evidence**:
  - `client/src/components/admin/AdminSessionGate.jsx` (lines 28–55):
    - Checks `!isSupabaseConfigured || !supabase`.
    - Declares `let active = true`.
    - Calls `supabase.auth.getSession()` and `supabase.auth.onAuthStateChange()`.
    - Cleans up with `subscription.unsubscribe()`.
    - Renders loading fallback: `<main className="admin-gate"><p>Checking administrator access…</p></main>`.
  - `client/src/components/expense/ExpenseSessionGate.jsx` (lines 12–44):
    - Checks `!isSupabaseConfigured || !supabase`.
    - Declares `let active = true`.
    - Calls `supabase.auth.getSession()` and `supabase.auth.onAuthStateChange()`.
    - Cleans up with `subscription.unsubscribe()`.
    - Renders loading fallback: `<main className="expense-shell">...<p>Checking your session…</p></main>`.
- **Existing Implementation to Reuse**: None; logic is mirrored between the two gates.
- **Recommended Action**:
  - Extract a custom hook `useSession({ requiredRole, onUnauthorized })` in `client/src/hooks/useSession.js`.
  - The hook encapsulates the Supabase auth subscription, active flag, unsubscribe cleanup, and role verification.
  - Both gates become concise wrappers defining only their page-specific loading markup and destination routes.
- **Why This Reduces Duplication Without Premature Abstraction**:
  - Eliminates duplicated reactive session management and edge-case subscription leaks.
  - Preserves route-specific differences (Admin workspace requires `'admin'` role; Expense workspace allows any authenticated user).

---

### Finding 3: Table Controls in `TransactionTable.jsx` vs Reusable Common Components
- **Classification**: Confirmed Duplication / Under-reuse
- **Evidence**:
  - `client/src/components/expense/TransactionTable.jsx` (lines 111–114, 176–207):
    - Hand-rolls a sort button: `<button className="sort-button" onClick={toggleAmountSort}>Amount ↕</button>`.
    - Hand-rolls pagination controls:
      ```jsx
      <footer className="pagination">
        <span>{data.total} transaction{data.total === 1 ? '' : 's'}</span>
        <div>
          <button disabled={data.page <= 1} onClick={...}>Previous</button>
          <span>Page {data.page}</span>
          <button disabled={data.page * data.pageSize >= data.total} onClick={...}>Next</button>
        </div>
      </footer>
      ```
  - Meanwhile, [DocumentTable.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/components/admin/DocumentTable.jsx), [AnalyticsHistoryTable.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/components/admin/analytics/AnalyticsHistoryTable.jsx), and [ChunkReview.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/components/admin/ChunkReview.jsx) all reuse:
    - [Pagination.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/components/common/Pagination.jsx)
    - [SortableHeader.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/components/common/SortableHeader.jsx)
    - [SearchInput.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/components/common/SearchInput.jsx)
- **Existing Implementation to Reuse**: `client/src/components/common/Pagination.jsx` and `SortableHeader.jsx`.
- **Recommended Action**:
  - Replace the custom pagination markup in `TransactionTable.jsx` with `<Pagination page={data.page} limit={data.pageSize} total={data.total} onPageChange={...} />`.
  - Replace `<button className="sort-button">` with `<SortableHeader columnKey="amount" currentSortKey={filters.sortBy} currentDirection={filters.sortOrder} onSort={...}>Amount</SortableHeader>`.
- **Why This Reduces Duplication Without Premature Abstraction**:
  - Aligns keyboard navigation, ARIA attributes, and disabled states across the entire application.
  - Reuses existing CSS classes from `tables.css`.

---

### Finding 4: Form Input Markup Across `TransactionForm`, `ReceiptReview`, and Assistant `Proposal`
- **Classification**: Confirmed Duplication
- **Evidence**:
  - `client/src/components/expense/TransactionForm.jsx` (lines 53–85):
    - Renders inputs for: `type`, `amount`, `date`, `category`, `merchant`, `note`.
  - `client/src/components/expense/ReceiptReview.jsx` (lines 62–98):
    - Renders inputs for: `type`, `amount`, `date`, `category`, `merchant`, `note`.
  - `client/src/components/expense/AiExpenseAssistant.jsx` (lines 127–167, `Proposal` subcomponent):
    - Renders inputs for: `type`, `amount`, `date`, `category`, `merchant`, `note`.
  - Each of the three independently calls `categoriesForType(EXPENSE_CATEGORIES, type)`, sets up change handlers, and formats numeric input.
- **Existing Implementation to Reuse**: [TransactionForm.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/components/expense/TransactionForm.jsx).
- **Recommended Action**:
  - Extract a shared presentational component `TransactionFields.jsx` in `client/src/components/expense/TransactionFields.jsx`.
  - `TransactionForm`, `ReceiptReview`, and `Proposal` supply their own wrapper buttons and submission handlers while sharing the form fields.
- **Why This Reduces Duplication Without Premature Abstraction**:
  - Eliminates 3x duplication of the 6 core transaction inputs.
  - Prevents discrepancies where a new category or validation rule is added to one form but forgotten in the others.

---

### Finding 5: AI Client Initialization & Telemetry Tracking in `geminiExpenseAgent.js`
- **Classification**: Confirmed Architecture Duplication & Telemetry Gap
- **Evidence**:
  - `server/src/shared/integrations/ai/providers/geminiProvider.js` (lines 15–23, 35–92):
    - Centralizes `new GoogleGenAI({ apiKey: config.geminiApiKey })`.
    - Wraps operations in `executeWithRetry()` handling transient 429/503 errors.
    - Captures `tokenUsage`, latency, attempts, and calls `recordUsage()`.
  - `server/src/features/expenseAgent/geminiExpenseAgent.js` (lines 62–66, 101–124):
    - Creates its own independent client: `new GoogleGenAI({ apiKey: config.geminiApiKey })`.
    - Uses plain `withTimeout()` without retry for transient quota errors.
    - **Does not invoke `recordUsage()`**. The two Gemini calls made during every assistant invocation (function calling + summary generation) are completely invisible in the admin analytics dashboard!
- **Existing Implementation to Reuse**: `server/src/shared/integrations/ai/providers/geminiProvider.js` and `server/src/features/analytics/usageTracker.js`.
- **Recommended Action**:
  - Expose a multi-tool agent execution helper in `server/src/shared/integrations/ai/index.js` or wrap `runGeminiExpenseAgent` with `recordUsage()`.
  - Reuse `getAIClient()` and retry utilities from `geminiProvider.js`.
- **Why This Reduces Duplication Without Premature Abstraction**:
  - Brings full telemetry visibility to the SpendWise Assistant.
  - Ensures resilient error handling and consistent API key verification across all AI features.

---

### Finding 6: Ad-hoc Database Error Wrapping in Expense Services
- **Classification**: Confirmed Duplication
- **Evidence**:
  - `server/src/features/expenses/expenses.service.js` (lines 19–27):
    ```javascript
    function databaseError(error, operation = 'database operation') {
      console.error(`[ExpenseService] ${operation} failed`, { ... });
      return new AppError('Expense persistence is temporarily unavailable.', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
    ```
  - `server/src/features/expenses/receipt.service.js` (lines 12–22):
    ```javascript
    function dbError(operation, error) {
      console.error(`[ReceiptService] ${operation} failed`, { ... });
      return new AppError('Receipt service is temporarily unavailable.', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
    ```
- **Existing Implementation to Reuse**: [AppError.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/server/src/shared/errors/AppError.js) exports `DatabaseError`.
- **Recommended Action**:
  - Consolidate error logging and conversion into a shared helper `handleDatabaseError(error, context)` or standardize on `new DatabaseError()`.
- **Why This Reduces Duplication Without Premature Abstraction**:
  - Avoids repeating identical `console.error` metadata structuring across service files.

---

### Finding 7: Email and Password Validation Logic in Auth Components
- **Classification**: Confirmed Duplication
- **Evidence**:
  - `client/src/components/auth/AuthPage.jsx` (lines 14, 27–34):
    ```javascript
    const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!EMAIL_PATTERN.test(form.email)) errors.email = 'Enter a valid email address.';
    if (mode !== 'forgot' && form.password.length < 8) errors.password = 'Use at least 8 characters.';
    ```
  - `client/src/components/auth/ResetPasswordPage.jsx` (lines 40–47):
    ```javascript
    if (password.length < 8) { setError('Use at least 8 characters.'); return; }
    if (password !== confirmation) { setError('Passwords do not match.'); return; }
    ```
  - `client/src/utils/validation.js` (lines 52–83):
    - Already defines and tests `validateEmail(value)` and `validateStringLength(value, { min: 8 })`.
- **Existing Implementation to Reuse**: [validation.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/utils/validation.js).
- **Recommended Action**:
  - Import `validateEmail` and `validateStringLength` from `client/src/utils/validation.js` in `AuthPage.jsx` and `ResetPasswordPage.jsx`.
- **Why This Reduces Duplication Without Premature Abstraction**:
  - Reuses existing tested utility functions and eliminates redundant regex declarations.

---

## 3. Potential Shared Capabilities (Growth Risks)

| Capability Area | Current State & Evidence | Risk Assessment | Recommended Future Action |
| :--- | :--- | :--- | :--- |
| **Toast Notifications vs Local Error Banners** | `ToastProvider` is only mounted in `HandbookLayout.jsx`. `ExpenseTrackerApp` and `AuthPage` use local state error banners (`{error && <div className="expense-banner">{error}</div>}`). | Moderate: Notifications cannot cross page transitions or provide unified timing. | Mount `ToastProvider` at root `App.jsx` level so all views can call `useToast()`. |
| **Backend Query Pagination Coercion** | `knowledgeBase.schemas.js` uses `.transform(parseIntegerParam)`; `analytics.schemas.js` uses `z.preprocess`; `expenses.schemas.js` uses `z.coerce.number()`. | Moderate: Slight behavioral differences in how invalid strings or arrays are clamped. | Extract `zodPaginationQuerySchema({ defaultLimit, maxLimit })` into `validateRequest.js`. |
| **AI Rate Limiting** | `chatRateLimiter` (30 req/min) protects `/api/user/chat` and `/stream`. But `/api/expense-agent/*` and `/api/receipts/upload` are only covered by general `apiRateLimiter` (300 req/15 min). | High: Multi-tool expense agent calls Gemini twice per request; vulnerable to rapid quota exhaustion. | Apply `chatRateLimiter` to `/api/expense-agent/*` and `/api/receipts/upload`. |
| **Loading / Empty States in Tables** | `DocumentTable`, `TransactionTable`, `AnalyticsHistoryTable`, and `ChunkReview` all render inline `<tr><td className="empty">Loading...</td></tr>` or `<div className="empty-state">`. | Low: Minor cosmetic divergence in spinner markup and empty messages. | Keep separate for now; table and card list layouts differ in markup requirements. |
| **Drawer vs Modal Backdrop** | `Drawer.jsx` is used for Admin Knowledge panels. `AiExpenseAssistant` and `TransactionForm` use custom CSS classes (`.expense-modal-backdrop`, `.agent-drawer`). | Low: Admin drawer is slide-out from right; transaction form is a centered modal dialog. | Keep separate. Centered modal and slide-out drawer have different UX purposes. |
| **URL Query String Serializers** | `analyticsApi.js` defines `buildFilterQueryString()`. `expenseApi.js` defines inline `Object.fromEntries(Object.entries(query).filter(...))`. | Low: Both convert filter objects to URL query strings. | A simple pure utility `toQueryString(params)` in `client/src/utils/collectionUtils.js` could replace both. |

---

## 4. Intentional Separations (Do Not Merge)

1. **Demo Role Switching (`/demo`, `/handbook`) vs Real Account Role Management (`set-user-role.js`)**:
   - *Why Separate*: Demo mode is a client presentation feature that toggles local React state (`internalRole`) without active credentials. Real account role management alters Supabase `app_metadata.role` using server-side service credentials. Merging them or allowing demo toggles to modify tokens would create a severe privilege escalation vulnerability.
2. **Handbook RAG Chunks vs Expense Receipts Storage**:
   - *Why Separate*: Handbook chunks are vectorized in Qdrant Cloud using 3072-dim embeddings for semantic similarity search over static institutional documents. Receipts are user-owned multimodal images stored in Supabase Storage with metadata in PostgreSQL RLS tables. Their lifecycle, ownership, query mechanisms, and retention rules are fundamentally different.
3. **Admin Analytics (`ai_usage_analytics`) vs Personal Expense Transactions (`expense_transactions`)**:
   - *Why Separate*: AI usage analytics is system telemetry tracking model costs, latencies, and tokens for administrators. Expense transactions represent private student financial data protected by strict user-level RLS. Sharing database structures or query handlers would violate tenant isolation.
