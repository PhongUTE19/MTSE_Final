# SpendWise — SRS and Diagram Readiness Audit

**Audit Date:** 2026-11-17  
**Scope:** Codebase, configuration, and documentation readiness for SRS deliverables (Use Case Diagram, Use Case Specifications, Sequence Diagrams, System Architecture Diagram).  
**Excluded Deliverable:** Entity-Relationship Diagram (ERD) — explicitly deferred due to unresolved database design issues.

---

## 1. Executive Summary

The SpendWise codebase is functionally rich and structurally well-organized into a 6-layer React 18 SPA frontend (`client/src/`) and a feature-modularized Express ESM backend (`server/src/`). Core end-to-end user workflows—Supabase authentication, manual transaction CRUD, multimodal receipt upload/extraction/staging/confirmation, conversational Expense Assistant with tool calling, and Admin Knowledge Base / AI Usage dashboards—are implemented and traceable in source code.

However, **creating an accurate SRS and set of architectural/behavioral diagrams directly from existing documentation without reconciliation will produce significant errors**. Across the repository, documentation and implementation diverge on:
1. **Retired vs. Current Architecture:** Academic docs (`docs/academic/adrs/adr-0003*`, `docs/academic/ai-data-flows/02-tool-using-agent.md`) still describe an ephemeral in-memory proposal `Map` and `/api/expense-agent/proposals/:id/confirm`, which `FULL-REF-17` (Engineering ADR-0006) replaced with persistent `transaction_drafts` and `/api/transaction-draft/:id/confirm`.
2. **Route & Naming Drift:** Actual Express mounts in `server/src/server.js` and `server/src/routes/adminRoute.js` use singular paths (`/api/transaction`, `/api/receipt`, `/api/transaction-draft`, `/api/chat-assistant`, `/api/expense-assistant`, `/api/admin/document`, `/api/admin/system-prompt`, `/api/admin/ai-usage`, `/api/admin/knowledge-base`), whereas `docs/engineering/architecture.md`, `AGENTS.md`, and `docs/academic/` frequently cite plural or legacy paths (`/api/transactions`, `/api/receipts`, `/api/transaction-drafts`, `/api/admin/analytics/*`, `/api/admin/index`).
3. **Unimplemented or Placeholder Features vs. Intended Requirements:**
   - **US-04 (Category Management):** `/expense/categories` (`client/src/features/category/CategoriesPage.jsx`) is a static placeholder card; no category CRUD endpoints exist.
   - **US-08 (Financial Dashboard & Analytics):** `/home` (`client/src/features/home/HomePage.jsx`) renders only a welcome card. Spending summaries appear on `/expense/transactions` (`TransactionSummary.jsx`, computed from the current result set) and via the Expense Assistant `get_spending_summary` tool—not as a dedicated dashboard page.
   - **US-11 (Monthly Budgets):** Not implemented.
   - **US-12 (SSE Streaming):** Backend `/api/chat-assistant/stream` exists, but in default `agent` mode (`orchestrateAgentChatStream`), it awaits the full synchronous response and emits a single `delta` event; the frontend (`chatApi.js` / `expenseAssistantApi.js`) uses standard JSON `POST` with client-side typewriter reveal (`useTextReveal`), not SSE.
4. **Runtime Bugs & Operational Ambiguities:**
   - `systemPrompt.service.js` writes `config.promptFileDefault` (a file path string) as the prompt text instead of reading the default file's contents.
   - `CHAT_STRATEGY` defaults to `'agent'`, leaving the RAG Knowledge Base pipeline (`document`, `knowledgeBase`) disconnected from the default user chat path while still exposed in Admin UI and `GET /api/health`.

### Overall Deliverable Readiness Summary

| Deliverable | Status | Confidence |
| :--- | :--- | :--- |
| **Use Case Diagram** | **READY WITH GAPS** | Medium-High |
| **Use Case Specifications** | **READY WITH GAPS** | Medium |
| **Sequence Diagrams** | **READY WITH GAPS** | High (for implemented paths) |
| **System Architecture Diagram** | **READY WITH GAPS** | High (Logical) / Medium (Deployment) |
| **ERD** | **DEFERRED** | N/A (Explicitly Excluded) |

---

## 2. Scope and Evidence Sources

Per the audit evidence hierarchy, actual source code establishes implemented behavior, academic documents establish intended behavior, ADRs explain architectural decisions, and engineering docs provide context subject to code verification.

### Inspected Sources
- **Frontend (`client/`):** `client/package.json`, `client/vite.config.js`, `client/.env.example`, `client/Dockerfile`, `client/nginx.conf`, `client/src/main.jsx`, `client/src/app/App.jsx`, `client/src/app/guards/*`, `client/src/app/providers/*`, `client/src/layouts/*`, `client/src/shared/constants/routes.js`, `client/src/shared/services/apiClient.js`, `client/src/shared/services/supabaseAuth.js`, and feature modules (`auth`, `home`, `transaction`, `category`, `receipt`, `transactionDraft`, `chat`, `expenseAssistant`, `admin`, `aiUsage`, `knowledgeBase`, `document`, `systemPrompt`).
- **Backend (`server/`):** `server/package.json`, `server/.env.example`, `server/Dockerfile`, `server/src/server.js`, `server/src/config.js`, `server/src/routes/adminRoute.js`, `server/src/shared/middleware/*`, `server/src/shared/integrations/*`, and all 10 feature modules in `server/src/features/` (`auth`, `transaction`, `receipt`, `transactionDraft`, `chatAssistant`, `expenseAssistant`, `document`, `knowledgeBase`, `systemPrompt`, `aiUsage`).
- **Root & Deployment:** `package.json`, `docker-compose.yml`, `AGENTS.md`.
- **Documentation:** `docs/academic/` (`architecture.md`, `user-stories.md`, `ai-usage.md`, `adrs/0001–0003`, `ai-data-flows/01–05`) and `docs/engineering/` (`architecture.md`, `implementation-guidelines.md`, `refactoring-plan.md`, `progress.md`, `adrs/0001–0006`).
- **Explicitly Excluded:** `supabase/migrations/` and database schema/ERD validation.

