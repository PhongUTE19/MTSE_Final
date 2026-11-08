# SpendWise: Smart Expense Tracker
## User Stories & Acceptance Criteria — Milestone 1 (M1)

- **Specification Version:** v1.2 (Consolidated & English-Audited)
- **Team Composition:** 3 Members
- **Committed AI Scope:** Capability B (Tool-Using Agent), Capability C (Structured Output), Capability D (Multimodal Input)
- **Deliverable Type:** Web Application (React + Vite + Express + PostgreSQL via Supabase)

---

## Table of Contents
1. [Product Context and Problem Statement](#1-product-context-and-problem-statement)
2. [User Story Structure and Acceptance Criteria Rules](#2-user-story-structure-and-acceptance-criteria-rules)
3. [Summary of Milestone 1 User Stories](#3-summary-of-milestone-1-user-stories)
4. [Detailed User Stories & Acceptance Criteria](#4-detailed-user-stories--acceptance-criteria)
5. [Source-Level Requirement Traceability Matrix](#5-source-level-requirement-traceability-matrix)
6. [Guidelines Requirement Coverage Matrix](#6-guidelines-requirement-coverage-matrix)
7. [Scope Boundaries and Engineering Deliverables](#7-scope-boundaries-and-engineering-deliverables)
8. [Document History & Authoritative Reference](#8-document-history--authoritative-reference)

---

## 1. Product Context and Problem Statement

### 1.1 Target Users
Individual users—primarily university students and early-career professionals—who need to track daily personal expenses and understand spending patterns without the friction of tedious manual data entry.

### 1.2 Core Problem
- Manual receipt entry is time-consuming and error-prone.
- Categorization is frequently inconsistent, making month-end reviews difficult.
- Finding past transactions requires cumbersome filtering.
- Calculating spending summaries across custom dates requires manual mental math or separate spreadsheets.

### 1.3 Solution & Scope Boundaries
- **In-Scope (Milestone 1)**:
  - Manual income/expense transaction logging and receipt image upload.
  - Multimodal AI (Gemini) reading receipt images and extracting structured draft transactions.
  - Automatic category suggestion backed by strict JSON schemas.
  - Natural-language Expense Assistant using tool execution (`search_transactions`, `get_spending_summary`, `create_transaction` proposal).
  - Explicit confirmation gate before committing any AI-proposed transaction to the database.
  - Database-calculated analytics dashboard (SQL math, never hallucinated LLM arithmetic).
- **Out-of-Scope (Strict Non-Goals)**:
  - Direct banking integrations, open-banking APIs, bank scraping, or automated synchronization.
  - Payment processing, money transfers, account balance top-ups, or peer-to-peer payments.
  - Multi-agent orchestration or automated background autonomous financial mutations.
  - RAG is implemented as existing technical infrastructure for documentation and handbook querying, but is explicitly **not** a committed Milestone 1 user-facing capability.

---

## 2. User Story Structure and Acceptance Criteria Rules

### 2.1 User Story Format
```
As a [role],
I want [goal],
So that [benefit].
```

### 2.2 Acceptance Criteria Format
Acceptance criteria use the strict **Given – When – Then** format:
- **Given** [precondition or initial context],
- **When** [specific user action or system event occurs],
- **Then** [observable, verifiable outcome or invariant].

### 2.3 Priority Definitions
- **Must Have**: Core mandatory functionality for Milestone 1 delivery.
- **Should Have**: Secondary priority; implemented if time permits after all Must Have stories are verified.

### 2.4 Separation of Engineering Tasks
Engineering deliverables—including Docker containerization, prompt versioning in Git, Architectural Decision Records (ADRs), evaluation harness scripts, and `AI_USAGE.md`—are tracked separately as engineering tasks and not mixed into functional user stories.

---

## 3. Summary of the 14 User Stories

| Story ID | User Story Title | Priority | Category / Requirement Mapping |
|---|---|---|---|
| **US-01** | Sign-In & Role-Based Access Control | **Must Have** | Authentication / Google OAuth2 + JWT + RBAC |
| **US-02** | Income & Expense Transaction Management | **Must Have** | CRUD / Persistent Storage / Tenant Isolation |
| **US-03** | Search, Filter, Sort & Paginate Transactions | **Must Have** | Query Coordination / Server-side Pagination |
| **US-04** | Income & Expense Category Management | **Must Have** | Category Organization / System Isolation |
| **US-05** | Receipt Image Upload & Storage Management | **Must Have** | File Upload / Validation / Private Storage |
| **US-06** | AI-Assisted Transaction Extraction from Receipts | **Must Have** | Capability C (Structured Output) + D (Multimodal) |
| **US-07** | AI Category Suggestion & Classification | **Must Have** | Capability C (Structured Output) |
| **US-08** | Financial Dashboard & Spending Analytics | **Must Have** | Analytics / SQL Aggregations |
| **US-09** | Natural-Language Financial Q&A Assistant | **Must Have** | Capability B (Tool-Using Agent) |
| **US-10** | AI-Assisted Transaction Creation with Confirmation | **Must Have** | Capability B (Agent Tools / Confirmation Gate) |
| **US-11** | Monthly Budget Setup & Threshold Tracking | **Should Have**| Budget Management (Non-AI) |
| **US-12** | AI Assistant Feedback, Streaming & Error Handling | **Must Have** | SSE Streaming / Guardrails / Fallback |
| **US-13** | Privacy, Data Isolation & Security Guardrails | **Must Have** | Privacy / Row-Level Security (RLS) / Tenant Isolation |
| **US-14** | Administrator AI Telemetry & Observability | **Must Have** | AI Logging / Token & Cost Monitoring / Admin Portal |

---

## 4. Detailed User Stories and Acceptance Criteria

### US-01: Sign-In & Role-Based Access Control
- **Role**: User / Administrator
- **User Story**: *As a user, I want to sign in securely using Google OAuth2 or email/password, so that I can safely access my private financial records.*
- **Priority**: Must Have
- **Category**: Authentication / OAuth2 + JWT + RBAC
- **Acceptance Criteria**:
  - **AC-01**: Given an unauthenticated visitor, when accessing protected user routes (e.g., `/expense`), then the system redirects to the authentication page (`/auth`).
  - **AC-02**: Given successful Google OAuth2 or password authentication, when redirected back to the application, then a valid JWT session is established and personal records load.
  - **AC-03**: Given an expired or invalid JWT, when invoking protected backend endpoints, then the server rejects the request with HTTP `401 Unauthorized`.
  - **AC-04**: Given a user with role `user`, when attempting to access admin-only endpoints (e.g., `/api/admin/*`) or admin UI routes, then the system rejects access with HTTP `403 Forbidden`.
  - **AC-05**: Given an authenticated session, when the user explicitly signs out, then local session tokens are cleared and subsequent requests to protected endpoints are blocked.

---

### US-02: Income & Expense Transaction Management
- **Role**: User
- **User Story**: *As a user, I want to create, view, update, and delete income and expense transactions, so that I can maintain an accurate financial record.*
- **Priority**: Must Have
- **Category**: CRUD / Persistent Storage / Tenant Isolation
- **Acceptance Criteria**:
  - **AC-01**: Given valid transaction fields (type `income` or `expense`, positive amount, date, valid category, merchant), when submitted, then the transaction is persisted in PostgreSQL with the user's ID.
  - **AC-02**: Given existing transactions belonging to the user, when opening the transaction list or details, then all stored fields match accurately.
  - **AC-03**: Given an owned transaction, when the user edits valid fields, then the updates are saved and reflected immediately.
  - **AC-04**: Given a delete request, when the user confirms deletion, then the transaction is permanently removed from the active list.
  - **AC-05**: Given non-positive amounts, invalid dates, or missing required fields, when submitted, then the system rejects the input with specific validation errors without saving.
  - **AC-06**: Given a transaction ID belonging to another user, when attempting to view, update, or delete it, then the server returns HTTP `404 Not Found`.
  - **AC-07**: Given a server restart, when the user logs in, then previously saved transactions remain intact in persistent storage.

---

### US-03: Search, Filter, Sort & Paginate Transactions
- **Role**: User
- **User Story**: *As a user, I want to search, filter, sort, and paginate through my transaction history, so that I can locate specific expenses quickly.*
- **Priority**: Must Have
- **Category**: Query Coordination / Server-side Pagination
- **Acceptance Criteria**:
  - **AC-01**: Given transaction history, when entering search text (merchant or description), then the list displays only matching items.
  - **AC-02**: Given filter criteria (date range, transaction type, category), when applied, then only records satisfying all active filters are returned.
  - **AC-03**: Given sort column selection (date or amount, ascending or descending), when toggled, then results are ordered accordingly.
  - **AC-04**: Given results exceeding the page size limit, when navigating between pages, then records and pagination metadata (`page`, `totalPages`, `totalCount`) update correctly.
  - **AC-05**: Given search or filter parameters matching zero records, then the UI displays a clean empty state without runtime errors.

---

### US-04: Income & Expense Category Management
- **Role**: User
- **User Story**: *As a user, I want to organize my transactions with standard categories, so that my income and expenses are classified meaningfully.*
- **Priority**: Must Have
- **Category**: Category Organization / System Isolation
- **Acceptance Criteria**:
  - **AC-01**: Given a new user account, when viewing available categories, then predefined standard expense and income categories are available by default.
  - **AC-02**: Given a transaction form, when selecting a category, then only categories valid for the selected transaction type (`income` vs `expense`) are selectable.
  - **AC-03**: Given a custom category request, when submitted with a valid name, then the category is saved and associated with the user account. *(Gap note: Custom category CRUD is not yet exposed via dedicated API).*
  - **AC-04**: Given an in-use category, when attempting to delete it, then the system requires reassigning associated transactions or prevents deletion with an explanatory message.
  - **AC-05**: Given categories created by another user, when queried, then the system isolates them and never displays them to other users.

---

### US-05: Receipt Image Upload & Storage Management
- **Role**: User
- **User Story**: *As a user, I want to upload and preview receipt images, so that I can preserve purchase proof and prepare it for AI-assisted scanning.*
- **Priority**: Must Have
- **Category**: File Upload / Validation / Private Storage
- **Acceptance Criteria**:
  - **AC-01**: Given an image file in JPG, PNG, or WebP format under 5 MB, when uploaded, then the file is stored in a private Supabase storage bucket associated with the user.
  - **AC-02**: Given an uploaded receipt image, when opening the review modal, then the user can preview the image alongside extraction status.
  - **AC-03**: Given an unsupported MIME type, corrupt file header (magic byte mismatch), or file exceeding 5 MB, when uploaded, then the system rejects it immediately with a descriptive error.
  - **AC-04**: Given a valid uploaded receipt, when analysis is triggered, then the image is securely passed to the multimodal AI pipeline.
  - **AC-05**: Given a receipt file belonging to another user, when requested via API or direct URL, then access is denied via Row-Level Security policies.
  - **AC-06**: Given an extraction failure or user cancellation, then temporary files and storage allocations are cleaned up according to storage lifecycle policy.

---

### US-06: AI-Assisted Transaction Extraction from Receipts
- **Role**: User
- **User Story**: *As a user, I want multimodal AI to extract merchant, date, total amount, and items from my receipt image, so that I can log expenses without manual typing.*
- **Priority**: Must Have
- **Category**: Capability C (Structured Output) + Capability D (Multimodal Input)
- **Acceptance Criteria**:
  - **AC-01**: Given a clear receipt image, when processing extraction, then Gemini analyzes the image via multimodal prompt and returns structured JSON.
  - **AC-02**: Given successfully recognized fields, then the output includes merchant name, transaction date, total amount, currency, and line items (if visible).
  - **AC-03**: Given AI output, when validated on the backend via Zod schema, then malformed or missing required schema structures are rejected and never saved directly as transactions.
  - **AC-04**: Given unreadable or missing fields, then the system flags them as null or requires review rather than inventing hallucinated values.
  - **AC-05**: Given extracted draft data in the UI, when the user edits and clicks Confirm, then the transaction is saved and linked to the receipt ID.
  - **AC-06**: Given the draft preview, when the user clicks Cancel, then no transaction is created in the database.
  - **AC-07**: Given a non-receipt image (e.g., photo of a cat, landscape, or identity document), then the guardrail returns `NOT_A_RECEIPT` and allows manual entry.
  - **AC-08**: Given line items and a total amount on the receipt, the extraction logic does not double-count line item amounts into the transaction total.

---

### US-07: AI Category Suggestion & Classification
- **Role**: User
- **User Story**: *As a user, I want the AI to suggest the most appropriate spending category based on receipt content, so that my records stay organized with minimal effort.*
- **Priority**: Must Have
- **Category**: Capability C (Structured Output)
- **Acceptance Criteria**:
  - **AC-01**: Given merchant and item data, when running extraction, then AI selects a category strictly from the predefined `RECEIPT_CATEGORIES` enum.
  - **AC-02**: Given the AI response, when validated against backend schemas, then any unrecognized category string defaults safely to `"Other expenses"`.
  - **AC-03**: Given the suggested category in the draft modal, when the user overrides it with a different choice, then the user's manual selection is saved.
  - **AC-04**: Given ambiguous or borderline items, the system presents the best suggestion in the review modal without making permanent unreviewed changes.
  - **AC-05**: Given AI service unavailability, the user can still select from the standard category dropdown manually.

---

### US-08: Financial Dashboard & Spending Analytics
- **Role**: User
- **User Story**: *As a user, I want to view spending summaries and category breakdowns, so that I can understand my financial status over time.*
- **Priority**: Must Have
- **Category**: Analytics / SQL Aggregations
- **Acceptance Criteria**:
  - **AC-01**: Given saved transactions, when viewing the dashboard, then the system displays total income, total expenses, and net savings.
  - **AC-02**: Given a selected date period (e.g., current month or custom date range), then all aggregated figures recalculate to reflect only transactions in that range.
  - **AC-03**: Given categorized expense transactions, then category distribution totals display proportional spending accurately.
  - **AC-04**: Given transaction mutations (add, edit, delete), then refreshed dashboard metrics immediately reflect the updated numbers.
  - **AC-05**: Given zero transactions in the selected period, then the dashboard renders a zero/empty state without division-by-zero or calculation crashes.
  - **AC-06**: Given an AI service disruption, the dashboard remains 100% operational because calculations are executed directly by SQL/database aggregations.

---

### US-09: Natural-Language Financial Q&A Assistant
- **Role**: User
- **User Story**: *As a user, I want to ask questions about my spending in plain English or Vietnamese, so that I can understand my records without manual spreadsheet lookups.*
- **Priority**: Must Have
- **Category**: Capability B (Tool-Using Agent)
- **Acceptance Criteria**:
  - **AC-01**: Given a spending summary query (e.g., "How much did I spend this month?"), then Gemini autonomously selects and executes the `get_spending_summary` tool with resolved dates.
  - **AC-02**: Given a transaction lookup query (e.g., "Find coffee expenses last week"), then Gemini executes the `search_transactions` tool with accurate filter arguments.
  - **AC-03**: Given relative date expressions ("hôm nay", "hôm qua", "tuần này", "tháng này"), the agent resolves dates relative to Vietnam calendar time (`Asia/Ho_Chi_Minh`), never UTC.
  - **AC-04**: Given mathematical operations (sums, differences, totals), calculations are performed by backend database queries, never calculated through raw LLM arithmetic.
  - **AC-05**: Given a query with no matching transactions, the assistant explicitly states that no records were found and never invents fake amounts.
  - **AC-06**: Given user A's session, agent tool executions only query user A's records, never accessing user B's data.
  - **AC-07**: Given ambiguous queries without clear timeframes (e.g., "recently"), the assistant asks one concise clarifying question rather than guessing.

---

### US-10: AI-Assisted Transaction Creation with Confirmation
- **Role**: User
- **User Story**: *As a user, I want the AI assistant to help me prepare a transaction from chat while requiring my explicit confirmation before saving, so that I retain full control over my data.*
- **Priority**: Must Have
- **Category**: Capability B (Agent Tools / Confirmation Gate)
- **Acceptance Criteria**:
  - **AC-01**: Given a natural-language transaction request (e.g., "Spent 50k on lunch at Highlands today"), then Gemini calls `create_transaction` to generate a proposal card in the UI.
  - **AC-02**: Given a generated proposal, no transaction is written to the database until the user explicitly clicks Confirm.
  - **AC-03**: Given a user confirmation, when the backend validates proposal authenticity, expiration, and user ownership, then the transaction is committed to PostgreSQL.
  - **AC-04**: Given a user cancellation or dismissal, then the proposal is discarded and no database record is created.
  - **AC-05**: Given an ambiguous type (e.g., "added 500k") or an internal transfer/wallet top-up, the agent asks for clarification rather than creating an incorrect income or expense proposal.
  - **AC-06**: Given a confirmed proposal, re-submitting the same confirmation token is rejected (idempotency, exactly-once commit).
  - **AC-07**: Given backend database failure during confirmation, the UI clearly displays the error message and does not falsely claim success.

---

### US-11: Monthly Budget Setup & Threshold Tracking
- **Role**: User
- **User Story**: *As a user, I want to set monthly spending limits per category, so that I can keep track of my budget and receive alerts before overspending.*
- **Priority**: **Should Have** (Secondary priority for Milestone 1)
- **Category**: Budget Management (Non-AI)
- **Acceptance Criteria**:
  - **AC-01**: Given a target month, category, and positive limit amount, when saved, then a budget threshold is recorded for the user.
  - **AC-02**: Given an existing budget, when edited, then the limit updates and progress metrics re-index.
  - **AC-03**: Given logged transactions within the budget's month and category, the system calculates spent amount and remaining balance against the limit.
  - **AC-04**: Given spending exceeding 80% or 100% of the budget threshold, the UI displays clear visual warning indicators.
  - **AC-05**: Given budget deletion, associated transactions remain intact and are not deleted.
  - **AC-06**: Given budget records belonging to another user, access is strictly blocked.
  - *(Implementation Note: This Should Have story is tracked in the engineering backlog and not yet exposed in the active M1 database schema).*

---

### US-12: AI Assistant Feedback, Streaming & Error Handling
- **Role**: User
- **User Story**: *As a user, I want to see clear processing indicators and understandable error messages from AI features, so that I always know the status of my request.*
- **Priority**: Must Have
- **Category**: SSE Streaming / Guardrails / Fallback
- **Acceptance Criteria**:
  - **AC-01**: Given a user message or upload, the UI displays active loading states and disables duplicate submissions.
  - **AC-02**: Given streaming assistant responses, tokens render progressively via Server-Sent Events (`metadata`, `delta`, `done`) without screen jitter.
  - **AC-03**: Given provider timeouts, rate limits (HTTP 429), or empty completions, the system handles retries with backoff and presents clean error explanations.
  - **AC-04**: Given an out-of-scope query (e.g., general world trivia or coding assistance), the relevance guardrail returns an immediate courteous refusal without calling generative LLM models.
  - **AC-05**: Given prompt injection or jailbreak attempts in receipts or chat, the system treats user content as passive data and enforces system boundaries.
  - **AC-06**: Given an external AI outage, all core non-AI features (manual transaction entry, filters, dashboard, auth) continue functioning seamlessly.

---

### US-13: Privacy, Data Isolation & Security Guardrails
- **Role**: User
- **User Story**: *As a user, I want my financial records to stay private and isolated, so that no other user can access my transactions or receipt images.*
- **Priority**: Must Have
- **Category**: Privacy / Row-Level Security (RLS) / Tenant Isolation
- **Acceptance Criteria**:
  - **AC-01**: Given an authenticated user session, backend queries automatically scope transactions and storage paths strictly to `auth.uid() = user_id`.
  - **AC-02**: Given an ID parameter for a transaction or receipt belonging to another tenant, the backend rejects the request with HTTP `404 Not Found`.
  - **AC-03**: Given AI queries, the backend sends only the minimal parameters needed for the tool or receipt, never exfiltrating full user account metadata.
  - **AC-04**: Given API validation errors, the server returns sanitized error messages, never leaking database schemas, stack traces, or internal tokens.
  - **AC-05**: Given AI usage telemetry, prompt hashes (`hashPrompt`) and token totals are recorded, but sensitive financial amounts and raw prompts are never stored in plain-text telemetry logs.

---

### US-14: Administrator AI Telemetry & Observability
- **Role**: Administrator
- **User Story**: *As an administrator, I want to monitor AI request counts, model distributions, token usage, latencies, and failure rates, so that I can ensure platform reliability and monitor operational costs.*
- **Priority**: Must Have
- **Category**: AI Logging / Token & Cost Monitoring / Admin Portal
- **Acceptance Criteria**:
  - **AC-01**: Given an authenticated admin, when navigating to the AI Analytics page, then aggregated KPI cards display total requests, success rate, failure rate, and refusal rate.
  - **AC-02**: Given logged telemetry, the dashboard displays token metrics (input tokens, output tokens, total tokens) and average latency alongside P50 and P95 percentiles.
  - **AC-03**: Given time range filters (1h, 24h, 7d, 30d, all), metrics dynamically re-aggregate over the selected window.
  - **AC-04**: Given an AI request lifecycle, the server records prompt version hash, model ID, tools called (`toolsExecuted`), token counts, duration in milliseconds, and final outcome.
  - **AC-05**: Given a regular user session without admin privileges, access to `/api/admin/*` and the admin analytics page is rejected with HTTP `403 Forbidden`.
  - **AC-06**: Given telemetry inspection, raw user financial data and private receipt images are never visible in the administrative telemetry logs.

---

## 5. Source-Level Requirement Traceability Matrix

This matrix maps every Milestone 1 User Story to verified source code, API endpoints, UI components, and automated test suites.

| Story ID | Key Acceptance Criteria | API Endpoints & UI Components | Current Source Files | Automated Test Files & Suites | Implementation Status | Test Coverage Status |
|---|---|---|---|---|---|---|
| **US-01** | AC-01 to AC-05: OAuth2/Password login, JWT verification, 401/403 RBAC, route guards, sign-out | • Supabase Auth SDK<br>• `AuthPage.jsx`<br>• `AuthenticatedRouteGuard.jsx`<br>• `AdminRouteGuard.jsx` | • `client/src/features/auth/AuthPage.jsx`<br>• `client/src/shared/services/supabaseAuth.js`<br>• `server/src/shared/middleware/authenticate.js`<br>• `server/src/features/auth/auth.service.js`<br>• `server/scripts/set-user-role.js` | • `tests/unit/middleware.test.js`<br>• `tests/unit/clientAuth.test.js`<br>• `tests/unit/authService.test.js`<br>• `tests/unit/adminLayoutSidebar.test.js` | **Implemented** | **Verified & Passing** (100% tests pass) |
| **US-02** | AC-01 to AC-07: Transaction CRUD, validation, tenant isolation, database persistence | • `POST /api/transactions`<br>• `GET /api/transactions`<br>• `PUT /api/transactions/:id`<br>• `DELETE /api/transactions/:id`<br>• `TransactionModal.jsx` | • `server/src/features/expenses/expenses.controller.js`<br>• `server/src/features/expenses/expenses.service.js`<br>• `server/src/features/expenses/expenses.schemas.js`<br>• `client/src/features/expenses/TransactionModal.jsx`<br>• `client/src/shared/services/expenseApi.js` | • `tests/unit/transactionFields.test.js`<br>• `tests/unit/backendValidation.test.js`<br>• `tests/unit/clientValidation.test.js` | **Implemented** | **Verified & Passing** (Unit validation & schema checks passing) |
| **US-03** | AC-01 to AC-05: Search, filter, date range, sort order, server pagination, empty states | • `GET /api/transactions?search=&type=&category=&startDate=&endDate=&sortBy=&sortOrder=&page=&limit=`<br>• `TransactionTable.jsx` | • `server/src/features/expenses/expenses.service.js`<br>• `server/src/features/expenses/expenses.schemas.js`<br>• `client/src/features/expenses/TransactionTable.jsx`<br>• `client/src/shared/components/Pagination.jsx`<br>• `client/src/shared/hooks/usePagination.js` | • `tests/unit/transactionTable.test.js`<br>• `tests/unit/transactionFields.test.js` | **Implemented** | **Verified & Passing** (Coordinator, sort & pagination tests passing) |
| **US-04** | AC-01, AC-02: Default category enums & validation.<br>AC-03 to AC-05: Custom category CRUD & deletion migration | • Transaction Category Dropdown<br>• `expenseConstants.js` | • `client/src/features/expenses/expenseConstants.js`<br>• `server/src/features/expenses/receipt.schemas.js`<br>• `server/src/constants/index.js` | • `tests/unit/transactionFields.test.js` | **Partially Implemented** (Standard system categories implemented; custom category CRUD endpoints **Not Implemented**) | **Partially Covered** (Enum & category reset covered; custom CRUD unverified) |
| **US-05** | AC-01 to AC-06: Receipt image upload (JPG/PNG/WebP, max 5MB), Sharp image validation, private Supabase Storage, draft lifecycle | • `POST /api/receipts/upload`<br>• `receiptUpload.middleware.js`<br>• `ExpensePage.jsx` (Upload Dropzone) | • `server/src/features/expenses/receiptUpload.middleware.js`<br>• `server/src/features/expenses/receipt.service.js`<br>• `client/src/features/expenses/ExpensePage.jsx`<br>• `client/src/shared/services/expenseApi.js` | • `tests/unit/backendValidation.test.js`<br>• `tests/unit/clientValidation.test.js` | **Implemented** | **Verified & Passing** (Magic bytes, dimensions, SHA-256 validated in unit tests) |
| **US-06** | AC-01 to AC-08: Multimodal Gemini OCR, structured JSON schema, Zod guardrails, draft preview & confirm, non-receipt refusal | • `POST /api/receipts/upload`<br>• `POST /api/transactions`<br>• Receipt Review Modal | • `server/src/shared/integrations/ai/providers/geminiProvider.js` (`extractReceiptImage`)<br>• `server/src/features/expenses/receipt.schemas.js`<br>• `server/src/features/expenses/receiptGuardrails.js`<br>• `server/prompts/receipts/receipt-v3.md` | • `tests/unit/guardrails.test.js`<br>• `evals/receipts/run-live-gemini.js`<br>• `evals/receipts/LIVE_EVALUATION_REPORT.md` (20 cases) | **Implemented** | **Verified & Passing** (20 synthetic live evaluation cases: 85% pass rate on v3) |
| **US-07** | AC-01 to AC-05: Automatic category suggestion, `RECEIPT_CATEGORIES` enum matching, fallback to 'Other expenses' | • `extractReceiptImage`<br>• `normalizeCategoryName` | • `server/src/features/expenses/receipt.schemas.js`<br>• `server/src/shared/integrations/ai/providers/geminiProvider.js`<br>• `client/src/features/expenses/ExpensePage.jsx` | • `tests/unit/guardrails.test.js`<br>• `evals/receipts/live-cases.js` | **Implemented** | **Verified & Passing** (Enum validation and normalization tested) |
| **US-08** | AC-01 to AC-06: Database-calculated spending summary, date window filtering, category breakdown, non-AI calculation | • `GET /api/expenses/summary`<br>• `ExpensePage.jsx` (Metrics Cards) | • `server/src/features/expenses/expenses.service.js` (`getSpendingSummary`)<br>• `client/src/features/expenses/ExpensePage.jsx` | • `tests/unit/expenseAgent.test.js`<br>• `tests/unit/transactionFields.test.js` | **Implemented** | **Verified & Passing** (PostgreSQL aggregation queries verified in unit tests) |
| **US-09** | AC-01 to AC-07: Tool-using agent with `search_transactions` and `get_spending_summary`, Vietnam calendar date resolution, zero math hallucinations | • `POST /api/assistant/chat`<br>• `AiExpenseAssistant.jsx` | • `server/src/features/expenseAgent/geminiExpenseAgent.js`<br>• `server/src/features/expenseAgent/expenseAgent.service.js`<br>• `server/src/features/expenseAgent/expenseAgent.routes.js`<br>• `client/src/features/expenses/AiExpenseAssistant.jsx` | • `tests/unit/expenseAgent.test.js` (Subtest 1-12)<br>• `tests/unit/expenseAssistantHistory.test.js` | **Implemented** | **Verified & Passing** (12 unit tests verifying function calling, calendar dates, retry, telemetry) |
| **US-10** | AC-01 to AC-07: Tool-using agent with `create_transaction` proposal generation, human confirmation gate, single-execution idempotency | • `POST /api/assistant/chat`<br>• `POST /api/assistant/confirm`<br>• Proposal Review Card | • `server/src/features/expenseAgent/geminiExpenseAgent.js`<br>• `server/src/features/expenseAgent/expenseAgent.service.js`<br>• `client/src/features/expenses/AiExpenseAssistant.jsx` | • `tests/unit/expenseAgent.test.js` (Subtest 48: 9 confirmation tests) | **Implemented** | **Verified & Passing** (9 tests verifying proposal creation, confirmation, cancel, double-submit rejection) |
| **US-11** | AC-01 to AC-06: Category budget setup, limit threshold calculations, visual overspending warnings | • **Not implemented** | • **Not implemented** *(Tracked in engineering backlog)* | • **Not implemented** | **Not implemented** (Secondary Should Have priority) | **Missing** (No active budget models or tests) |
| **US-12** | AC-01 to AC-06: SSE streaming feedback, out-of-scope refusal guardrail, prompt injection defense, non-AI fallback | • `POST /api/user/chat/stream`<br>• `POST /api/assistant/chat`<br>• `TextReveal` animation | • `server/src/shared/guardrails/scopeGuard.js`<br>• `server/src/shared/guardrails/promptInjection.js`<br>• `server/src/shared/guardrails/timeoutGuard.js`<br>• `client/src/features/expenses/AiExpenseAssistant.jsx` | • `tests/unit/guardrails.test.js`<br>• `tests/unit/textReveal.test.js`<br>• `tests/integration/chatStreaming.test.js` | **Implemented** | **Verified & Passing** (Injection rejection and scope cutoff verified) |
| **US-13** | AC-01 to AC-05: Row-Level Security, tenant isolation, Bearer JWT pass-through, telemetry sanitization | • RLS Policies<br>• User-scoped Supabase client<br>• `sanitizeErrorMessage` | • `server/src/shared/middleware/authenticate.js`<br>• `server/src/features/expenses/expenses.service.js`<br>• `server/src/features/analytics/usageTracker.js` | • `tests/unit/authService.test.js`<br>• `tests/unit/middleware.test.js`<br>• `tests/unit/clientAuth.test.js` | **Implemented** | **Verified & Passing** (Cross-tenant rejection and token sanitization verified) |
| **US-14** | AC-01 to AC-06: Admin AI usage analytics, token metrics, P50/P95 latencies, failure/refusal rates, RBAC protection | • `GET /api/admin/analytics/overview`<br>• `GET /api/admin/analytics/timeseries`<br>• `GET /api/admin/analytics/history`<br>• `AnalyticsDashboard.jsx` | • `server/src/features/analytics/analytics.controller.js`<br>• `server/src/features/analytics/analytics.service.js`<br>• `server/src/features/analytics/analytics.repository.js`<br>• `server/src/features/analytics/usageTracker.js`<br>• `client/src/features/analytics/AnalyticsDashboard.jsx` | • `tests/unit/analytics.test.js`<br>• `tests/unit/aiRateLimiter.test.js`<br>• `tests/unit/adminLayoutSidebar.test.js` | **Partially Implemented** (Token, latency, count, outcome telemetry implemented; financial cost estimation **Not Implemented**) | **Verified & Passing** (Telemetry aggregation and admin access verified) |

---

## 6. Guidelines Requirement Coverage Matrix

| Course Guideline Requirement | M1 User Story & Engineering Mapping | Status & Evidence |
|---|---|---|
| **Google OAuth2 + JWT + RBAC** | US-01, US-13, US-14 | **Complete**: Supabase Auth client, `authenticate.js` middleware, `requireAdmin`, `set-user-role.js` script. |
| **Persistent Database CRUD** | US-02, US-04, US-05, US-11 | **Complete for Core CRUD**: `public.expense_transactions` in PostgreSQL via Supabase RLS. (Budgets US-11 tracked for future milestone). |
| **Search / Filter / Sort / Pagination** | US-03 | **Complete**: Query coordinator in `expenses.service.js`, unit tested in `transactionTable.test.js`. |
| **File Upload AI Input** | US-05, US-06 | **Complete**: Multer memory storage, Sharp image dimension/magic-byte checks, private bucket upload. |
| **Capability B: Tool-Using Agent (≥3 Real Tools)** | US-09, US-10 | **Complete**: `search_transactions`, `get_spending_summary`, `create_transaction` via Gemini function calling. |
| **Human Confirmation for Data Mutations** | US-10 | **Complete**: Two-step proposal generation and confirmation gate (`/api/assistant/confirm`). |
| **Capability C: Structured Output** | US-06, US-07 | **Complete**: Strict Gemini `responseJsonSchema` + Zod `receiptExtractionSchema` + enum constraints. |
| **Capability D: Multimodal Input** | US-05, US-06 | **Complete**: Raw image base64 `inlineData` passed directly to Gemini model for receipt parsing. |
| **Real-time Streaming / SSE** | US-12 | **Complete**: SSE pipeline emitting `metadata`, `delta`, `done` with client fade-in animations. |
| **Admin AI Usage Logging & Telemetry** | US-14 | **Complete for Usage/Latency/Tokens**: Dual-mode persistence (Supabase + In-memory ring buffer). |
| **AI Guardrails (Relevance, Injection, Timeout)** | US-06, US-12, US-13 | **Complete**: `scopeGuard.js`, `promptInjection.js`, `withTimeout.js`, and `receiptGuardrails.js`. |
| **Tenant Privacy & Isolation** | US-01, US-02, US-05, US-09, US-13 | **Complete**: PostgreSQL Row-Level Security (`auth.uid() = user_id`) and private storage buckets. |
| **Docker Containerization** | Engineering Backlog | **Complete**: Multi-stage `Dockerfile`, `docker-compose.yml`, root `deploy.ps1` and `deploy.sh`. |
| **Versioned Prompts in Git** | Engineering Backlog | **Complete**: `data/prompts/` and `server/prompts/receipts/` (`receipt-v1.md`, `receipt-v2.md`, `receipt-v3.md`). |
| **AI Evaluation Cases (≥20 cases)** | Engineering Backlog | **Complete**: `evals/receipts/` contains 20 cases comparing v1 vs v3 prompts (80% vs 85% pass rate). |
| **Architectural Decision Records (≥3 ADRs)** | Engineering Backlog | **Complete**: ADR 0001 (Auth), ADR 0002 (Multimodal OCR), ADR 0003 (Agent Confirmation Gate). |
| **AI Usage Disclosure & Mistakes Report** | Engineering Backlog | **Complete**: Root `AI_USAGE.md` documenting tools, prompts, code review, and 3 verified failures. |

---

## 7. Scope Boundaries and Engineering Deliverables

### 7.1 Engineering Deliverables Separation
Engineering deliverables ensure high code quality, automated validation, and continuous deployment, but are deliberately decoupled from functional user stories:
- **Docker Compose**: Containerization ensures parity between local development and production.
- **Git-Tracked Prompts**: All model instructions are versioned as files (`.md` or `.txt`), preventing hardcoded drift.
- **AI Evaluation Harness**: Automated test suites in `evals/receipts/` run reproducible acceptance checks against models.
- **ADRs**: Key architecture and AI design decisions are documented in `docs/adr/`.
- **AI_USAGE.md**: Transparently logs AI-assisted software engineering practices and mistakes.

### 7.2 Non-Committed Capabilities
- **Retrieval-Augmented Generation (RAG)**: The repository contains working vector store infrastructure (`retriever.js`, `chunker.js`, Qdrant Cloud), but this serves documentation and reference handbook querying. RAG is **not** a committed Milestone 1 capability for the core expense management user stories.
- **Multi-Agent Systems**: Milestone 1 uses a single coordinated tool-using agent architecture, avoiding unnecessary multi-agent indirection.

---

## 8. Document History & Authoritative Reference
- **Foundation Document**: *Final Project Assignment Guidelines – New Technologies in Software Engineering*, Academic Year 2026–2027.
- **Source Specification**: Milestone 1 Group Proposal v1.1.
- **Consolidation**: Translated and updated to v1.2 with source-level traceability and verified test mapping.
