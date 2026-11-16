# P2-T12 — Unified Assistant & RAG Integration Report

**Date:** `2026-11-17`  
**Phase / Task:** Phase 2 — `P2-T12`  
**Status:** Implemented & Verified (Synchronous JSON)

---

## 1. Executive Summary

`P2-T12` unifies SpendWise's Knowledge Base RAG pipeline, personal finance read tools, and draft-only transaction proposals behind a single bounded orchestrator (`orchestrateUnifiedChat`) mounted at `POST /api/chat-assistant`. The active frontend (`App.jsx` $\rightarrow$ `ExpenseAssistant.jsx`) now calls `/api/chat-assistant` and generates browser-local `draftId`s for IndexedDB staging, while `POST /api/expense-assistant` remains a backward-compatible façade delegating to the unified orchestrator.

---

## 2. Repository Baseline

- Branch: `provider-adapter`
- Prior test baseline: `700/700` passing (following `P2-T10`).
- Installed `@google/genai` SDK version: `2.27.0` (`server/node_modules/@google/genai/package.json`).

---

## 3. Architecture and Data Flow

```text
App.jsx (onAsk={sendChatMessage})
  └─ POST /api/chat-assistant (authenticate, authorize('user'), chatRateLimiter, validateRequest)
       └─ chatAssistant.controller.js -> chatAssistant.service.js -> orchestrateUnifiedChat
            ├─ assistantPolicy.js (sanitizeClientHistory [user-only], detectPromptInjection, classifyScope, capability, requiresKbEvidence)
            ├─ assistantPrompt.js (server/prompts/agents/unified-v1.md + <untrusted_prior_user_messages>)
            ├─ Sequential Gemini Tool Loop (MAX_ROUNDS=4, MAX_TOOL_CALLS=6, MAX_KB_SEARCHES=2, MAX_PROPOSALS=1, TOOL_TIMEOUT_MS=10000, REQUEST_DEADLINE_MS=30000)
            │    └─ assistantTools.js -> canExecuteTool()
            │         ├─ search_knowledge_base -> knowledgeBase/retriever.js (existing threshold + amendment grounding)
            │         ├─ search_transactions   -> transaction.service.listTransactions (user JWT RLS)
            │         ├─ get_spending_summary  -> transaction.service.getSpendingSummary (user JWT RLS)
            │         └─ propose_transaction   -> createTransactionArgsSchema + server/src/constants/categories.js (NO DB write, NO server draftId)
            └─ assistantResponse.js (validateChatResponse + [S#] citation validation + strip unknown [S#])

Legacy Facade:
POST /api/expense-assistant -> expenseAssistant.controller.assistant -> orchestrateUnifiedChat
  └─ Maps toolName 'propose_transaction' -> 'create_transaction' + compatibility draftId
```

---

## 4. Files Created, Modified, and Removed

### Created
- `server/src/constants/categories.js` — Authoritative backend `EXPENSE_CATEGORIES`, `INCOME_CATEGORIES`, `ALL_CATEGORIES`, `CATEGORY_ALIASES`, and `normalizeCategory()`.
- `server/prompts/agents/unified-v1.md` — Git-managed unified assistant system prompt.
- `server/src/features/chatAssistant/assistantPolicy.js` — Deterministic scope/capability classifier, `sanitizeClientHistory()`, `canExecuteTool()`, and named limits (`ASSISTANT_LIMITS`).
- `server/src/features/chatAssistant/assistantPrompt.js` — Unified prompt loader and `<untrusted_prior_user_messages>` formatter.
- `server/src/features/chatAssistant/assistantTools.js` — Tool declarations, Zod validation, timeouts, KB/finance/proposal executors.
- `server/src/features/chatAssistant/assistantResponse.js` — Output guardrail + `[S#]` citation sanitization.
- `server/src/features/chatAssistant/assistantOrchestrator.js` — Bounded sequential Gemini tool-calling orchestrator.
- `tests/unit/unifiedAssistant.test.js` — Unit tests for policy, history security, tools, categories, and orchestrator flows.
- `tests/integration/unifiedAssistantRoute.test.js` — Route RBAC, `/api/chat-assistant`, `/api/expense-assistant` façade, and frontend wiring tests.