---

## 3. Current System Boundary

### Inside the SpendWise System Boundary
- **SpendWise Web SPA (`client/`):** React 18 UI served by Vite (dev) or Nginx (Docker), handling client-side routing, Supabase session management, receipt file pre-validation, draft review UI, and simulated text reveal.
- **SpendWise API Server (`server/`):** Express 4 REST API enforcing rate limiting, JWT verification, RBAC (`user` vs. `admin`), Multer/Sharp image preprocessing, Zod validation, AI prompt/guardrail orchestration, and bounded async telemetry queuing.
- **Local Filesystem Data (`data/` / `server/prompts/`):** Markdown knowledge base files (`KNOWLEDGE_DIR`), editable active system prompt (`PROMPT_FILE`), and versioned prompt templates (`server/prompts/`).

### External Services (Outside SpendWise Application Code, Integrated via APIs/SDKs)
1. **Supabase Auth (GoTrue):** User registration, email/password login, Google OAuth2, password reset emails, and JWT issuance/verification (`supabase.auth.getUser(token)`).
2. **Supabase PostgreSQL (with RLS & Security-Definer RPCs):** Persistent storage for transactions, receipts, extraction history, transaction drafts, and AI usage analytics.
3. **Supabase Storage (`receipts` bucket):** Private binary object storage for uploaded receipt images, accessed via service-role upload/download and 60-second signed preview URLs.
4. **Google Gemini API (`@google/genai`):** Multimodal receipt extraction (`geminiReceiptModel`), conversational tool-calling / RAG generation (`geminiModel`), and text embeddings (`embeddingModel`).
5. **Qdrant Cloud (`@qdrant/js-client-rest`):** Vector database storing 3072-dimension cosine embeddings for Knowledge Base chunks.
6. **Google OAuth2 (via Supabase Auth):** External identity provider for social sign-in.

---

## 4. Actor Inventory

### Confirmed Human Actors
| Actor | Authentication / Role Mechanism | Verified Responsibilities & Permission Boundaries |
| :--- | :--- | :--- |
| **Guest (Unauthenticated User)** | No valid Bearer JWT (`req.user` absent). | • Access public routes (`/`, `/auth`, `/auth/callback`, `/reset-password`).<br>• Sign in (email/password or Google OAuth), sign up, or request password reset via Supabase Auth.<br>• Call `GET /api/health`.<br>• **Unclear permission:** `POST /api/chat-assistant` uses `optionalAuthenticate` (`chatAssistant.route.js`). In default `CHAT_STRATEGY='agent'` mode, `orchestrateAgentChat` throws `401` if `req.user` is missing. However, if `CHAT_STRATEGY='rag'`, an unauthenticated Guest could invoke `orchestrateRAGChat` directly via API (no frontend UI exposes chat to Guests). |
| **Authenticated User (`user`)** | Valid Supabase JWT; `app_metadata.role` absent or `'user'`. | • Access `/home`, `/expense/transactions`, `/expense/receipts`, `/expense/categories`, and the `ExpenseAssistant` drawer.<br>• Full CRUD on own transactions (`/api/transaction`), guarded by RLS (`auth.uid() = user_id`).<br>• Upload, list, preview, and retry own receipts (`/api/receipt`).<br>• List, view, edit, confirm, and reject own transaction drafts (`/api/transaction-draft`).<br>• Query Expense Assistant (`/api/expense-assistant`, `/api/chat-assistant`).<br>• **Forbidden (`403`):** All `/api/admin/*` endpoints (`authorize('admin')`) and `/admin/*` frontend routes (`AdminRouteGuard`). |
| **Administrator (`admin`)** | Valid Supabase JWT with `user.app_metadata.role === 'admin'` (assigned out-of-band via `server/scripts/set-user-role.js`). | • Inherits all **Authenticated User** capabilities (can use personal finance workspace).<br>• Access `/admin/ai-usage` and `/admin/knowledge-base` and all `/api/admin/*` endpoints:<br>  – Manage Knowledge Base `.md` documents (`/api/admin/document`).<br>  – Trigger Qdrant indexing & inspect status/chunks (`/api/admin/knowledge-base`).<br>  – Read, update, and reset the RAG system prompt (`/api/admin/system-prompt`).<br>  – View AI usage KPIs, timeseries, breakdown, and request history (`/api/admin/ai-usage`). |

### Confirmed External System Actors
| External System | Interaction Type |
| :--- | :--- |
| **Supabase Auth (GoTrue)** | Identity verification, OAuth2 brokerage, password reset, JWT issuance. |
| **Google Gemini API** | AI inference (multimodal receipt OCR, tool-calling assistant, RAG answer generation, embeddings). |
| **Qdrant Cloud** | Vector storage and similarity search for Knowledge Base chunks. |
| **Supabase Storage & PostgreSQL** | External persistence/infrastructure services (modeled as infrastructure/supporting actors in architecture/sequence diagrams, not business actors in Use Case Diagrams). |

### Unclear / Undocumented Permissions Requiring Clarification
1. Should `POST /api/chat-assistant` require strict `authenticate` instead of `optionalAuthenticate` so Guests cannot invoke RAG endpoints even when `CHAT_STRATEGY=rag`?
2. Is an **Administrator** intended to be a strict superset of **Authenticated User** (current implementation), or a separate operational role without personal expense ledger access?
3. Can a user **sign up** freely via `AuthForm.jsx` without invite restrictions, and what happens to `display_name`? (Implemented in `AuthForm.jsx`, but not detailed in `docs/academic/user-stories.md` US-01).

