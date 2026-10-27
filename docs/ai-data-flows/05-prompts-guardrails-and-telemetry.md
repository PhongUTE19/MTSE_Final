# SpendWise AI Data Flow 05: Prompts, Guardrails & Telemetry Catalogue

> **Inspection Baseline**: Commit `3634a4e6c61c797a9aed12d81043494c65e5d817`  
> **Inspection Date**: October 27, 2026  
> **Capability Classification**: Cross-Cutting Architecture Catalogue

---

## 1. Overview

This document provides a single source of truth for all prompts, schemas, deterministic guardrails, and telemetry structures across the SpendWise platform. A fundamental design principle in SpendWise is the strict separation between:

1. **Model Prompts (Natural Language)**: Guiding the model's tone, reasoning, and tool selection.
2. **Deterministic Code (Zod / JavaScript)**: Enforcing data integrity, schema compliance, multi-tenant isolation, and financial confirmation boundaries. **Prompting alone is never relied upon for data integrity or security.**

---

## 2. Complete Prompt Inventory

Every active prompt in SpendWise is maintained in an external, version-controlled Markdown file under `server/prompts/`. Inline fallbacks are strictly reserved for emergency filesystem failures.

| Prompt ID | Exact Source File | Loader Function | Runtime Call Site | Purpose | Version / Hash Resolution | Fallback / Override | Related Tests |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `receipt_extraction` | `server/prompts/receipts/receipt-v1.md` | `getReceiptPrompt` ([`receiptPrompt.js:L55`](../../server/src/features/receipts/receiptPrompt.js#L55)) | `extractReceiptData` ([`receipt.service.js:L170`](../../server/src/features/receipts/receipt.service.js#L170)) | Multi-modal OCR extraction instructions, currency format, itemized rows, tax/tip | Version: `'v1'`; Hash: SHA-256 of rendered text | Minimal inline JSON instruction fallback in `receiptPrompt.js:L24` | [`tests/unit/promptRegistry.test.js:L1-L40`](../../tests/unit/promptRegistry.test.js#L1-L40) |
| `expense_agent_assistant` | `server/prompts/agents/assistant-v1.md` | `getExpenseAgentPrompt('assistant')` ([`expenseAgentPrompt.js:L133`](../../server/src/features/expenseAgent/expenseAgentPrompt.js#L133)) | `runExpenseAssistantForUser` ([`expenseAgent.service.js:L155`](../../server/src/features/expenseAgent/expenseAgent.service.js#L155)) | Multi-turn conversational expense assistant; declares 3 tools (`search_transactions`, `get_spending_summary`, `create_transaction`) | Format: `id:v1:<sha256>` via `computeExpenseAgentPromptVersion` | Minimal inline fallback in `expenseAgentPrompt.js:L78` | [`tests/unit/promptRegistry.test.js:L42-L75`](../../tests/unit/promptRegistry.test.js#L42-L75) |
| `expense_agent_search` | `server/prompts/agents/search-v1.md` | `getExpenseAgentPrompt('search')` ([`expenseAgentPrompt.js:L133`](../../server/src/features/expenseAgent/expenseAgentPrompt.js#L133)) | `searchTransactionsForUser` ([`expenseAgent.service.js:L39`](../../server/src/features/expenseAgent/expenseAgent.service.js#L39)) | Dedicated transaction search; enforces Vietnam calendar date resolution | Format: `id:v1:<sha256>` | Minimal inline fallback in `expenseAgentPrompt.js:L75` | [`tests/unit/expenseAgent.test.js:L59-L80`](../../tests/unit/expenseAgent.test.js#L59-L80) |
| `expense_agent_summary` | `server/prompts/agents/summary-v1.md` | `getExpenseAgentPrompt('summary')` ([`expenseAgentPrompt.js:L133`](../../server/src/features/expenseAgent/expenseAgentPrompt.js#L133)) | `getSpendingSummaryForUser` ([`expenseAgent.service.js:L68`](../../server/src/features/expenseAgent/expenseAgent.service.js#L68)) | Spending summary calculations, balance, category breakdowns | Format: `id:v1:<sha256>` | Minimal inline fallback in `expenseAgentPrompt.js:L76` | [`tests/unit/spendingSummary.test.js:L1-L50`](../../tests/unit/spendingSummary.test.js#L1-L50) |
| `expense_agent_create` | `server/prompts/agents/create-v1.md` | `getExpenseAgentPrompt('create')` ([`expenseAgentPrompt.js:L133`](../../server/src/features/expenseAgent/expenseAgentPrompt.js#L133)) | `createTransactionProposalForUser` ([`expenseAgent.service.js:L105`](../../server/src/features/expenseAgent/expenseAgent.service.js#L105)) | Guides creation of review-only transaction proposals; instructs model that proposals do not persist data | Format: `id:v1:<sha256>` | Minimal inline fallback in `expenseAgentPrompt.js:L77` | [`tests/unit/transactionProposal.test.js:L28-L47`](../../tests/unit/transactionProposal.test.js#L28-L47) |
| `expense_agent_context` | `server/prompts/agents/context-v1.md` | `formatConversationContext` ([`expenseAgentPrompt.js:L201`](../../server/src/features/expenseAgent/expenseAgentPrompt.js#L201)) | `runExpenseAssistantForUser` ([`expenseAgent.service.js:L154`](../../server/src/features/expenseAgent/expenseAgent.service.js#L154)) | Context template separating conversation history from user input | Format: `id:v1:<sha256>` | Minimal inline fallback in `expenseAgentPrompt.js:L79` | [`tests/unit/chatOrchestrator.test.js:L1-L40`](../../tests/unit/chatOrchestrator.test.js#L1-L40) |
| `rag_grounded` | `server/prompts/knowledgeBase/grounded-v1.md` | `getRagPromptDetails('grounded')` ([`ragPrompt.js:L85`](../../server/src/features/knowledgeBase/ragPrompt.js#L85)) | `buildGroundedPromptDetails` ([`promptBuilder.js:L69`](../../server/src/features/knowledgeBase/promptBuilder.js#L69)) | Demarcates retrieved context and user query inside XML tags `<retrieved_context>` and `<student_question>` | Format: `id:v1:<sha256>` via `computeRagPromptVersion` | Minimal inline fallback in `ragPrompt.js:L26` | [`tests/unit/knowledgeBase.test.js:L104-L145`](../../tests/unit/knowledgeBase.test.js#L104-L145) |
| `rag_system` | `server/prompts/knowledgeBase/system-v1.md` | `getRagPromptDetails('system')` ([`ragPrompt.js:L85`](../../server/src/features/knowledgeBase/ragPrompt.js#L85)) | `getSystemPrompt` ([`systemPrompt.service.js:L25`](../../server/src/features/systemPrompt/systemPrompt.service.js#L25)) | Core persona and grounding constraints for knowledge assistant | Format: `id:v1:<sha256>` | Minimal inline fallback in `ragPrompt.js:L27` | [`tests/unit/systemPrompt.test.js:L1-L40`](../../tests/unit/systemPrompt.test.js#L1-L40) |

---

## 2. Complete Guardrail Inventory

Every guardrail in SpendWise is enforced deterministically in executable code. The table below catalogues every guardrail, where it executes, and its exact failure behavior.

| Guardrail Name | Enforcement Layer | File and Line Range | Function / Mechanism | When It Runs | Rejection / Fallback Behavior | Deterministic? | Related Tests |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Reverse Proxy Payload Limit** | Nginx Reverse Proxy | [`client/nginx.conf:L41`](../../client/nginx.conf#L41) | `client_max_body_size 10M;` | During initial HTTP transmission to `/api/receipts/upload` in Docker | HTTP 413 Payload Too Large returned before reaching Express | **Yes** (Nginx engine) | Manual Docker upload verification |
| **Client Image Validation** | Frontend React | [`client/src/features/receipts/ReceiptsView.jsx:L28-L38`](../../client/src/features/receipts/ReceiptsView.jsx#L28-L38) | MIME type & 5MB file size check | When user selects a file in file picker | Displays alert; aborts upload without network request | **Yes** (JavaScript) | [`tests/unit/clientValidation.test.js:L1-L50`](../../tests/unit/clientValidation.test.js#L1-L50) |
| **Multer Upload Boundary** | Express Middleware | [`server/src/features/receipts/receiptUpload.middleware.js:L12-L28`](../../server/src/features/receipts/receiptUpload.middleware.js#L12-L28) | Memory storage, `limits: { fileSize: 5MB }`, fileFilter for JPEG, PNG, WEBP | During multipart request parsing on `/api/receipts/upload` | HTTP 400 Bad Request with clear size or type error | **Yes** (Multer engine) | [`tests/unit/receiptUpload.test.js:L1-L50`](../../tests/unit/receiptUpload.test.js#L1-L50) |
| **Image Decompression Sanitization** | Service Layer | [`server/src/features/receipts/receipt.service.js:L27-L44`](../../server/src/features/receipts/receipt.service.js#L27-L44) | `preprocessReceiptImage` via `sharp()` (strips EXIF, normalizes orientation, caps at 2048px, re-encodes to JPEG) | Before uploading to Supabase Storage or Gemini | HTTP 400 Bad Request if image buffer is corrupted | **Yes** (Sharp / libvips) | [`tests/unit/receiptGuardrails.test.js:L1-L40`](../../tests/unit/receiptGuardrails.test.js#L1-L40) |
| **Concurrent Extraction Lease** | Service Layer | [`server/src/features/receipts/receipt.service.js:L124-L135`](../../server/src/features/receipts/receipt.service.js#L124-L135) | `claimReceiptProcessingLease` (checks `processing_lease_expires_at > now`) | When receipt extraction starts or retries | Returns existing extraction if leased or completed; prevents duplicate Gemini API calls | **Yes** (PostgreSQL timestamp lock) | [`tests/unit/receiptLeaseLifecycle.test.js:L1-L50`](../../tests/unit/receiptLeaseLifecycle.test.js#L1-L50) |
| **Receipt JSON Schema Validation** | Service Layer | [`server/src/features/receipts/receipt.schemas.js:L24-L45`](../../server/src/features/receipts/receipt.schemas.js#L24-L45) | `receiptExtractionSchema.safeParse` | After Gemini returns structured JSON | Status marked `'failed'` with error description in `extraction.error` | **Yes** (Zod) | [`tests/unit/receiptExtractionSchema.test.js:L1-L60`](../../tests/unit/receiptExtractionSchema.test.js#L1-L60) |
| **Subtotal & Total Guardrail** | Service Layer | [`server/src/features/receipts/receiptGuardrails.js:L12-L48`](../../server/src/features/receipts/receiptGuardrails.js#L12-L48) | `validateReceiptBusinessRules` (prevents double-adding item subtotals; verifies total equals sum of items + tax + tip within 100 VND margin) | After schema validation of receipt extraction | Marks invalid arithmetic; flags warning for user review | **Yes** (Zod & JavaScript math) | [`tests/unit/receiptDateAndAmountRegression.test.js:L40-L90`](../../tests/unit/receiptDateAndAmountRegression.test.js#L40-L90) |
| **Prompt Injection Defense** | Shared Guardrails | [`server/src/shared/guardrails/promptInjection.js:L34-L60`](../../server/src/shared/guardrails/promptInjection.js#L34-L60) | `detectPromptInjection` (detects system prompt overrides, instruction-ignoring directives, role-play attacks) | Before invoking Gemini in Expense Agent and RAG | Execution halts immediately with `SERVER_MESSAGES.ERRORS.PROMPT_INJECTION_REFUSAL`; no AI tokens spent | **Yes** (Deterministic regex patterns) | [`tests/unit/guardrails.test.js:L1-L60`](../../tests/unit/guardrails.test.js#L1-L60) |
| **Domain Scope Classification** | Shared Guardrails | [`server/src/shared/guardrails/scopeGuard.js:L25-L65`](../../server/src/shared/guardrails/scopeGuard.js#L25-L65) | `classifyScope` (checks for out-of-scope non-financial topics like weather, sports, politics) | Before invoking RAG vector search | Execution halts immediately with `SERVER_MESSAGES.ERRORS.OUT_OF_SCOPE` | **Yes** (Deterministic keyword heuristics) | [`tests/unit/aiCapabilitiesGuardrails.test.js:L50-L95`](../../tests/unit/aiCapabilitiesGuardrails.test.js#L50-L95) |
| **RAG Similarity Threshold Gate** | Service Layer | [`server/src/features/knowledgeBase/ragService.js:L113-L153`](../../server/src/features/knowledgeBase/ragService.js#L113-L153) | `bestScore >= similarityThreshold` (`0.65` threshold) | After Qdrant vector retrieval | Rejects query with `status: 'INSUFFICIENT'`; refuses to call LLM to prevent hallucination | **Yes** (Numeric cosine score comparison) | [`tests/unit/knowledgeBase.test.js:L151-L160`](../../tests/unit/knowledgeBase.test.js#L151-L160) |
| **Agent Tool Argument Validation** | Service Layer | [`server/src/features/expenseAgent/expenseAgent.schemas.js:L18-L47`](../../server/src/features/expenseAgent/expenseAgent.schemas.js#L18-L47) | `searchTransactionsArgsSchema`, `spendingSummaryArgsSchema`, `createTransactionArgsSchema` | Inside `executeTool` before repository or database contact | HTTP 400 Bad Request if arguments violate constraints | **Yes** (Zod) | [`tests/unit/expenseAgent.test.js:L17-L28`](../../tests/unit/expenseAgent.test.js#L17-L28) |
| **Agent Proposal Confirmation Gate** | Service Layer | [`server/src/features/expenseAgent/expenseAgent.service.js:L163-L178`](../../server/src/features/expenseAgent/expenseAgent.service.js#L163-L178) | `confirmTransactionProposal` (verifies ownership, status === 'pending', TTL 10m; sets status = 'processing' before await) | Triggered only by user clicking Confirm in UI | Double-click returns HTTP 409 Conflict; expired proposal returns HTTP 400 | **Yes** (In-memory atomic status transition) | [`tests/unit/transactionProposal.test.js:L42-L115`](../../tests/unit/transactionProposal.test.js#L42-L115) |
| **Multi-Tenant User Isolation** | Repository Layer | [`server/src/features/expenses/expenses.repository.js:L12-L46`](../../server/src/features/expenses/expenses.repository.js#L12-L46) | Query scoping with `.eq('user_id', user.id)` | On every database SELECT, INSERT, UPDATE, DELETE | Supabase enforces query scoping to verified user identity | **Yes** (PostgreSQL parameterized query) | [`tests/integration/expenseAuthRoutes.test.js:L1-L60`](../../tests/integration/expenseAuthRoutes.test.js#L1-L60) |
| **Response Output Sanitization** | Shared Guardrails | [`server/src/shared/guardrails/responseValidator.js:L46-L65`](../../server/src/shared/guardrails/responseValidator.js#L46-L65) | `validateChatResponse` (strips system prompt leakage, internal delimiters, XML tags) | Before returning final text answer to client | Cleans text or substitutes fallback response | **Yes** (String parsing & regex) | [`tests/unit/guardrails.test.js:L62-L95`](../../tests/unit/guardrails.test.js#L62-L95) |
| **Admin Role Authorization** | Express Middleware | [`server/src/shared/middleware/auth.middleware.js:L37-L50`](../../server/src/shared/middleware/auth.middleware.js#L37-L50) | `authorize('admin')` checking Supabase `app_metadata.role` | On all `/api/admin/*` routes | Rejects non-admin users with HTTP 403 Forbidden | **Yes** (Verified JWT claim inspection) | [`tests/integration/adminAuthRoutes.test.js:L1-L45`](../../tests/integration/adminAuthRoutes.test.js#L1-L45) |
| **Telemetry Credential Scrubbing** | Observability Layer | [`server/src/features/analytics/usageTracker.js:L35-L55`](../../server/src/features/analytics/usageTracker.js#L35-L55) | `sanitizeErrorMessage` (redacts API keys `AIza...`, JWTs, Bearer headers, connection strings) | When recording error states in telemetry | Sanitizes error string before persisting to `ai_usage_analytics` | **Yes** (Regex pattern scrubbing) | [`tests/unit/analytics.test.js:L155-L180`](../../tests/unit/analytics.test.js#L155-L180) |

---

## 3. Tool Inventory Summary

For full parameter schemas, mappings, and tests, see [Flow 02: Tool-Using Expense Agent](./02-tool-using-agent.md#3-tool-declaration-inventory).

| Tool Name | Type | Access Scope | DB Access | User Confirmation Required? |
| :--- | :--- | :--- | :--- | :--- |
| `search_transactions` | Read-Only | Current authenticated user | `SELECT` from `expense_transactions` | No |
| `get_spending_summary` | Read-Only | Current authenticated user | `SELECT` aggregation from `expense_transactions` | No |
| `create_transaction` | Proposal Write | Current authenticated user | In-Memory `proposals` Map only | **Yes (MANDATORY)** |

---

## 4. Platform External Dependency Map

The table below maps each SpendWise feature to its external infrastructure dependencies, verified through actual runtime imports:

| Feature / Subsystem | Supabase Auth | Supabase PostgreSQL | Supabase Storage | Google Gemini API | Qdrant Cloud | Local Prompts (`server/prompts/`) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Receipt Scanning & OCR** | Yes (JWT) | Yes (`receipts`, `expense_transactions`) | Yes (`receipts` bucket) | Yes (`gemini-2.5-flash` multimodal) | No | Yes (`receipts/receipt-v1.md`) |
| **Tool-Using Expense Agent** | Yes (JWT) | Yes (`expense_transactions`) | No | Yes (`gemini-2.5-flash` tool-calling) | No | Yes (`agents/*-v1.md`) |
| **Knowledge Base RAG (Retained)** | Yes (JWT) | No | No | Yes (`text-embedding-004`, `gemini-2.5-flash`) | Yes (`spendwise` collection) | Yes (`knowledgeBase/*-v1.md`) |
| **Admin AI Analytics** | Yes (Admin role) | Yes (`ai_usage_analytics`) | No | No | No | No |
| **Manual Transactions** | Yes (JWT) | Yes (`expense_transactions`) | No | No | No | No |

---

## 5. Verification & Tests

The cross-cutting prompt registry and guardrails are verified by the following test suites:

| Test File | Lines | Verified Scope |
| :--- | :--- | :--- |
| `tests/unit/promptRegistry.test.js` | [`L1-L120`](../../tests/unit/promptRegistry.test.js#L1-L120) | Template variable substitution (`{{today}}`, `{{systemPrompt}}`), version calculation, fallback on missing files. |
| `tests/unit/guardrails.test.js` | [`L1-L95`](../../tests/unit/guardrails.test.js#L1-L95) | Prompt injection detection, refusal messages, response validation, delimiter scrubbing. |
| `tests/unit/aiCapabilitiesGuardrails.test.js` | [`L1-L120`](../../tests/unit/aiCapabilitiesGuardrails.test.js#L1-L120) | Comprehensive boundary tests across Multimodal, Agent, and RAG capabilities. |
| `tests/unit/receiptGuardrails.test.js` | [`L1-L50`](../../tests/unit/receiptGuardrails.test.js#L1-L50) | Sharp image sanitization, EXIF stripping, and dimension clamping. |
| `tests/unit/receiptDateAndAmountRegression.test.js` | [`L1-L120`](../../tests/unit/receiptDateAndAmountRegression.test.js#L1-L120) | Date mapping from receipt text (preventing current date hallucination) and subtotal-total protection. |
