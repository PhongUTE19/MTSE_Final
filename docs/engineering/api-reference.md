# SpendWise — Canonical API Reference

> **Status:** Authoritative Current-State Reference  
> **Source of Truth:** `server/src/server.js`, `server/src/routes/adminRoute.js`, `server/src/features/*/*.route.js`  
> **Retired APIs:** `/api/transaction-draft` is retired (`202611170011`) and must not be documented as active.

---

## 1. Cross-Cutting Middleware & Security Contracts

- **Authentication:** `Authorization: Bearer <Supabase_JWT>` verified server-side by `authenticate` (`server/src/shared/middleware/authenticate.js`). Missing/invalid tokens return `HTTP 401`.
- **Authorization:** `authorize('user')` or `authorize('admin')` (`server/src/shared/middleware/authorize.js`) reads `app_metadata.role` (never `user_metadata`). Role mismatches return `HTTP 403`.
- **Validation:** `validateRequest(...)` (`server/src/shared/middleware/validateRequest.js`) validates `body`, `query`, and `params` with Zod schemas before controllers/SSE headers run, returning `HTTP 400 { error: <message> }`.
- **Rate Limiting & Proxy Trust:** Global `/api` limiter (`apiRateLimiter`), plus tighter endpoint limiters (`chatRateLimiter`, `expenseAssistantRateLimiter`, `receiptOcrRateLimiter`, `indexingRateLimiter`), keyed by `user:<id>` when authenticated or `req.ip` (respecting `TRUST_PROXY` via `resolveTrustProxy`, never blind `trust proxy = true`). Exceeding limits returns `HTTP 429`.
- **CORS & Graceful Shutdown:** `createCorsOptions` enforces an explicit `CORS_ORIGIN` allowlist in production (never wildcard `*` with credentials). `createShutdownManager()` (`server/src/shared/lifecycle.js`) handles `SIGTERM`/`SIGINT` idempotently and drains active requests/SSE streams within a bounded grace period.

---

## 2. Health & Liveness Endpoints (Public)

| Method & Path | Auth | Behavior & Response |
| :--- | :--- | :--- |
| `GET /api/health/live` | Public | Process liveness probe independent of optional Qdrant availability. Always returns `200 { status: "ok" }`. Used by Docker Compose `server` healthcheck. |
| `GET /api/health` | Public | Diagnostic readiness check querying `getVectorStoreCount()`. Returns `200 { status: "ok", indexedChunks }` or `500 { status: "error", detail }` (masks internal exception details in `production`). |

---

## 3. User-Scoped Finance & AI Endpoints (`authenticate` + `authorize('user')`)

### 3.1 Transactions (`server/src/features/transaction/transaction.route.js`, mounted at `/api`)

| Method & Path | Validation / Constraints | Response & Business Rules |
| :--- | :--- | :--- |
| `GET /api/transaction` | `query: transactionQuerySchema` | Paginated, sorted, user-scoped list from `public.expense_transactions` (RLS). Search uses `encodePostgrestIlikeTerm()` on `merchant` and `note` (literal substring semantics; literal `*` limited by PostgREST `*` -> `%` translation). |
| `GET /api/transaction/:id` | UUID `id` | Returns single owned transaction or `404`. |
| `POST /api/transaction` | `body: transactionSchema` | Persists confirmed VND transaction (`amount > 0`, UTC calendar-validated `transaction_date`, `type` in `'income'|'expense'`, optional `client_request_id` for idempotency). |
| `PUT /api/transaction/:id` | `body: transactionSchema` | Updates owned transaction or returns `404`. |
| `DELETE /api/transaction/:id` | UUID `id` | Deletes owned transaction or returns `404`. |

### 3.2 Receipts (`server/src/features/receipt/receipt.route.js`, mounted at `/api/receipt`)

| Method & Path | Middleware / Rate Limit | Response & Business Rules |
| :--- | :--- | :--- |
| `POST /api/receipt/upload` | `receiptOcrRateLimiter`, `uploadReceiptImage` (JPEG/PNG/WebP <= 5 MB) | **Stateless** Gemini multimodal OCR extraction. Does **not** persist to `public.receipts` or Supabase Storage. Returns `201 { receipt }` for local IndexedDB `TransactionDraft` staging. |
| `POST /api/receipt/confirm` | `uploadReceiptImage` | Uploads confirmed receipt image to private Supabase Storage (`receipts` bucket) and atomically commits `public.receipts` + `public.expense_transactions` via `confirm_staged_receipt_transaction` RPC (idempotent per `(user_id, draft_id)`). Returns `201` (or `200` if idempotent replay). |
| `GET /api/receipt` | — | Lists confirmed receipts owned by caller. |
| `GET /api/receipt/:id/preview` | — | Generates short-lived signed Storage URL for owned confirmed receipt. |
| `POST /api/receipt/:id/retry` | `receiptOcrRateLimiter` | Re-runs OCR extraction for an owned receipt record. |