---

## 5. Candidate Use Case Inventory

*Modeling note: Use cases represent user-visible goals inside the SpendWise boundary, not individual CRUD buttons or internal helpers.*

### Authentication
| Candidate Use Case | Implemented? | Initiator | Goal & Relationships | Readiness |
| :--- | :--- | :--- | :--- | :--- |
| **UC-01: Sign In (Email/Password or Google OAuth)** | Yes (`AuthPage.jsx`, `AuthCallbackPage.jsx`) | Guest | Authenticate via Supabase Auth to access `/home`. | **Clear** |
| **UC-02: Sign Up** | Yes (`AuthPage.jsx` -> `supabase.auth.signUp`) | Guest | Register a new account with email verification callback. | **Needs clarification** (not in US-01) |
| **UC-03: Reset Password** | Yes (`AuthPage.jsx` -> `ResetPasswordPage.jsx`) | Guest | Request reset email and set a new password. | **Clear** |
| **UC-04: Sign Out** | Yes (`WorkspaceSidebar` / `AuthenticatedRouteGuard`) | Authenticated User / Admin | Terminate session and return to `/auth`. | **Clear** |

### Transaction Management
| Candidate Use Case | Implemented? | Initiator | Goal & Relationships | Readiness |
| :--- | :--- | :--- | :--- | :--- |
| **UC-05: View & Filter Transactions** | Yes (`TransactionPage.jsx`, `GET /api/transaction`) | Authenticated User | Browse paginated transactions with search, date/type/category/amount filters, and view result-set summary (`TransactionSummary.jsx`). | **Clear** |
| **UC-06: Create Manual Transaction** | Yes (`ManualEntry.jsx`, `POST /api/transaction`) | Authenticated User | Record an income or expense entry directly. | **Clear** |
| **UC-07: Edit Transaction** | Yes (`TransactionDetails.jsx`, `PUT /api/transaction/:id`) | Authenticated User | Update an existing transaction's fields. | **Clear** |
| **UC-08: Delete Transaction** | Yes (`TransactionDetails.jsx`, `DELETE /api/transaction/:id`) | Authenticated User | Delete a transaction (and atomically clean up any linked receipt & storage object). | **Clear** |
| **UC-09: View Transaction Details & Linked Receipt** | Yes (`TransactionDetails.jsx`, `GET /api/transaction/:id`, `GET /api/receipt/:id/preview`) | Authenticated User | Inspect transaction metadata and preview linked receipt image via 60s signed URL. | **Clear** |
| *Manage Categories* | **No** (`CategoriesPage.jsx` is a placeholder) | Authenticated User | Intended in US-04, but no CRUD exists. | **Exclude / Defer** |
| *Manage Monthly Budgets* | **No** | Authenticated User | Intended in US-11 (Should Have), not implemented. | **Exclude / Defer** |

### Receipt Processing
| Candidate Use Case | Implemented? | Initiator | Goal & Relationships | Readiness |
| :--- | :--- | :--- | :--- | :--- |
| **UC-10: Scan & Extract Receipt** | Yes (`ScanReceiptPage.jsx`, `POST /api/receipt/upload`) | Authenticated User | Upload receipt image, store securely, run Gemini multimodal extraction, and stage a `TransactionDraft`. | **Clear** |
| **UC-11: Review, Edit & Confirm Transaction Draft** | Yes (`TransactionDraftReview.jsx`, `PATCH/POST /api/transaction-draft/:id/confirm`) | Authenticated User | Verify/edit extracted (or AI-proposed) draft fields and idempotently persist a confirmed transaction. Shared by UC-10 and UC-15 (`<<include>>` or shared workflow). | **Clear** |
| **UC-12: Reject Transaction Draft** | Yes (`POST /api/transaction-draft/:id/reject`) | Authenticated User | Discard a pending draft while retaining the underlying receipt record and image. | **Clear** |
| **UC-13: Retry Failed Receipt Extraction** | Yes (`PendingReceiptList.jsx`, `POST /api/receipt/:id/retry`) | Authenticated User | Re-run AI extraction on a `failed` or `review_required` receipt. (`<<extend>>` on UC-10 / receipt management). | **Clear** |

### Chat & Expense Assistant
| Candidate Use Case | Implemented? | Initiator | Goal & Relationships | Readiness |
| :--- | :--- | :--- | :--- | :--- |
| **UC-14: Query Financial Assistant (Q&A, Search, Summary)** | Yes (`ExpenseAssistant.jsx`, `POST /api/expense-assistant`) | Authenticated User | Ask natural-language questions; AI invokes `search_transactions` or `get_spending_summary` and returns SQL-backed answers. | **Clear** |
| **UC-15: Propose Transaction via Assistant** | Yes (`ExpenseAssistant.jsx`, `POST /api/expense-assistant`) | Authenticated User | Describe an expense/income in chat; AI stages a `TransactionDraft` (`create_transaction` tool), which user confirms/rejects via UC-11 / UC-12. | **Clear** |
| **UC-16: Attach Receipt in Assistant Drawer** | Yes (`ExpenseAssistant.jsx` -> `receiptApi.upload`) | Authenticated User | Alternative UI entry point to UC-10 + UC-11 inside the chat drawer; does not use the chat LLM endpoint. | **Clear** (model as alternate entry to UC-10, not a separate backend flow) |
| *Generic RAG Chat* | **Backend-only toggle** (`CHAT_STRATEGY=rag` on `/api/chat-assistant`) | Authenticated User (or Guest if unguarded) | Not active in default deployment (`CHAT_STRATEGY=agent`); `client/src/features/chat/` is used as the generic UI shell for `ExpenseAssistant`. | **Needs clarification** (include or mark inactive?) |

