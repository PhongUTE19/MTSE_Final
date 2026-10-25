# Codebase Inventory: Student Handbook Assistant & SpendWise

> **Status**: Verified against active repository code  
> **Date**: October 2026  
> **Scope**: Complete audit of `client/`, `server/`, `tests/`, `evals/`, `supabase/`, `data/`, and configuration.

---

## 1. Actual Folder Structure & Module Responsibilities

```
Student_Handbook/
├── client/                               # React 18 + Vite SPA client
│   ├── src/
│   │   ├── components/                   # UI presentation layer
│   │   │   ├── admin/                    # Administration modules (RAG & Analytics)
│   │   │   │   ├── analytics/            # Telemetry dashboards (AnalyticsDashboard, charts, KPIs)
│   │   │   │   ├── KnowledgeBaseDashboard.jsx # Knowledge Base coordinator (documents, chunks, prompt)
│   │   │   │   ├── KnowledgeBaseStats.jsx# Top-level index & sync status badges
│   │   │   │   ├── systemPrompt/         # RAG system prompt configuration (SystemPromptEditor, API, hook)
│   │   │   │   ├── ChunkCard.jsx         # Card renderer for vector chunk preview
│   │   │   │   ├── ChunkReview.jsx       # Paginated chunk list with server-side query
│   │   │   │   ├── DocumentEditor.jsx    # Markdown CRUD editor with upload & preview
│   │   │   │   └── DocumentTable.jsx     # Document inventory table with sort & search
│   │   │   ├── auth/                     # Authentication views & components
│   │   │   │   ├── AuthCallbackPage.jsx  # PKCE OAuth & magic link callback handler
│   │   │   │   ├── AuthPage.jsx          # Public Sign In, Sign Up, & Forgot Password page
│   │   │   │   ├── PasswordField.jsx     # Password input with visibility toggle
│   │   │   │   └── ResetPasswordPage.jsx # Password recovery & update form
│   │   │   ├── common/                   # Shared UI primitives
│   │   │   │   ├── Drawer.jsx            # Slide-out modal drawer with backdrop
│   │   │   │   ├── Pagination.jsx        # Standardized accessible pagination bar
│   │   │   │   ├── SearchInput.jsx       # Debounced accessible search input
│   │   │   │   └── SortableHeader.jsx    # Table column header with sort indicators
│   │   │   ├── expense/                  # SpendWise personal finance workspace
│   │   │   │   ├── assistant/            # Expense Assistant integration (ExpenseAssistant, TransactionProposalCard, ExpenseToolResult)
│   │   │   │   ├── ExpenseSessionGate.jsx# Route guard for authenticated user workspace
│   │   │   │   ├── ExpenseSidebar.jsx    # Sidebar navigation & balance breakdown
│   │   │   │   ├── ExpenseTrackerApp.jsx # Main expense tracking coordinator & state manager
│   │   │   │   ├── ReceiptReview.jsx     # 3-step OCR receipt review & confirmation dialog
│   │   │   │   ├── TransactionForm.jsx   # Create/Edit transaction modal form
│   │   │   │   └── TransactionTable.jsx  # Transaction history table with filters & pagination
│   │   │   ├── toast/                    # Toast notification display
│   │   │   │   ├── ToastContainer.jsx    # Floating notification stack container
│   │   │   │   └── ToastItem.jsx         # Individual animated toast alert item
│   │   │   ├── user/                     # Student Handbook public chat interface
│   │   │   │   ├── debug/                # Retrieval diagnostics & chunk viewer
│   │   │   │   │   ├── AnswerDebugPanel.jsx  # Collapsible debug inspector
│   │   │   │   │   ├── RetrievedChunks.jsx   # Vector chunk list with similarity scores
│   │   │   │   │   └── SupportingSources.jsx # Citations badges for grounded answers
│   │   │   │   ├── AnswerContent.jsx     # Markdown renderer with grapheme streaming reveal
│   │   │   │   ├── AssistantMessage.jsx  # Assistant message card with sources & debug
│   │   │   │   ├── ChatForm.jsx          # Query textarea with submit & abort buttons
│   │   │   │   ├── ConversationList.jsx  # Scrollable message history with auto-scroll
│   │   │   │   └── UserChatView.jsx      # Handbook student query interface coordinator
│   │   │   ├── HandbookLayout.jsx        # Shared header, status bar, & layout wrapper
│   │   │   ├── HandbookView.jsx          # Dual-mode view coordinator (Demo switch vs Authenticated)
│   │   │   └── HealthBadge.jsx           # Vector database connection indicator
│   │   ├── constants/                    # Client constants (endpoints, labels, configs)
│   │   ├── context/                      # React contexts (ToastContext)
│   │   ├── hooks/                        # Custom React hooks (chat, documents, pagination, sort, search)
│   │   ├── services/                     # HTTP API clients (apiClient, chatApi, expenseApi, supabaseAuth)
│   │   ├── styles/                       # Modular CSS tokens, components, layout, and resets
│   │   ├── utils/                        # Pure client utilities (collectionUtils, formatters, validation)
│   │   ├── App.jsx                       # React Router SPA routes with lazy-loaded code-splitting
│   │   ├── index.css                     # Global stylesheet importing design tokens & component styles
│   │   └── main.jsx                      # React 18 DOM mount entry point
│   ├── index.html                        # Single SPA entry point for all client routes
│   └── vite.config.js                    # Vite configuration (proxy to :3000, build rollup chunks)
├── server/                               # Node.js Express backend application
│   ├── prompts/receipts/                 # Versioned prompt templates for receipt OCR (v1, v2, v3)
│   ├── scripts/                          # Administrative CLI scripts
│   │   └── set-user-role.js              # Server-side Supabase app_metadata.role assignment
│   ├── src/
│   │   ├── constants/                    # Backend constants (HTTP status, error messages, limits)
│   │   ├── features/                     # Feature-first domain modules
│   │   │   ├── analytics/                # Telemetry capture, batch writer, & reporting
│   │   │   ├── chat/                     # Student query RAG orchestration & SSE streaming
│   │   │   ├── documents/                # Markdown file CRUD on local filesystem
│   │   │   ├── expenseAgent/             # Multi-tool Gemini assistant for SpendWise
│   │   │   ├── expenses/                 # Transaction CRUD, spending summary, & receipt OCR lifecycle
│   │   │   ├── knowledgeBase/            # Document chunking, Qdrant vector indexing, & hybrid retrieval
│   │   │   └── systemPrompt/             # RAG system prompt persistence & factory reset
│   │   ├── routes/
│   │   │   └── adminRoute.js             # Protected admin aggregator (/api/admin/*)
│   │   ├── shared/                       # Cross-cutting infrastructure modules
│   │   │   ├── errors/                   # AppError hierarchy (ValidationError, NotFoundError, etc.)
│   │   │   ├── guardrails/               # Prompt injection filter, response validator, timeouts
│   │   │   ├── integrations/             # External service wrappers
│   │   │   │   ├── ai/                   # AI provider registry & Google Gemini SDK implementation
│   │   │   │   └── supabase.js           # Supabase client factories (service, user-scoped, auth)
│   │   │   └── middleware/               # Express middleware (auth, authorize, rate limit, validation)
│   │   ├── config.js                     # Centralized environment variable loader & validation
│   │   └── server.js                     # Express server setup, middleware stack, & route mounting
│   └── Dockerfile                        # Server production container definition
├── data/                                 # Persistent filesystem data storage
│   ├── knowledge/                        # Authoritative handbook markdown files
│   └── prompts/                          # Active & factory default system prompts
├── docs/                                 # Project documentation & architecture records
│   ├── adr/                              # Architectural Decision Records (ADR 0001: SpendWise Auth)
│   ├── ai-receipts/                      # Receipt OCR & Multimodal evaluation documentation
│   ├── architecture/                     # Architecture documentation & audit reports
│   └── SPENDWISE_AUTHENTICATION_GUIDE.md # Auth setup, role management, & route protection guide
├── evals/                                # Evaluation suites
│   ├── rag/                              # RAG accuracy & retrieval acceptance test runner
│   └── receipts/                         # Multimodal receipt extraction live fixtures & evaluation
├── supabase/                             # Database migrations & security verification scripts
│   ├── migrations/                       # PostgreSQL migrations (transactions, receipts, RPCs)
│   └── tests/                            # Security contract tests & concurrency validations
├── tests/                                # Automated tests (Node.js test runner)
│   ├── integration/                      # Route orchestration & API integration tests
│   └── unit/                             # Unit tests for services, utilities, validation, & middleware
├── docker-compose.yml                    # Multi-container orchestration (client + server)
└── package.json                          # Root orchestration scripts (test, dev, set-role)
```