### 3.3 Unified Chat Assistant (`server/src/features/chatAssistant/chatAssistant.route.js`, mounted at `/api/chat-assistant`)

| Method & Path | Rate Limit & Validation | Response & Lifecycle |
| :--- | :--- | :--- |
| `POST /api/chat-assistant` | `chatRateLimiter`, `chatAssistantRequestSchema` | Synchronous JSON (or delegates to `chatStream` when `stream: true` or `Accept: text/event-stream`). Runs unified tool + RAG orchestrator (`CHAT_STRATEGY` defaults to `'unified'`). |
| `POST /api/chat-assistant/stream` | `chatRateLimiter`, `chatAssistantRequestSchema` | Pre-stream validation & `prepareChatStream()` run **before** SSE headers. Streams SSE events (`meta`, `delta`, `proposal`, `sources`, `done`, `error`). Persists turns server-authoritatively in `public.chat_conversations` / `public.chat_messages` (`begin_chat_stream_turn` RPC). Aborts cleanly on client disconnect or server graceful shutdown. |

### 3.4 Chat History (`server/src/features/chatHistory/chatHistory.route.js`, mounted at `/api/chat-history`)

| Method & Path | Validation | Behavior |
| :--- | :--- | :--- |
| `GET /api/chat-history` | — | Lists owned conversations ordered by `updated_at desc`. |
| `POST /api/chat-history` | `createConversationSchema` | Creates owned conversation (`id`, `title`). |
| `GET /api/chat-history/:id` | `conversationIdParamSchema` | Loads owned conversation + ordered messages. |
| `PATCH /api/chat-history/:id` | `conversationIdParamSchema`, `updateConversationSchema` | Updates owned conversation title. |
| `DELETE /api/chat-history/:id` | `conversationIdParamSchema` | Deletes owned conversation (cascades messages). |
| `POST /api/chat-history/:id/messages` | `conversationIdParamSchema`, `appendMessageSchema` | Appends message to owned conversation. |

### 3.5 Legacy Expense Assistant Facade (`server/src/features/expenseAssistant/expenseAssistant.route.js`, mounted at `/api/expense-assistant`)

| Method & Path | Rate Limit & Validation | Behavior |
| :--- | :--- | :--- |
| `POST /api/expense-assistant` | `expenseAssistantRateLimiter`, `expenseAssistantRequestSchema` | Backward-compatible JSON facade delegating to the unified assistant orchestrator. |
| `POST /api/expense-assistant/search` | `expenseAssistantRateLimiter`, `expenseAssistantRequestSchema` | Scoped transaction search facade. |
| `POST /api/expense-assistant/summary` | `expenseAssistantRateLimiter`, `expenseAssistantRequestSchema` | Scoped spending summary facade. |
| `POST /api/expense-assistant/proposals` | `expenseAssistantRateLimiter`, `expenseAssistantRequestSchema` | Scoped draft proposal facade (never writes to DB). |

---

## 4. Admin-Only Endpoints (`authenticate` + `authorize('admin')`, mounted at `/api/admin`)

Admins do **not** inherit `'user'` finance endpoints (`403 Forbidden`).

| Method & Path | Validation / Rate Limit | Behavior |
| :--- | :--- | :--- |
| `GET /api/admin/document` | — | Read-only listing of canonical Git-managed Knowledge Base markdown files (`data/knowledge/`). |
| `GET /api/admin/document/:filename` | `documentParamsSchema` (blocks path traversal) | Read-only inspection of a canonical Knowledge Base document. |
| `GET /api/admin/system-prompt` | — | Read-only inspection of canonical Git-managed system prompt (`server/prompts/`). Runtime mutation is disabled. |
| `GET /api/admin/ai-usage/overview` | `analyticsFilterSchema` | Aggregated AI usage KPIs from `public.ai_usage_analytics`. |
| `GET /api/admin/ai-usage/timeseries` | `analyticsFilterSchema` | Time-series AI usage & cost metrics. |
| `GET /api/admin/ai-usage/breakdown` | `analyticsFilterSchema` | Breakdown by model/feature/usage_source. |
| `GET /api/admin/ai-usage/history` | `analyticsHistorySchema` | Paginated AI usage telemetry log. |
| `GET /api/admin/knowledge-base/status` | — | Qdrant collection/alias (`spendwise_active`) status and chunk count. |
| `GET /api/admin/knowledge-base/chunks` | `paginationQuerySchema` | Paginated inspection of indexed chunks in Qdrant. |
| `POST /api/admin/knowledge-base/index` | `indexingRateLimiter` | Triggers zero-downtime shadow-collection reindex (`spendwise_shadow_*` -> verify -> switch `spendwise_active` alias). |