### Administration
| Candidate Use Case | Implemented? | Initiator | Goal & Relationships | Readiness |
| :--- | :--- | :--- | :--- | :--- |
| **UC-17: Monitor AI Usage & Telemetry** | Yes (`AIUsagePage.jsx`, `GET /api/admin/ai-usage/*`) | Administrator | Filter and inspect KPIs, token trends, breakdowns, and request history. | **Clear** |
| **UC-18: Manage Knowledge Base Documents** | Yes (`KnowledgeBasePage.jsx`, `/api/admin/document/*`) | Administrator | Create, view, edit, and delete `.md` knowledge documents. | **Clear** |
| **UC-19: Index & Inspect Knowledge Base** | Yes (`KnowledgeBasePage.jsx`, `/api/admin/knowledge-base/*`) | Administrator | Trigger full Qdrant re-indexing and inspect chunk count / chunk contents. | **Clear** |
| **UC-20: Manage System Prompt** | Yes (`SystemPromptEditor.jsx`, `/api/admin/system-prompt/*`) | Administrator | View, update, and reset the active RAG system prompt (currently impacted by a bug in `resetSystemPrompt` / `getSystemPrompt`). | **Ready with bug caveat** |

---

## 6. Use Case Specification Readiness

| Use Case Group | Confirmed by Implementation | Confirmed by Docs/Requirements | Partially Supported / Unknown |
| :--- | :--- | :--- | :--- |
| **Auth (UC-01..04)** | Routes, Supabase Auth calls, role resolution (`app_metadata.role`), `safeNextPath`, 401 auto-signout. | US-01 (Sign-in, 401/403 RBAC), Academic ADR-0001. | **Sign-up policy** (open vs. restricted), **password complexity rules** (relies on Supabase defaults, not documented in SRS), **session timeout/refresh UX**. |
| **Transactions (UC-05..09)** | Zod schemas (`transactionSchema`: positive finite amount, UTC calendar date, category/type), pagination, atomic receipt-linked delete, 60s signed preview URL. | US-02, US-03, US-08 (partial), US-13 (404 tenant isolation). | **TransactionSummary scope:** `TransactionSummary.jsx` labels cards *"recorded in this result set"* (current filtered page/set), whereas US-08 expects overall period analytics. **Categories:** `CategoriesPage.jsx` is a stub. |
| **Receipts & Drafts (UC-10..13)** | 5MB JPG/PNG/WebP, 8000px Sharp cap, EXIF strip, `NOT_A_RECEIPT` / `PROMPT_INJECTION_REJECTED` cleanup, lease RPCs, `transaction_drafts` PATCH/confirm idempotency/reject retention. | US-05, US-06, US-07, Engineering ADR-0006. | **Non-VND currency business rule:** Code warns and saves numeric value as-is; stakeholder must confirm whether users are expected to manually convert to VND before confirming. **Silent draft creation failure:** If `createDraft` fails after extraction succeeds (`receipt.service.js:124-133`), user sees a completed receipt with no draft—expected recovery UX is undefined. |
| **Expense Assistant (UC-14..16)** | 3 Gemini tools, `MAX_AGENT_STEPS=2` (max 1 tool call/turn), 8-turn history limit, 15s timeout, prompt injection guard, localStorage chat history. | US-09, US-10, US-12, Academic ADR-0003 (pre-draft refactor). | **Conversation persistence:** Chat history is stored only in browser `localStorage` (`useChat.js`), not server-side DB—unclear if cross-device persistence is required. **Streaming:** Client simulates typewriter reveal; true SSE is not used for Expense Assistant. |
| **Admin (UC-17..20)** | `/api/admin/*` RBAC, AI Usage filters (`1h`–`all`), `.md` filename/heading validation, Qdrant reset-and-reindex, prompt length 20–10,000 chars. | US-14 (telemetry), `docs/academic/ai-usage.md` Sec 8–9 (cost pricing). | **Prompt reset bug:** `systemPrompt.service.js` writes file path instead of file content. **RAG vs. Agent disconnect:** Admin manages KB & System Prompt for RAG, while default user chat runs `CHAT_STRATEGY=agent` (which uses `server/prompts/expenseAgent/*.md`, not `PROMPT_FILE`). |

---

## 7. Sequence Diagram Scenario Analysis

### Scenario A: Manual Transaction Creation
- **Status:** **READY** (High confidence).
- **Verified Flow:** User submits `ManualEntry.jsx` -> `transactionApi.create(data)` -> `apiJsonRequest` (`POST /api/transaction` with Bearer JWT) -> `apiRateLimiter` -> `authenticate` (verifies JWT via Supabase Auth) -> `validateRequest({ body: transactionSchema })` -> `transaction.controller.create` -> `transaction.service.createTransaction` -> `transaction.repository.insertTransaction` (per-request RLS client `createUserScopedSupabaseClient(user.token)` inserting into `expense_transactions`) -> `201 Created` JSON -> `TransactionPage` refreshes list.
- **Exception Paths Verified:** `401` (invalid/missing JWT -> client signs out & redirects to `/auth`), `400` (Zod validation failure), `500` (DB error sanitized).