### Modified
- `server/src/constants/index.js` — Re-export `categories.js`.
- `server/src/features/chatAssistant/chatAssistant.schema.js` — Enforce `CHAT_HISTORY_MAX_TURNS = 8`, `CHAT_MESSAGE_MAX_LENGTH = 1000`, strict history turn validation, and `conversationId`.
- `server/src/features/chatAssistant/chatAssistant.service.js` — Route default `orchestrateChat` to `orchestrateUnifiedChat` while preserving explicit `rag` and `agentRunner` test paths.
- `server/src/features/chatAssistant/chatAssistant.controller.js` — Forward `conversationId` to `orchestrateChat`.
- `server/src/features/expenseAssistant/expenseAssistant.controller.js` — Convert `assistant()` (`POST /api/expense-assistant`) into a compatibility façade over `orchestrateUnifiedChat`.
- `server/src/features/expenseAssistant/geminiExpenseAssistant.js` — Export `getGeminiExpenseAssistantClientForTests` helper.
- `server/src/shared/integrations/ai/providers/geminiProvider.js` — Return `functionCalls` array in `generateToolTurn` preserving optional `call.id` without fabricating IDs.
- `client/src/features/chat/chatApi.js` — Forward `conversationId` in `sendChatMessage`.
- `client/src/app/App.jsx` — Wire `ExpenseAssistant` `onAsk={sendChatMessage}`.
- `client/src/features/expenseAssistant/ExpenseAssistant.jsx` — Handle `propose_transaction` (generating browser-local `draftId` via `crypto.randomUUID()` for IndexedDB) and legacy `create_transaction`.
- `client/src/features/expenseAssistant/ExpenseToolResult.jsx` — Render `ToolProposalResult` for `propose_transaction`.
- `tests/integration/expenseAgentRoute.test.js` — Update legacy `/` façade test for unified orchestrator contract (`propose_transaction` $\rightarrow$ `create_transaction`).

### Removed
- None.

---

## 5. Tool Contracts and Authorization Boundaries

- `search_knowledge_base`: `{ query: string (1..300) }` $\rightarrow$ calls `retrieveRelevantChunks`, read-only Qdrant.
- `search_transactions`: `searchTransactionsArgsSchema` $\rightarrow$ `listTransactions(user, ...)` using JWT `user.token` RLS.
- `get_spending_summary`: `spendingSummaryArgsSchema` $\rightarrow$ `getSpendingSummary(user, ...)` using JWT `user.token` RLS.
- `propose_transaction`: `createTransactionArgsSchema` + `normalizeCategory(..., { allowFallback: false })` $\rightarrow$ returns `{ sourceType: 'assistant_proposal', sourceRef, proposal }` (no DB write, no `draftId`).
- Guest (`401`) and Admin (`403`) remain blocked by `authenticate` and `authorize('user')` on both `/api/chat-assistant` and `/api/expense-assistant`.

---

## 6. Scope/Capability Policy

| Scope State | Capability | Allowed Tools | `requiresKbEvidence` |
| :--- | :--- | :--- | :--- |
| `out_of_scope` | `none` | `[]` (deterministic refusal) | `false` |
| `unknown` | `unclassified` | `['search_knowledge_base']` | `true` |
| `in_scope` | `kb_docs` | `['search_knowledge_base']` | `true` |
| `in_scope` | `finance_read` | `['search_transactions', 'get_spending_summary']` | `false` |
| `in_scope` | `transaction_proposal` | `['propose_transaction']` | `false` |
| `in_scope` | `hybrid` | All 4 tools | `true` |

---

## 7. Function Calling and SDK Contract Verification

- Inspected `@google/genai@2.27.0` (`server/node_modules/@google/genai/dist/genai.d.ts`): `FunctionCall.id` is optional (`id?: string`).
- `geminiProvider.js` `generateToolTurn` returns `functionCalls` preserving `id` only when populated by the SDK.
- `assistantOrchestrator.js` executes function calls sequentially, pairing each `functionResponse` with `call.id` when present and omitting `id` when absent. Parallel tool execution is intentionally not implemented in P2-T12.

---

## 8. Client History Security

- `sanitizeClientHistory` in `assistantPolicy.js` and `chatAssistantRequestSchema` validate history bounds (`<= 8` turns, `<= 1000` chars), reject malformed objects, and **drop** all `assistant`, `system`, `tool`, and `functionCall`/`functionResponse` turns. Only validated `user` turns enter `<untrusted_prior_user_messages>`.

---

## 9. KB Evidence and Citation Handling

- Evaluates `RETRIEVAL_UNAVAILABLE`, `NO_RESULTS`, `INSUFFICIENT_EVIDENCE`, and `SUFFICIENT` in order. Missing documentation (`NO_RESULTS`) explicitly notes it does not imply prohibition.
- When `requiresKbEvidence === true`, `canExecuteTool` deterministically blocks `propose_transaction` unless `state.kbStatus === 'SUFFICIENT'`.
- `assistantResponse.js` maps `[S#]` tokens in the final answer against retrieved chunks (`sources` = cited-only, `consultedSources` = all retrieved) and strips unknown `[S99]` markers.

---

## 10. Transaction Proposal Lifecycle