---

## 2. Main Feature Flows

### 2.1. Authentication & Session Management
- **Provider**: Supabase Auth (GoTrue) over HTTPS with PKCE flow.
- **Entry Points**: 
  - [AuthPage.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/components/auth/AuthPage.jsx) (`/`, `/auth`): Supports Sign In, Sign Up with email/password, Google OAuth, and Password Reset requests.
  - [AuthCallbackPage.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/components/auth/AuthCallbackPage.jsx) (`/auth/callback`): Exchanges PKCE `code` from query params or `#access_token` hash fragments for a persistent browser session via `exchangeCodeForSessionFromUrl()`.
  - [ResetPasswordPage.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/components/auth/ResetPasswordPage.jsx) (`/reset-password`): Verifies recovery token, establishes recovery session, and submits new password via `supabase.auth.updateUser({ password })`.
- **Session Persistence**: Stored in `localStorage` under `sb-<project-ref>-auth-token` with automatic token refresh managed by `supabase-js`.
- **Post-Authentication Routing**:
  - Controlled by [getPostAuthPath()](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/services/supabaseAuth.js#L47):
    - Admins (`app_metadata.role === 'admin'`) are routed to `/analytics` (or `/admin` if requested).
    - Regular users are routed to `/expense`.
    - Unauthenticated requests are redirected to `/auth?next=<encodedPath>`.

### 2.2. Role Management & Authorization
- **Authority**: Roles originate **exclusively** from trusted `app_metadata.role` in Supabase Auth. Client-supplied `user_metadata` is strictly ignored by both frontend route guards and backend middleware.
- **Administrative Assignment**:
  - Performed server-side using the Supabase Service Role key:  
    `npm run set-role -- <user-uuid> <user|admin>` via [set-user-role.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/server/scripts/set-user-role.js).
- **Backend Authorization**:
  - Mounted on `/api/admin/*` via [adminRoute.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/server/src/routes/adminRoute.js):
    ```js
    router.use(authenticate, authorize('admin'));
    ```
  - [authenticate.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/server/src/shared/middleware/authenticate.js) validates the Bearer token with Supabase Auth (`getUser(token)`), populating `req.user = { id, email, role: user.app_metadata?.role || 'user', token }`.
  - [authorize.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/server/src/shared/middleware/authorize.js) verifies `req.user.role === requiredRole`, returning `403 Forbidden` if unauthorized.
- **Client Route Protection**:
  - [AdminSessionGate.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/components/admin/AdminSessionGate.jsx) (`/admin`, `/analytics`): Verifies `getUserRole(session) === 'admin'`. Redirects non-admins to `/expense`.
  - [ExpenseSessionGate.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/components/expense/ExpenseSessionGate.jsx) (`/expense`): Verifies valid authenticated session. Redirects unauthenticated users to `/auth`.
- **Demo Mode Distinction**:
  - Routes `/handbook` and `/demo` render [HandbookView.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/components/HandbookView.jsx) in demo mode. The role switch button modifies client React state (`internalRole`) only and **does not grant access** to `/admin`, `/analytics`, or backend admin endpoints.

### 2.3. Chat & RAG Workflow
- **Entry Points**: `POST /api/user/chat` (synchronous) and `POST /api/user/chat/stream` (Server-Sent Events).
- **Pipeline**:
  1. **Validation**: `chatRateLimiter` (30 req/min) followed by `validateRequest({ body: chatRequestSchema })`.
  2. **Security Guardrails**: Checks query with `detectPromptInjection()` in [promptInjection.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/server/src/shared/guardrails/promptInjection.js). If injection is detected, returns polite refusal immediately without LLM invocation.
  3. **Retrieval**: [ragService.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/server/src/features/knowledgeBase/ragService.js) embeds the query with `embedText()` (Gemini embedding-001 / text-embedding-004) and queries Qdrant Cloud via [retriever.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/server/src/features/knowledgeBase/retriever.js) for top-$K$ candidates ($K=4$).
  4. **Threshold Check**: Evaluates top score against similarity threshold ($0.60$) with Section 11 Amendment boost ($0.55$). If below cutoff, returns early fallback refusal.
  5. **Prompt Assembly**: [promptBuilder.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/server/src/features/knowledgeBase/promptBuilder.js) injects system prompt from `systemPrompt.service.js` and retrieved chunks into an XML-tagged prompt.
  6. **Generation & Telemetry**: Calls `generateAnswer()` or `generateAnswerStream()` on `geminiProvider.js`. Automatically captures latency, token counts, and cost metrics into `usageTracker.js`.
  7. **Client Streaming**: [AnswerContent.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/client/src/components/user/AnswerContent.jsx) animates tokens using `useTextReveal` with grapheme clustering to prevent broken Vietnamese diacritics.

### 2.4. Documents & Knowledge Base Management
- **Document Storage**: Markdown files on local disk under `data/knowledge/` (default: `KB-A_Lumen-Institute-Student-Handbook.md`).
- **Endpoints**: Mounted under `/api/admin/documents` in [documents.routes.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/server/src/features/documents/documents.routes.js):
  - `GET /`: Lists all markdown documents with file size and modified timestamps.
  - `GET /:filename`: Reads document text.
  - `POST /`: Creates new document (validated against path traversal and Markdown Level-2 headers).
  - `PUT /:filename`: Updates existing document content.
  - `DELETE /:filename`: Deletes document from disk.
- **Knowledge Base Endpoints**: Mounted under `/api/admin/` in [knowledgeBase.routes.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/server/src/features/knowledgeBase/knowledgeBase.routes.js):
  - `GET /status`: Checks sync status between filesystem documents and Qdrant vector collection count.
  - `GET /chunks`: Parses markdown files into chunks using `chunker.js` with server-side pagination (`limit`, `offset`, `search`).
  - `POST /index`: Re-indexes all markdown documents into Qdrant Cloud (`indexer.js`) with vector embeddings.

### 2.5. System Prompt Management
- **Storage**: `data/prompts/system_prompt.txt` (active prompt) and `data/prompts/system_prompt_default.txt` (factory default).
- **Endpoints**: Mounted under `/api/admin/prompt` in [systemPrompt.routes.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/server/src/features/systemPrompt/systemPrompt.routes.js):
  - `GET /`: Returns active system prompt string.
  - `PUT /`: Validates length (20–10,000 characters) and updates active prompt.
  - `POST /reset`: Reverts active prompt back to factory default.

### 2.6. AI Usage Analytics & Telemetry
- **Telemetry Pipeline**:
  1. AI provider operations (`embedText`, `generateAnswer`, `generateAnswerStream`, `extractReceiptImage`) call `recordUsage()`.
  2. [analytics.writer.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/server/src/features/analytics/analytics.writer.js) enqueues events and flushes batches every 1,000ms or when batch reaches 10 items.
  3. [analytics.repository.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/server/src/features/analytics/analytics.repository.js) persists records to Supabase table `ai_usage_analytics`. If Supabase is unavailable, maintains an in-memory circular buffer (capacity: 1,000 records).
- **Endpoints**: Mounted under `/api/admin/analytics` in [analytics.routes.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/server/src/features/analytics/analytics.routes.js):
  - `GET /overview`: High-level KPIs (total requests, success/error rates, tokens, latencies, estimated cost).
  - `GET /timeseries`: Aggregated time-series trend buckets (`1h`, `24h`, `7d`, `30d`).
  - `GET /breakdown`: Distributions grouped by `model` or `feature`.
  - `GET /history`: Paginated query transaction logs with attempt details and error categories.

### 2.7. SpendWise Expense Tracking & Receipt Processing
- **Database & Security**:
  - Supabase PostgreSQL with strict Row Level Security (RLS) on `expense_transactions` and `receipts`.
  - All operations use `createUserScopedSupabaseClient(req.user.token)` enforcing user-ownership predicates. Service role key is never used for user transaction queries.
- **Transaction Endpoints**: Mounted under `/api` in [expenses.routes.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/server/src/features/expenses/expenses.routes.js):
  - `GET /transactions`: Filtered and paginated transactions query (search, type, category, date range, amount range, sort).
  - `POST /transactions`: Creates a validated transaction.
  - `PUT /transactions/:id`: Updates an existing transaction.
  - `DELETE /transactions/:id`: Removes transaction (and linked receipt image if created via receipt).
- **Receipt OCR Lifecycle**:
  - `POST /receipts/upload`: Validates image (JPG, PNG, WebP $\le$ 5MB), creates upload record via `create_receipt_upload` RPC, uploads image to Supabase Storage `receipts`, and triggers `extractReceiptImage()` via Gemini vision.
  - `GET /receipts`: Lists user's receipts.
  - `GET /receipts/:id/preview`: Generates a 60-second signed storage URL for secure preview.
  - `POST /receipts/:id/confirm`: Confirms draft transaction via `confirm_receipt_transaction` RPC.
  - `POST /receipts/:id/retry`: Re-extracts details from stored receipt image.
  - `DELETE /receipts/:id`: Removes receipt image from Storage and deletes database row.
- **AI Expense Assistant & Proposals**:
  - Mounted under `/api/expense-agent` in [expenseAgent.routes.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Midterm/Student_Handbook/server/src/features/expenseAgent/expenseAgent.routes.js):
    - `POST /assistant`: Natural language expense assistant using Gemini tool-calling (`search_transactions`, `get_spending_summary`, `create_transaction`).
    - `POST /search`: NL query translated to transaction search.
    - `POST /summary`: NL query translated to spending summary.
    - `POST /create-proposal`: Prepares an in-memory review-only proposal (TTL: 10 minutes) with UUID.
    - `POST /proposals/:id/confirm`: Confirms proposal and persists to `expense_transactions`.
    - `DELETE /proposals/:id`: Discards proposal.

---

## 3. Existing Shared Components, Hooks, Utilities & Infrastructure

### 3.1. Client Reusable UI Components
| Component | Path | Responsibility | Callers |
| :--- | :--- | :--- | :--- |
| `Pagination` | `client/src/components/common/Pagination.jsx` | Accessible pagination toolbar with limit selector and showing count | `DocumentTable`, `ChunkReview`, `AnalyticsHistoryTable` |
| `SearchInput` | `client/src/components/common/SearchInput.jsx` | Controlled search input with clear button and Escape hotkey | `DocumentTable`, `ChunkReview` |
| `SortableHeader` | `client/src/components/common/SortableHeader.jsx` | `<th>` header with accessible `aria-sort` and visual indicator | `DocumentTable`, `AnalyticsHistoryTable` |
| `Drawer` | `client/src/components/common/Drawer.jsx` | Slide-out overlay drawer with backdrop and focus trap support | `AdminDashboard` |
| `PasswordField` | `client/src/components/auth/PasswordField.jsx` | Accessible password input with show/hide toggle | `AuthPage`, `ResetPasswordPage` |
| `ToastContainer` | `client/src/components/toast/ToastContainer.jsx` | Renders active toast alerts stacked on screen | `ToastContext` |
| `ToastItem` | `client/src/components/toast/ToastItem.jsx` | Individual alert item with icon, message, and close button | `ToastContainer` |
| `HealthBadge` | `client/src/components/HealthBadge.jsx` | Shows vector database status (online/offline, indexed chunks count) | `HandbookLayout` |

### 3.2. Client Custom Hooks
| Hook | Path | Responsibility |
| :--- | :--- | :--- |
| `usePagination` | `client/src/hooks/usePagination.js` | Manages page, limit, offset, and navigation calculations |
| `useSort` | `client/src/hooks/useSort.js` | Manages active sort key, direction toggle, and array sorting |
| `useSearch` | `client/src/hooks/useSearch.js` | Manages search query state, debounce, and field filtering |
| `useChat` | `client/src/hooks/useChat.js` | Coordinates conversation message state, SSE streaming, and abort |
| `useDocuments` | `client/src/hooks/useDocuments.js` | Manages document list fetching, editor state, saving, and deletion |
| `useChunks` | `client/src/hooks/useChunks.js` | Handles paginated chunk review state and search filtering |
| `useSystemPrompt`| `client/src/features/systemPrompt/useSystemPrompt.js`| Fetches, updates, and resets RAG system prompt |
| `useAnalytics` | `client/src/hooks/useAnalytics.js` | Loads overview KPIs, timeseries charts, breakdowns, and logs |
| `useAdminDashboard`| `client/src/hooks/useAdminDashboard.js`| Aggregates knowledge base, documents, chunks, and drawer states |
| `useHealth` | `client/src/hooks/useHealth.js` | Polls backend `/api/health` vector database connection status |
| `useKnowledgeBase`| `client/src/hooks/useKnowledgeBase.js`| Checks status and triggers re-indexing workflow |
| `useDrawer` | `client/src/shared/hooks/useDrawer.js` | Manages slide-out drawer state, accessibility focus, Escape dismissal, and scroll lock |
| `useTextReveal` | `client/src/hooks/useTextReveal.js` | Animated grapheme-by-grapheme text reveal for streaming answers |

### 3.3. Client Utilities & Formatters
| Module | Path | Key Exports |
| :--- | :--- | :--- |
| `collectionUtils.js` | `client/src/utils/collectionUtils.js` | `calculatePagination`, `paginateItems`, `getNestedValue`, `filterItems`, `sortItems`, `toggleSortDirection` |
| `formatters.js` | `client/src/utils/formatters.js` | `formatSectionTitle`, `formatScore`, `formatFileSize`, `splitGraphemes`, `formatNumber`, `formatTimestamp`, `formatMoney` |
| `validation.js` | `client/src/utils/validation.js` | `validateRequired`, `validateNonEmpty`, `validateStringLength`, `validateEmail`, `validateNumber`, `validateInteger`, `validatePagination`, `validateFilename`, `validateMarkdownContent`, `validateSearchQuery`, `validatePrompt`, `validateForm` |
| `tableUtils.js` | `client/src/utils/tableUtils.js` | Re-exports all functions from `collectionUtils.js` (backward compatibility) |

### 3.4. Server Shared Infrastructure & Middleware
| Module | Path | Responsibility |
| :--- | :--- | :--- |
| `validateRequest.js` | `server/src/shared/middleware/validateRequest.js` | Zod schema validation middleware; parses `body`, `query`, and `params` into `res.locals.validated` |
| `authenticate.js` | `server/src/shared/middleware/authenticate.js` | Verifies Supabase Bearer JWT token; extracts trusted `app_metadata.role` into `req.user` |
| `authorize.js` | `server/src/shared/middleware/authorize.js` | Role-based route guard middleware verifying `req.user.role === role` |
| `rateLimiter.js` | `server/src/shared/middleware/rateLimiter.js` | Express rate limiters: `apiRateLimiter` (300/15m), `chatRateLimiter` (30/1m), `indexingRateLimiter` (10/15m) |
| `errorHandler.js` | `server/src/shared/middleware/errorHandler.js` | Centralized Express error handler; formats operational `AppError` and hides internal stack traces |
| `notFoundHandler.js` | `server/src/shared/middleware/notFoundHandler.js` | Catches unmatched API paths and returns 404 JSON |
| `AppError.js` | `server/src/shared/errors/AppError.js` | Custom error classes: `AppError`, `ValidationError`, `NotFoundError`, `UnauthorizedError`, `ForbiddenError`, `ConflictError`, `DatabaseError` |
| `supabase.js` | `server/src/shared/integrations/supabase.js` | Factories: `getSupabaseClient` (service role), `createUserScopedSupabaseClient` (RLS user client), `createSupabaseAuthClient` |
| `geminiProvider.js` | `server/src/shared/integrations/ai/providers/geminiProvider.js` | Official `@google/genai` integration: `embedText`, `generateAnswer`, `generateAnswerStream`, `extractReceiptImage` with exponential retry |

---

## 4. Important Functions & File Map

| Function | File Path | Callers | Responsibility |
| :--- | :--- | :--- | :--- |
| `orchestrateChat` | `server/src/features/assistant/assistant.service.js` | `assistant.controller.js`, `evals/rag/runner.js` | Central orchestrator selecting AI strategy, coordinating tools & generation |
| `orchestrateChatStream` | `server/src/features/assistant/assistant.service.js` | `assistant.controller.js` | Central streaming orchestrator streaming SSE deltas to client |
| `retrieveChunks` | `server/src/features/knowledgeBase/retriever.js` | `ragService.js` | Queries Qdrant Cloud collection using 3072-dim cosine similarity |
| `runIndexing` | `server/src/features/knowledgeBase/indexer.js` | `knowledgeBase.service.js` | Chunks markdown files, resets collection, embeds chunks, and upserts to Qdrant |
| `recordUsage` | `server/src/features/analytics/usageTracker.js` | `geminiProvider.js` | Formats telemetry records and enqueues to batch writer queue |
| `extractReceiptImage` | `server/src/shared/integrations/ai/providers/geminiProvider.js` | `receipt.service.js`, `evals/receipts/run-live-gemini.js` | Sends image bytes and structured JSON schema to Gemini vision model |
| `listTransactions` | `server/src/features/expenses/expenses.service.js` | `expenses.controller.js`, `expenseAgent.service.js` | RLS-scoped transaction query with filters, sorting, and pagination |
| `getSpendingSummary` | `server/src/features/expenses/expenses.service.js` | `expenses.controller.js`, `expenseAgent.service.js` | Calculates total income, expense, balance, and category totals in VND |
| `uploadReceipt` | `server/src/features/expenses/receipt.service.js` | `expenses.controller.js` | Executes upload RPC, stores image in Supabase Storage, and extracts draft |
| `runExpenseAssistantForUser` | `server/src/features/expenseAgent/expenseAgent.service.js` | `expenseAgent.controller.js` | Executes Gemini multi-tool calling agent for search, summary, or proposals |
| `getUserRole` | `client/src/services/supabaseAuth.js` | `AdminSessionGate.jsx`, `AuthPage.jsx`, `tests` | Resolves trusted role from `app_metadata.role` (defaults to `'user'`) |
| `apiRequest` | `client/src/services/apiClient.js` | All client API services (`chatApi`, `documentsApi`, etc.) | Unified fetch wrapper with Bearer token injection and error handling |

---

## 5. Feature Dependencies & Shared Module Graph

```
                                    ┌────────────────────────┐
                                    │      Client Entry      │
                                    │   (App.jsx / Routes)   │
                                    └───────────┬────────────┘
                                                │
                 ┌──────────────────────────────┼──────────────────────────────┐
                 ▼                              ▼                              ▼
     ┌───────────────────────┐      ┌───────────────────────┐      ┌───────────────────────┐
     │      Auth Views       │      │   Student Handbook    │      │  SpendWise Workspace  │
     │  (AuthPage, Callback, │      │  (HandbookView, Chat, │      │  (ExpenseSessionGate, │
     │    ResetPassword)     │      │   AdminDashboard)     │      │   ExpenseTrackerApp)  │
     └───────────┬───────────┘      └───────────┬───────────┘      └───────────┬───────────┘
                 │                              │                              │
                 │     ┌────────────────────────┴────────────────────────┐     │
                 └───► │        Shared Client Services & Hooks           │ ◄───┘
                       │ (supabaseAuth, apiClient, collectionUtils,       │
                       │  usePagination, useSort, useSearch, ToastContext)│
                       └────────────────────────┬────────────────────────┘
                                                │ HTTPS REST / SSE
════════════════════════════════════════════════╪══════════════════════════════════════════════════
                                                │ Express Routes
                       ┌────────────────────────▼────────────────────────┐
                       │           Shared Server Middleware              │
                       │ (authenticate, authorize, validateRequest,      │
                       │  rateLimiter, errorHandler, AppError)           │
                       └────────┬───────────────┬───────────────┬────────┘
                                │               │               │
                 ┌──────────────┴───────┐       │       ┌───────┴──────────────┐
                 ▼                      ▼       ▼       ▼                      ▼
     ┌───────────────────────┐      ┌───────────────────────┐      ┌───────────────────────┐
     │   Chat & Knowledge    │      │ Analytics & Telemetry │      │ Expenses & Receipts   │
     │ (chat.service, RAG,   │      │ (usageTracker,        │      │ (expenses.service,    │
     │  retriever, chunker)  │      │  analytics.writer,    │      │  receipt.service,     │
     └───────────┬───────────┘      │  analytics.repository)│      │  expenseAgent.service)│
                 │                  └───────────┬───────────┘      └───────────┬───────────┘
                 │                              │                              │
                 └──────────────────────────────┼──────────────────────────────┘
                                                │
                       ┌────────────────────────▼────────────────────────┐
                       │         Shared Integrations & Providers         │
                       │  - AI: geminiProvider (@google/genai SDK)       │
                       │  - Vector: Qdrant Cloud (qdrantCollection)      │
                       │  - DB & Auth: Supabase (PostgreSQL / RLS)       │
                       └─────────────────────────────────────────────────┘
```