### Scenario B: Receipt Upload and Transaction Confirmation
- **Status:** **READY WITH GAPS** (High confidence on happy/idempotent paths; one silent-failure gap).
- **Verified Flow:**
  1. **Upload & Pre-validation:** User selects file in `ScanReceiptPage.jsx` -> `useReceiptUpload` checks `<= 5MB` and JPG/PNG/WebP -> `receiptApi.upload(file)` (`POST /api/receipt/upload`).
  2. **Backend Ingestion:** `receiptOcrRateLimiter` (15/min) -> `authenticate` -> `uploadReceiptImage` (Multer memoryStorage, magic-byte + Sharp dimension `<= 8000px` check, concurrency cap 2) -> `receipt.service.uploadReceipt`.
  3. **Storage & Lease:** User RPC `create_receipt_upload` -> service-role `uploadReceiptObject` (Supabase Storage `receipts` bucket) -> `processStoredReceipt` acquires lease via user RPC `start_receipt_processing`.
  4. **AI Extraction & Staging:** Sharp downsamples to 1600px JPEG -> `geminiProvider.extractReceiptImage` (Gemini `responseJsonSchema` + `recordUsage` telemetry) -> Zod `receiptExtractionSchema` + `enforceReceiptGuardrails` -> server RPC `server_complete_receipt_extraction` -> `recordSucceededExtraction` (`receipt_extractions`) -> `transactionDraft.service.createDraft` (`transaction_drafts` with `status: 'pending_review'`) -> returns `{ receipt, draft }`.
  5. **Review, Edit & Confirm:** User edits/confirms in `TransactionDraftReview.jsx` -> optional `PATCH /api/transaction-draft/:id` -> `POST /api/transaction-draft/:id/confirm` -> `transactionDraft.service.confirmDraft` checks idempotency (if already `confirmed`, returns existing transaction) -> atomically claims draft (`claimDraftForConfirmation`) -> calls user RPC `confirm_receipt_transaction` -> links `transaction_id` on draft -> `200 OK` -> UI calls `notifyTransactionsChanged()`.
- **Alternative / Exception Paths:**
  - `NOT_A_RECEIPT` or `PROMPT_INJECTION_REJECTED` -> deletes temporary receipt & storage object (`cleanUpTemporaryReceipt`), returns `422`.
  - Timeout / transient AI error -> marks receipt `failed` (`server_mark_receipt_failed`), user can invoke `POST /api/receipt/:id/retry`.
  - Reject (`POST /api/transaction-draft/:id/reject`) -> sets draft `status = 'rejected'`, retains receipt & storage file.
  - **Gap:** If `makeDraft` throws in `receipt.service.js:124-133`, error is swallowed and `draft` is `null` even though receipt is marked completed.

### Scenario C: Chat and Expense Assistant
- **Status:** **READY WITH GAPS** (High confidence in code; discrepancy vs. SRS SSE expectation).
- **Verified Flow:**
  1. User sends message in `Chatbot.jsx` (`useChat.js` appends local history, trims to 8 turns) -> `expenseAssistantApi.askExpenseAssistant` (`POST /api/expense-assistant`). *(Note: Frontend does not call `/api/chat-assistant` or `/api/chat-assistant/stream`.)*
  2. Backend: `authenticate` -> `expenseAssistantRateLimiter` (30/min) -> `validateRequest` -> `expenseAssistant.controller.assistant` -> `runExpenseAssistantForUser` (`detectPromptInjection` on message + history) -> `runGeminiExpenseAssistant` (15s timeout).
  3. **Tool Calling:** Turn 1 (`generateToolTurn`, `AUTO` mode) -> if Gemini returns `functionCall` (`search_transactions` or `get_spending_summary`), Zod validates args -> executes `listTransactions` or `getSpendingSummary` (RLS Supabase queries, SQL/integer-cent math) -> Turn 2 (`generateToolFollowup`) generates natural-language summary -> `validateChatResponse` -> returns `{ answer, toolCalls, toolResult }` -> client renders `ExpenseToolResult` and simulates typing via `useTextReveal`.
- **Gap:** True SSE streaming (`orchestrateRAGChatStream`) only exists on `POST /api/chat-assistant/stream` in `rag` mode; `agent` mode streaming is simulated, and `ExpenseAssistant.jsx` does not use SSE at all.

### Scenario D: Transaction Proposal from Chat
- **Status:** **READY** (High confidence).
- **Verified Flow:** User describes a transaction in `ExpenseAssistant` -> `POST /api/expense-assistant` -> Gemini Turn 1 calls `create_transaction` tool -> `createTransactionArgsSchema` validates args -> `transactionDraft.service.createDraft` inserts into `transaction_drafts` (`sourceType: 'assistant_proposal'`, `status: 'pending_review'`) -> Turn 2 summarizes proposal -> response includes `draftId` -> `ToolProposalResult.jsx` renders inline `TransactionDraftReview` -> user confirms (`POST /api/transaction-draft/:id/confirm`) -> `confirmDraft` inserts directly into `expense_transactions` (unlike receipt drafts, does not call `confirm_receipt_transaction` RPC).

### Scenario E: Receipt Upload Through Chat
- **Status:** **READY** (High confidence).
- **Verified Flow:** User clicks `+` in `ExpenseAssistant.jsx` -> `useReceiptUpload` calls `receiptApi.upload(file)` (`POST /api/receipt/upload` — **exact same backend endpoint and workflow as Scenario B**, bypassing `/api/expense-assistant` and `/api/chat-assistant`). `ExpenseAssistant` renders `TransactionDraftReview` directly above the chat composer; confirming or rejecting calls `POST /api/transaction-draft/:id/confirm` or `/reject` and appends a local confirmation message to `useChat`.