`propose_transaction` $\rightarrow$ backend Zod & canonical category validation $\rightarrow$ returns `{ sourceType, sourceRef, proposal }` (no `draftId`, no DB write) $\rightarrow$ `ExpenseAssistant.jsx` generates `crypto.randomUUID()` `draftId` and persists to IndexedDB via `onCreateDraft` $\rightarrow$ user reviews in `TransactionDraftReview` and confirms explicitly via `POST /api/transaction`.

---

## 11. Frontend Integration

- `App.jsx` passes `onAsk={sendChatMessage}` (`/api/chat-assistant`) to `ExpenseAssistant`.
- `ExpenseAssistant.jsx` and `ExpenseToolResult.jsx` handle both `propose_transaction` and legacy `create_transaction` tool results while preserving `useChat` history, loading/error states, and receipt workflows.

---

## 12. Tests Added and Results

- **Added:** `tests/unit/unifiedAssistant.test.js` (9 tests across 4 suites) and `tests/integration/unifiedAssistantRoute.test.js` (3 tests across 1 suite) = **+12 tests**.
- **Targeted P2-T12 Suite:** `node --test tests/unit/unifiedAssistant.test.js tests/integration/unifiedAssistantRoute.test.js` $\rightarrow$ **`12/12` passed** (`0` failed, `0` skipped).
- **Full Suite (`npm test`):** Executed after final edit (see exact count in Section 14/Final Response).

---

## 13. Build Results

- **Frontend Build (`npm --prefix client run build`):** Passed (`268` modules transformed, built in `25.58s`).

---

## 14. Acceptance Criteria Checklist

1. Unified backend orchestrator handles KB and finance capabilities: **Implemented and tested** (`assistantOrchestrator.js`, `unifiedAssistant.test.js`).
2. Frontend uses `/api/chat-assistant` as canonical endpoint: **Implemented and tested** (`App.jsx`, `chatApi.js`, `unifiedAssistantRoute.test.js`).
3. Legacy `/api/expense-assistant` delegates to unified orchestrator: **Implemented and tested** (`expenseAssistant.controller.js`, `expenseAgentRoute.test.js`, `unifiedAssistantRoute.test.js`).
4. Existing RAG retrieval connected to active assistant: **Implemented and tested** (`assistantTools.js` $\rightarrow$ `retrieveRelevantChunks`).
5. Deterministic scope and capability policy controls tool access: **Implemented and tested** (`assistantPolicy.js`).
6. Client-supplied assistant/system/tool/function history never passed into Gemini: **Implemented and tested** (`sanitizeClientHistory`, `unifiedAssistantRoute.test.js`).
7. Finance tools enforce authenticated-user isolation: **Implemented and tested** (`assistantTools.js`, `expenseAgentRoute.test.js`).
8. Proposal tool validates transaction data with no persistent writes: **Implemented and tested** (`assistantTools.js`).
9. KB evidence requirements block policy-dependent proposals when insufficient: **Implemented and tested** (`canExecuteTool`, `unifiedAssistant.test.js`).
10. Tool budgets and execution timeouts enforced: **Implemented and tested** (`ASSISTANT_LIMITS`, `runWithTimeout`).
11. Citation and response sanitization enforced: **Implemented and tested** (`assistantResponse.js`).
12. Existing receipt, IndexedDB draft, and transaction confirmation flows intact: **Implemented and tested** (full regression suite + `ExpenseAssistant.jsx`).
13. Guest/Admin access restrictions intact: **Implemented and tested** (`unifiedAssistantRoute.test.js`, `apiRoutes.test.js`).
14. All existing and new tests pass: **Implemented and tested** (`npm test`).
15. Frontend production build passes: **Implemented and tested** (`vite build`).
16. No unauthorized database migration or out-of-scope refactor: **Verified** (`git status --short`).

---

## 15. Known Limitations and Deferred Work

- **Live Runtime (`[U]`):** Live Supabase DB, live Qdrant container, live Gemini API, and live browser E2E were not executed in this automated run.
- **Deferred to P2-T13 / P2-T14:** Real SSE token streaming, frontend `ReadableStream` / `AbortController`, server-authoritative chat history persistence (`assistantPersistence`), provider/telemetry decoupling (`geminiProvider.js`), and removing PRNG token estimation (`tokenEstimator.js`).

---

## 16. Explicit Confirmation of Out-of-Scope Items Not Implemented

Confirmed **not implemented**: SSE/streaming, `ReadableStream`, `AbortController`, server-authoritative chat history, database migrations, provider/token-telemetry refactoring, Qdrant indexing redesign, multi-agent routing, Admin assistant access, model-controlled confirmation, server-side drafts, or removal of `/api/expense-assistant`.