### Scenario F: Knowledge Base Management (Admin Indexing vs. Runtime RAG)
- **Status:** **READY WITH GAPS** (High confidence in code; operational gap because RAG is inactive by default).
- **Verified Admin Indexing Flow:** Admin edits `.md` in `KnowledgeBasePage.jsx` -> `/api/admin/document` (`document.service.js` writes to `KNOWLEDGE_DIR`) -> Admin clicks Index -> `POST /api/admin/knowledge-base/index` (`indexingRateLimiter`) -> `knowledgeBase.service.executeIndexing` (in-memory `isIndexing` lock) -> `indexer.runIndexer` -> `chunker.loadAndChunkMarkdown` (`## ` split + 1200/200 recursive split) -> `initVectorStore({ reset: true })` (drops/recreates Qdrant collection, 3072-dim Cosine) -> Gemini `embedText` per chunk -> `upsertVectorPoints` to Qdrant.
- **Verified Runtime RAG Flow (only when `CHAT_STRATEGY=rag`):** `POST /api/chat-assistant` -> `orchestrateRAGChat` -> `getSystemPrompt()` -> `executeRAG` (`detectPromptInjection` -> `classifyScope` -> `embedText` -> Qdrant `searchPoints` top-K + amendment boost `>= 0.55` -> threshold `0.60`) -> `promptBuilder` -> Gemini `generateAnswer` / `generateAnswerStream`.
- **Gap:** `isIndexing` lock is process-local (unsafe for multi-instance deployment); `reset: true` causes brief search unavailability during re-indexing.

### Scenario G: Administrative Workflows (System Prompt & AI Usage)
- **Status:** **READY WITH GAPS** (High confidence in AI Usage; blocked by bug in System Prompt).
- **AI Usage:** `AIUsagePage.jsx` -> `GET /api/admin/ai-usage/{overview,timeseries,breakdown,history}` -> `aiUsage.service.js` -> `aiUsage.repository.js` (queries `ai_usage_analytics` via service-role client, with fallback to in-memory ring buffer `defaultUsageStore`). Background ingestion runs via `aiUsage.writer.js` (FIFO queue max 500, batch 10, 1000ms interval flush).
- **System Prompt:** `SystemPromptEditor.jsx` -> `GET/PUT /api/admin/system-prompt` and `POST /api/admin/system-prompt/reset` -> `systemPrompt.service.js` reads/writes `PROMPT_FILE`. **Bug:** `getSystemPrompt()` (when file is missing) and `resetSystemPrompt()` write `config.promptFileDefault` (the path string) instead of reading the default file.

---

## 8. System Architecture Inventory

### 8.1 Frontend (`client/src/`)
- **Entry & Routing:** `main.jsx` -> `App.jsx` (`BrowserRouter`, `react-router-dom` `^7.18.4`).
- **Global Providers:** `ConfirmProvider`, `ToastProvider`, `WorkspaceProvider` (inside `WorkspaceLayout.jsx` providing `user`, `health`, `transactionsVersion`, `receiptsVersion`, `assistantOpen`).
- **Guards:** `AuthenticatedRouteGuard` (Supabase session + `spendwise:unauthorized` listener), `AdminRouteGuard` (`app_metadata.role === 'admin'`).
- **6-Layer Hierarchy:** `app` -> `features` -> `layouts` (`WorkspaceLayout`, `ExpenseLayout`) -> `composites` (`TransactionDraftReview`, `PushDrawer`, `OverlayDrawer`, etc.) -> `primitives` -> `shared` (`apiClient.js`, `supabaseAuth.js`, `useTextReveal.js`).

### 8.2 Backend (`server/src/`)
- **Initialization:** `server.js` validates provider config, attaches `helmet`, `cors()`, `express.json({ limit: '5mb' })`, `apiRateLimiter` (300/15m), mounts 6 routers + `GET /api/health`, `notFoundHandler`, `errorHandler`, and non-fatally initializes Qdrant.
- **Auth & Security:** `authenticate`, `optionalAuthenticate`, `authorize('admin')`, `receiptUpload.middleware.js` (Multer + Sharp), per-feature rate limiters (`receiptOcrRateLimiter`, `chatRateLimiter`, `expenseAssistantRateLimiter`, `indexingRateLimiter`).
- **Async Background Work:** `aiUsage.writer.js` (`setInterval` 1000ms `.unref()` batch flush to Supabase). No external job queue (e.g., BullMQ/Redis) exists.

### 8.3 AI Infrastructure
- **Provider Adapter (`server/src/shared/integrations/ai/providers/geminiProvider.js`):** Wraps `@google/genai` with `withTimeout` (30s default, 15s assistant) and `executeWithRetry` (3 retries, 1200ms exponential backoff).
- **Models (`server/src/config.js`):** `geminiModel` & `geminiReceiptModel` default to `gemini-3.5-flash-lite`; `embeddingModel` defaults to `gemini-embedding-001`.
- **Orchestration:** `receipt` (multimodal `responseJsonSchema`), `expenseAssistant` (`AUTO` function calling, 3 tools), `knowledgeBase` (RAG chunker/indexer/retriever), `aiUsage` (cost/token/latency telemetry).

### 8.4 Data Infrastructure (Infrastructure Level Only — ERD Deferred)
- **Supabase Auth (GoTrue):** JWT & OAuth2.
- **Supabase PostgreSQL:** Primary relational store accessed via per-request RLS-scoped clients (`createUserScopedSupabaseClient`) and security-definer RPCs, plus service-role client (`getSupabaseClient`) quarantined to `aiUsage`, `auth` CLI, and receipt storage/extraction logging.
- **Supabase Storage:** Private `receipts` bucket with 60s signed URLs.
- **Qdrant Cloud:** Vector store (`3072` dims, `Cosine`) for Knowledge Base chunks.

### 8.5 External Systems & Deployment
- **Local Dev:** `concurrently` runs `server` (`node --watch src/server.js` on `:3000`) and `client` (Vite 6 on `:5173` proxying `/api` -> `http://localhost:3000`).
- **Docker Compose (`docker-compose.yml`):**
  - `server` container (`node`, port `3000`, mounts `./data:/app/data` for `KNOWLEDGE_DIR` and `PROMPT_FILE`).
  - `client` container (`nginx:alpine`, port `5173:80`, `nginx.conf` proxies `/api/` -> `http://server:3000/api/` with `client_max_body_size 10M`, `proxy_buffering off`, `proxy_read_timeout 300s`).
- **Recommendation:** Produce **two diagrams**—a **Logical System Architecture Diagram** (6-layer SPA, Express feature modules, AI/RAG pipelines, data stores) and a **Runtime / Deployment Architecture Diagram** (Docker Compose containers, Nginx reverse proxy, external cloud services)—because `nginx.conf` buffering/body-size rules and `data/` volume mounts are deployment-specific.

---

## 9. Documentation / Implementation Inconsistencies

| Area | Documentation Claim | Actual Implementation |
| :--- | :--- | :--- |
| **API Route Paths** | `docs/engineering/architecture.md` & `AGENTS.md` cite `/api/transactions`, `/api/receipts`, `/api/transaction-drafts`, `/api/admin/analytics/*`, `/api/admin/index`, `/api/user/chat`. | `server.js` & `adminRoute.js` mount `/api/transaction`, `/api/receipt`, `/api/transaction-draft`, `/api/chat-assistant`, `/api/expense-assistant`, `/api/admin/document`, `/api/admin/system-prompt`, `/api/admin/ai-usage`, `/api/admin/knowledge-base`. |
| **Draft & Proposal Persistence** | `docs/academic/adrs/adr-0003*` & `ai-data-flows/02-tool-using-agent.md` describe an in-memory `proposals` `Map` (10-min TTL) and `/api/expense-agent/proposals/:id/confirm`. | Replaced by persistent `transaction_drafts` and `/api/transaction-draft/:id/confirm` (per `FULL-REF-17` / Eng ADR-0006). |
| **Category & Budget Features** | `docs/academic/user-stories.md` lists US-04 (Category Management) as Must Have and US-11 (Budgets) as Should Have. | `CategoriesPage.jsx` is a static placeholder; no category CRUD or budget endpoints exist. |
| **Spending Analytics Dashboard** | US-08 describes a financial dashboard with category breakdown and net savings. | `HomePage.jsx` is only a welcome card; `TransactionSummary.jsx` only sums the current transaction result set; full period breakdown exists only via Expense Assistant `get_spending_summary`. |
| **Chat Streaming** | US-12 specifies SSE streaming (`metadata`, `delta`, `done`). | `ExpenseAssistant.jsx` uses standard JSON `POST` with client-side typewriter reveal (`useTextReveal`). Backend `agent` streaming awaits full completion before sending one `delta`. |
| **RAG Embeddings & Threshold** | `docs/engineering/architecture.md` L39 mentions `"Xenova Embeddings"`; `ai-data-flows/03` cites `text-embedding-004` & `0.65`. | `server/.env.example` & `config.js` use `gemini-embedding-001`, `TOP_K=3`, `SIMILARITY_THRESHOLD=0.60` (and `retriever.js` uses `topK = 4` default). |
| **Frontend Library Versions** | `AGENTS.md` says React Router 6; `architecture.md` says Vite 5. | `client/package.json` uses `react-router-dom` `^7.18.4` and `vite` `^6.0.1`. |
| **Server Dev Port** | `docs/engineering/architecture.md` Sec 10 says Nodemon on port `5000`. | `server/package.json` uses `node --watch` on port `3000`. |
| **Docker Prompt Path** | `docker-compose.yml` sets `PROMPT_FILE_DEFAULT=/app/data/prompts/system_prompt_default.txt`. | `server/Dockerfile` copies `prompts/` to `/app/prompts/`, and `systemPrompt.service.js` treats `config.promptFileDefault` as text instead of a path. |
| **Route Input Validation** | `implementation-guidelines.md` emphasizes strict boundary validation. | `/api/transaction/:id` and `/api/receipt/:id/*` lack UUID param validation (invalid IDs cause Postgres `22P02` -> 500 instead of 400). |
| **Test Suite Status** | `docs/engineering/progress.md` records 653/653 passing tests. | `refactoring-plan.md` (`TECH-06`) notes legacy test files still import deleted pre-`FULL-REF-17` components. |

---

## 10. Readiness Assessment

### Deliverable-Level Summary

| Deliverable | Status | Evidence Available | Main Gaps | Recommended Next Step |
| :--- | :--- | :--- | :--- | :--- |
| **Use Case Diagram** | **READY WITH GAPS** | All routes, guards, and UI features traced in `client/` and `server/`. | Unclear whether inactive RAG chat, Sign-Up, and stubbed Categories/Analytics should be in scope; `optionalAuthenticate` on `/api/chat-assistant`. | Confirm actor & scope decisions (Section 11, Q1–Q4) with stakeholders. |
| **Use Case Specifications** | **READY WITH GAPS** | Zod schemas, guardrails, RPC flows, and academic user stories (`US-01`..`US-14`). | Business rules for non-VND currency conversion, `localStorage`-only chat history, silent `createDraft` failure, and `TransactionSummary` scope. | Resolve business rules (Section 11, Q5–Q8) and fix `systemPrompt.service.js` bug. |
| **Sequence Diagrams** | **READY WITH GAPS** | Complete end-to-end call chains verified for Scenarios A–G. | True vs. simulated streaming behavior; silent draft-creation failure handling in `receipt.service.js`. | Document verified code sequences while flagging the streaming & draft-failure gaps. |
| **System Architecture Diagram** | **READY WITH GAPS** | Full frontend 6-layer map, backend modules, AI/RAG adapters, and Docker/Nginx configs. | Active (`agent`) vs. inactive (`rag`) chat path ambiguity; outdated route/model references in existing docs. | Create separate Logical and Deployment diagrams reflecting actual `server.js` / `docker-compose.yml` topology. |
| **ERD** | **DEFERRED** | Explicitly excluded from this audit. | Unresolved database design issues. | Revisit only after database schema stabilization. |

### Scenario & Use Case Confidence Breakdown
- **High Confidence:** Manual Transaction CRUD (Scenario A), Transaction Proposal from Chat (Scenario D), Receipt Upload via Chat (Scenario E), AI Usage Telemetry (Scenario G1), Logical & Deployment Infrastructure.
- **Medium Confidence:** Receipt Upload & Confirmation (Scenario B — silent `createDraft` error handling), Knowledge Base & RAG (Scenario F — inactive by default), Chat & Expense Assistant (Scenario C — streaming discrepancy), Auth (UC-01..04 — sign-up/password policy).
- **Low Confidence (Needs Decision/Fix):** System Prompt Reset (Scenario G2 — bug in `systemPrompt.service.js`), Category Management & Financial Dashboard (stubbed/partial UI vs. US-04/US-08).

---

## 11. Missing Information and Questions Requiring Stakeholder Decisions

1. **System Scope — RAG & `/api/chat-assistant`:** Is the Knowledge Base + RAG chat flow (`CHAT_STRATEGY=rag`) an in-scope production capability for the SRS, or an internal/experimental admin capability? Should `optionalAuthenticate` on `/api/chat-assistant` be tightened to `authenticate`?
2. **Scope of Stubbed/Missing User Stories:** Should **US-04 (Category Management)**, **US-08 (Full Financial Dashboard)**, and **US-11 (Budgets)** be marked *Out of Scope / Future Work* in the SRS, or implemented before SRS sign-off?
3. **Sign-Up Policy (UC-02):** Is open self-registration via email/password and Google OAuth an approved requirement (missing from US-01), and are there specific password/profile requirements?
4. **Admin Role Boundaries:** Should an Administrator also act as a standard personal-finance user (current behavior), or be restricted to operational views?
5. **Non-VND Currency Business Rule:** When a receipt is non-VND (e.g., USD/JPY), the system currently warns the user and stores the raw numeric amount. Should the SRS specify manual user conversion to VND before confirmation, or is currency conversion out of scope?
6. **Chat History Persistence:** Is browser `localStorage` persistence (`useChat.js`) acceptable for the SRS, or is server-side conversation persistence required?
7. **Streaming Requirement (US-12):** Does the SRS require true server-sent token streaming for the Expense Assistant, or is the current synchronous JSON response + client-side `useTextReveal` animation acceptable?
8. **Silent Failure Recovery (`receipt.service.js`):** If receipt extraction succeeds but `createDraft` fails, what is the required user-facing recovery flow?

---

## 12. Recommended Documentation Plan

1. **Phase 1 — Stakeholder Decisions & Critical Bug Triage (Blocking):**
   - Answer Questions 1–8 in Section 11 (especially scope of RAG, Categories/Dashboard, streaming, and non-VND rule).
   - Fix or document known defects before/alongside SRS writing: `systemPrompt.service.js` `promptFileDefault` bug, silent `createDraft` failure in `receipt.service.js`, and missing UUID validation on `/api/transaction/:id` and `/api/receipt/:id`.
2. **Phase 2 — System Boundary & Use Case Diagram (Independent once Q1–Q4 are answered):**
   - Finalize Actor table (`Guest`, `Authenticated User`, `Administrator`, `Supabase Auth`, `Google Gemini API`, `Qdrant Cloud`) and produce the Use Case Diagram using the UC-01..UC-20 inventory.
3. **Phase 3 — System Architecture Diagrams (Can run in parallel with Phase 2):**
   - Produce **Logical Architecture Diagram** (Frontend 6-layer, Backend 10 feature modules, AI/RAG orchestration, Infrastructure) and **Deployment Architecture Diagram** (Docker Compose: Nginx `:5173->80`, Node `:3000`, `./data` volume, Cloud APIs).
4. **Phase 4 — Sequence Diagrams (Can start immediately for Scenarios A, D, E, G1; finalize B, C, F after Phase 1):**
   - Diagram actual verified message flows, separating Receipt-via-Chat (Scenario E) as an alternative UI entry to Scenario B.
5. **Phase 5 — Use Case Specifications (Depends on Phase 1 & Phase 2):**
   - Write full specifications for UC-01..UC-20 using the verified schemas, guardrails, and resolved business rules.
6. **Phase 6 — Documentation Synchronization & ERD (Post-stabilization):**
   - Reconcile route names and retired `proposals` references in `docs/academic/` and `docs/engineering/architecture.md`.
   - **Revisit ERD only after database schema issues are resolved.**

---

## 13. Explicit ERD Deferral

Per audit instructions, **Entity-Relationship Diagram (ERD) analysis, validation, and generation are explicitly deferred**. No `supabase/migrations/` files were inspected for entity modeling, no table schemas or foreign-key relationships were validated or proposed, and the current database design is **not** treated as an approved domain model. Database interactions in this report are documented strictly at the infrastructure and service-boundary level (Supabase PostgreSQL with RLS/RPCs, Supabase Storage, Qdrant Cloud).

---

## 14. Limitations and Verification Notes

- **Audit Only:** No source files, tests, schemas, or existing documentation were modified, and no tests (`npm test`) were executed during this audit.
- **Unverified Runtime Execution:** Behavior was verified by static inspection of source code, routes, middlewares, services, and configurations; live runtime behavior against Supabase, Gemini, and Qdrant was not executed.
- **Test Debt Note:** Per `docs/engineering/refactoring-plan.md` (`TECH-06`), legacy frontend tests referencing pre-`FULL-REF-17` components were not run or audited.
