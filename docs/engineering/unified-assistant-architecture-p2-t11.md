# P2-T11 — Unified AI Architecture Design (`unified-assistant-architecture-p2-t11.md`)

> [!NOTE]
> **Historical Design Artifact:** This document records the amended P2-T11 pre-implementation design. The unified assistant, SSE streaming, server-authoritative chat persistence, and provider/telemetry cleanup have since been implemented in P2-T12 through P2-T14. See [`docs/engineering/architecture.md`](./architecture.md) for current-state architecture documentation.

**Status:** Design-Only (`P2-T11`, Amended) — No application source code, tests, migrations, or prompts modified.  
**Date:** `2026-11-17`  
**Baseline:** `npm test` — `700/700` passing (following `P2-T10`).  
**Evidence Labels:**
- `[C]` Confirmed by direct code inspection or test execution.
- `[I]` Inferred from inspected code or architecture.
- `[P]` Proposed design / future target behavior.
- `[U]` Unverified because live runtime infrastructure (Supabase DB, Qdrant, live Gemini API) was not executed.

---

## 1. Executive Summary

SpendWise currently operates **two disconnected AI assistant paths** `[C]`:
1. The active frontend drawer (`ExpenseAssistant.jsx` $\rightarrow$ `POST /api/expense-assistant`) executes personal finance tools (`search_transactions`, `get_spending_summary`, `create_transaction`), but has **zero access** to the Knowledge Base RAG pipeline and skips `classifyScope()` `[C]`.
2. `POST /api/chat-assistant` defaults `CHAT_STRATEGY` to `'agent'` (delegating straight back to `runExpenseAssistantForUser` with `sources: []`), while its `'rag'` strategy (`orchestrateRAGChat`) has **zero access** to personal finance tools `[C]`.

This document defines **Option B: Unified Assistant Orchestrator** under `server/src/features/chatAssistant/` `[P]` to unify Knowledge Base retrieval (`search_knowledge_base`), personal finance tools (`search_transactions`, `get_spending_summary`), and draft-only transaction proposals (`propose_transaction`) under a single bounded, deterministically authorized tool loop—while cleanly separating **P2-T12** (synchronous unified orchestrator + frontend wiring) from **P2-T13** (end-to-end SSE streaming + server-authoritative chat persistence).

---

## 2. Existing Architecture and Actual Call Graph

### 2.1 Active Frontend $\rightarrow$ Backend Call Graph `[C]`
```text
client/src/app/App.jsx:9,64
  └─ <ExpenseAssistant onAsk={askExpenseAssistant} />
       └─ client/src/features/expenseAssistant/ExpenseAssistant.jsx:37-59 (useChat)
            └─ client/src/features/expenseAssistant/expenseAssistantApi.js:7-8
                 └─ POST /api/expense-assistant
                      └─ server/src/features/expenseAssistant/expenseAssistant.route.js:10-11 (authenticate, authorize('user'), rateLimit, validateRequest)
                           └─ expenseAssistant.service.js:123-171 (runExpenseAssistantForUser)
                                ├─ detectPromptInjection(message & history)
                                └─ geminiExpenseAssistant.js (runGeminiExpenseAssistant)
                                     ├─ generateToolTurn() [single firstCall, no call ID]
                                     ├─ executeTool() [MAX_AGENT_STEPS = 2]
                                     └─ generateToolFollowup()
```

### 2.2 Disconnected Chat Assistant & RAG Call Graph `[C]`
```text
POST /api/chat-assistant (server/src/features/chatAssistant/chatAssistant.route.js:8-12)
  └─ chatAssistant.controller.js (chat / chatStream)
       └─ chatAssistant.service.js:32-47 (orchestrateChat)
            ├─ strategy === 'agent' (DEFAULT): delegates to runExpenseAssistantForUser -> sources: [], retrieval: null
            └─ strategy === 'rag': orchestrateRAGChat -> ragService.js:27 (executeRAG) -> retriever.js (retrieveRelevantChunks) -> vectorStore.js (searchVectorPoints)
```

---

## 3. Current Problems and Evidence

| Problem | Evidence | Impact |
| :--- | :--- | :--- |
| **Active UI bypasses RAG & `/api/chat-assistant`** `[C]` | `App.jsx:64` passes `askExpenseAssistant` (`/api/expense-assistant`); `chatApi.js:7` (`sendChatMessage`) is unused in `App.jsx`. | Users cannot query SpendWise docs/policies or ask hybrid questions in the live assistant. |
| **Agent and RAG strategies are mutually exclusive** `[C]` | `chatAssistant.service.js:37-47,60-122` forks `'agent'` vs `'rag'`. | Hybrid queries (e.g., *"Can I log 500k Grab under Transport per SpendWise rules?"*) cannot combine KB + personal finance tools. |
| **Inconsistent scope enforcement** `[C]` | `ragService.js:57` calls `classifyScope(query)`, whereas `expenseAssistant.service.js:123-135` only calls `detectPromptInjection`. | Out-of-scope queries in `/api/expense-assistant` rely solely on prompt instructions. |
| **Single-step, single-call tool loop** `[C]` | `geminiProvider.js:611` reads only `response?.functionCalls?.[0]` without `id`; `expenseAssistant.service.js:10` sets `MAX_AGENT_STEPS = 2` (blocks after 1 tool call). | Multi-step hybrid workflows (KB lookup $\rightarrow$ finance query/proposal) are impossible. |
| **Simulated SSE on agent path & no frontend SSE** `[C]` | `chatAssistant.service.js:150-176` awaits `orchestrateAgentChat` then emits one `delta`; `client/src` has zero `ReadableStream`/`EventSource`/`AbortController`. | No real streaming or generation cancellation. |
| **Provider & telemetry coupling** `[C]` | `geminiProvider.js:5-9` imports `features/aiUsage` and `features/receipt`; `tokenEstimator.js:12-34` uses PRNG fallback (`aiUsage.repository.js:115`). | Upward dependency violation and synthetic token estimates when `usageMetadata` is absent. |

---

## 4. Architecture Option Comparison

| Criterion | Option A: Extend `expenseAssistant` | Option B: Unified Orchestrator (`chatAssistant/`) | Option C: Multi-Agent Routing |
| :--- | :--- | :--- | :--- |
| **Architectural Complexity** | Low initially, grows messy as KB/citations/SSE are bolted onto expense-only files. | **Moderate & clean**: single bounded tool loop with explicit policy, registry, and response layers. | High: router agent + 3 sub-agents + handoff state + duplicated guardrails. |
| **Security & Determinism** | Risky if finance tools remain default-enabled without a central policy gate. | **Strong**: central `assistantPolicy` gates tool allowlists before model/tool execution. | Harder to audit; inter-agent handoffs expand prompt-injection surface. |
| **Testability** | Coupled to `geminiExpenseAssistant.js`. | **High**: each module (`policy`, `tools`, `response`, `orchestrator`) unit-testable with mocks. | High test matrix explosion across agent handoffs. |
| **Maintainability** | Keeps legacy naming (`expenseAssistant`) for non-expense KB features. | **High**: aligns with existing `/api/chat-assistant` route and `ChatAssistant` feature folder. | Over-engineered for 4 bounded tools. |
| **Provider Compatibility** | Tied to single-turn `generateToolTurn` / `generateToolFollowup`. | **High**: extensible single-provider (`@google/genai`) multi-turn tool loop, adaptable to future providers. | Requires multi-agent state abstraction across providers. |
| **Tool-Calling Reliability** | Breaks on >1 tool step (`MAX_AGENT_STEPS = 2`). | **High**: bounded multi-step loop (`MAX_ROUNDS = 4`, `MAX_TOOL_CALLS = 6`). | Latency & token overhead from extra routing LLM call. |
| **Future SSE Support (P2-T13)** | No SSE controller exists in `expenseAssistant`. | **High**: `/api/chat-assistant/stream` and `chatAssistant.controller.js` already exist `[C]`. | Complex interleaved streaming across sub-agents. |
| **Codebase Compatibility** | Minimal route change, high tech debt. | **Optimal**: reuses existing `chatAssistant`, `knowledgeBase`, `transaction`, and `receipt` services. | Poor fit for current Express monolith. |

**Recommendation:** **Option B — Unified Assistant Orchestrator** under `server/src/features/chatAssistant/` `[P]`.

---

## 5. Recommended Architecture

```text
Client (ExpenseAssistant -> /api/chat-assistant) [P]
  │  (Legacy /api/expense-assistant kept as compatibility facade in P2-T12)
  ▼
chatAssistant.route.js (authenticate, authorize('user'), rateLimit, validateRequest) [C]
  ▼
chatAssistant.controller.js (JSON in P2-T12; SSE in P2-T13) [C/P]
  ▼
assistantOrchestrator.js [P]
  ├─► 1. assistantPolicy.js (Injection check + Deterministic Scope + Tool Allowlist) [P]
  ├─► 2. assistantPrompt.js (Git-managed system prompt + untrusted history framing) [P]
  ├─► 3. Bounded Tool Loop (ai provider multi-turn tool calling) [P]
  │        └─► assistantTools.js (Registry + Zod arg validation + timeouts + caps) [P]
  │              ├─ search_knowledge_base -> knowledgeBase/ragService/retriever [C]
  │              ├─ search_transactions   -> transaction.service (RLS user token) [C]
  │              ├─ get_spending_summary  -> transaction.service (RLS user token) [C]
  │              └─ propose_transaction   -> Zod + canonical category + draftId (NO DB write) [C/P]
  └─► 4. assistantResponse.js (Output guardrail + [S#] citation validation + envelope) [P]
```

---

## 6. Component Responsibilities and Interfaces `[P]`

> Existing `server/src/features/knowledgeBase/` and `server/src/features/systemPrompt/` (or `server/prompts/`) remain separate feature boundaries `[C]`.

1. **`assistantOrchestrator.js`**
   - *Responsibility:* Coordinates request lifecycle: policy evaluation, prompt assembly, bounded tool loop, response validation, and structured result assembly.
   - *Public Interface:* `orchestrateUnifiedChat(user, message, options)` (returns `{ answer, toolName, toolResult, toolsExecuted, sources, retrieval, promptId, promptVersion, promptHash }`).
   - *Dependencies:* `assistantPolicy`, `assistantPrompt`, `assistantTools`, `assistantResponse`, `shared/integrations/ai`.
   - *Must Not Own:* HTTP `req`/`res` handling, SQL/Qdrant queries, or DB persistence.
   - *Testing:* Unit-tested with mocked AI provider & mocked tool handlers.

2. **`assistantPolicy.js`**
   - *Responsibility:* Deterministic security & capability gate: prompt injection detection, scope classification (`out_of_scope` | `in_scope` | `unknown`), capability/intent permission resolution (`allowedTools`), `requiresKbEvidence` determination, and per-call `canExecuteTool()` enforcement.
   - *Public Interface:* `evaluateRequestPolicy({ message, history })` $\rightarrow$ `{ allowed, scopeState, capability, allowedTools, requiresKbEvidence, refusalText }`; `canExecuteTool({ scopeState, allowedTools, requiresKbEvidence, toolName, state })`.
   - *Dependencies:* `shared/guardrails` (`detectPromptInjection`, `classifyScope`), `constants`.
   - *Must Not Own:* LLM calls or database queries.
   - *Testing:* Pure synchronous unit tests for every scope state, capability permission, `requiresKbEvidence` gate, and bypass attempt.

3. **`assistantTools.js`**
   - *Responsibility:* Tool declarations (for Gemini), Zod argument schemas, per-tool timeouts, execution caps, and delegation to existing domain services using JWT-derived `user`.
   - *Public Interface:* `getToolDeclarations(allowedTools)`, `executeRegisteredTool({ toolName, rawArgs, user, context })`.
   - *Dependencies:* `knowledgeBase` (`retrieveRelevantChunks` / `executeRAG` retrieval), `transaction/transaction.service`, `shared/validation/money.js`, `shared/validation/date.js`.
   - *Must Not Own:* Multi-turn loop control or response prose generation.
   - *Testing:* Unit tests per tool verifying Zod rejection, `user.id` isolation, and timeout handling.

4. **`assistantPrompt.js`**
   - *Responsibility:* Loads Git-managed unified system prompt, injects Vietnam calendar date (`Asia/Ho_Chi_Minh`), formats untrusted history safely, and wraps retrieved `[S1]`, `[S2]` KB chunks and tool outputs in untrusted data delimiters.
   - *Public Interface:* `buildUnifiedPrompt({ message, history, today })`, `formatToolObservation(...)`.
   - *Dependencies:* Prompt loader, `constants`.
   - *Must Not Own:* Authorization or tool execution.

5. **`assistantResponse.js`**
   - *Responsibility:* Runs `validateChatResponse()` (anti-leakage/non-empty), maps `[S#]` citations in final text against actually retrieved sources, strips unknown/fabricated `[S#]` tags, and produces the final response envelope (including legacy `toolName`/`toolResult` fields).
   - *Public Interface:* `finalizeAssistantResponse({ rawAnswer, retrievedSourcesMap, toolExecutions })`.
   - *Dependencies:* `shared/guardrails/responseValidator.js`.
   - *Must Not Own:* Retrieval or AI calls.

6. **`assistantEvents.js` (Optional in P2-T12 / Active in P2-T13)**
   - *Responsibility:* Normalizes internal events (`metadata`, `sources_consulted`, `delta`, `tool_start`, `tool_result`, `done`, `error`). In P2-T12, the orchestrator can yield or collect events for synchronous JSON; P2-T13 wires them to SSE.

7. **`assistantPersistence.js` (Reserved for P2-T13)**
   - *Responsibility:* Server-authoritative `chat_conversations` / `chat_messages` persistence, lifecycle status (`streaming` / `completed` / `aborted` / `error`), and retry/idempotency coordination.

---

## 7. Scope and Security Policy

### 7.1 Deterministic Authorization `[C]/[P]`
- Authentication (`authenticate`) and role (`authorize('user')`) remain enforced at Express route middleware `[C]`.
- User identity (`user.id`, `user.token`) is **always** taken from the verified JWT—never from model arguments `[C]`.
- Application code enforces tool allowlists before sending declarations to Gemini **and** again before executing any returned `functionCall`.

### 7.2 Deterministic Scope Classification vs. Capability Tool Permissions `[P]`
Scope classification and tool permissions are **strictly separated**:
1. **Scope Classification** determines whether a request belongs to SpendWise (`out_of_scope` | `in_scope` | `unknown`).
2. **Capability / Intent Policy** determines which tools are permitted for an `in_scope` request (`kb_docs` | `finance_read` | `transaction_proposal` | `hybrid`).
3. **Deterministic Pre-Execution Gate (`canExecuteTool`)** re-validates every model-generated tool call immediately before execution against `allowedTools` and `requiresKbEvidence`. A model-generated tool call can **never** escalate permissions.

| Scope State | Capability / Intent | Trigger Condition | Allowed Tools | `requiresKbEvidence` | Behavior |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`out_of_scope`** | `none` | Matches `OUT_OF_SCOPE_PATTERNS` `[C]` | `[]` | `false` | Immediate deterministic refusal; zero LLM/tool calls. |
| **`unknown`** | `unclassified` | Ambiguous / neither clearly out-of-scope nor clearly finance | **`search_knowledge_base` ONLY** | `true` | Finance tools (`search_transactions`, `get_spending_summary`, `propose_transaction`) are **strictly blocked**. |
| **`in_scope`** | **`kb_docs`** | SpendWise documentation, feature, or policy questions without personal ledger intent | **`search_knowledge_base` ONLY** | `true` | Personal finance tools are **not** exposed or permitted. |
| **`in_scope`** | **`finance_read`** | Queries about user's spending, transactions, or totals | `search_transactions`, `get_spending_summary` (+ `search_knowledge_base` if policy terms present) | `false` (or `true` if policy-dependent) | Read-only ledger access; `propose_transaction` blocked. |
| **`in_scope`** | **`transaction_proposal`** | Explicit intent to log/record/add a transaction (e.g., *"Log 50k coffee today"*) without policy question | `propose_transaction` (+ `search_knowledge_base` if policy-dependent) | `false` (ordinary) / `true` (policy-dependent) | Ordinary creation skips mandatory KB; policy-dependent creation requires KB first. |
| **`in_scope`** | **`hybrid`** | Combines SpendWise policy/rule verification with personal finance read or proposal | `search_knowledge_base`, `search_transactions`, `get_spending_summary`, `propose_transaction` | `true` | `propose_transaction` blocked until `search_knowledge_base` yields `SUFFICIENT`. |

### 7.2.1 Deterministic `requiresKbEvidence` Policy `[P]`
- **`requiresKbEvidence = true`** when capability is `kb_docs`, `hybrid`, `unknown`, or when `message` matches policy-dependent cues (e.g., `"according to SpendWise"`, `"SpendWise policy"`, `"SpendWise rules"`, `"allowed"`, `"limit"`, `"how does SpendWise"`, `"can I log"`).
- **`requiresKbEvidence = false`** only for ordinary finance queries/proposals without documentation/policy cues (e.g., *"Log 50k coffee at Highlands today"*, *"How much did I spend on food last week?"*).
- **Ambiguous Intent:** Treated as `requiresKbEvidence = true` (and if scope is `unknown`, finance tools remain blocked).
- **Model Skipping Mandatory KB Check:** If `requiresKbEvidence === true` and the model attempts `propose_transaction` (or finishes without calling `search_knowledge_base` when policy verification is required), `canExecuteTool()` / `assistantOrchestrator` **deterministically rejects the skip**:
  - Blocks `propose_transaction` with a tool-gate error observation instructing the orchestrator to execute `search_knowledge_base` first (or executes `search_knowledge_base` deterministically before allowing proposal).
  - If KB returns `RETRIEVAL_UNAVAILABLE`, `NO_RESULTS`, or `INSUFFICIENT_EVIDENCE` when `requiresKbEvidence === true`, `propose_transaction` remains blocked and the assistant returns a grounded explanation that policy documentation could not be verified.

### 7.3 Untrusted Input & Interim P2-T12 History Strategy `[P]`
All user messages, retrieved KB chunks, transaction rows, tool outputs, client-supplied `history`, and model arguments/responses are treated as **untrusted**.
- **P2-T12 Interim History Protection:**
  - Client-supplied `history` (`max: 8`, `maxLen: 1000` `[C]`) must **never** be injected as trusted `model`/`assistant` turns capable of simulating prior tool results or overriding system rules.
  - Only validated `user` turns (and optionally truncated plain-text `assistant` turns stripped of any tool/system markers and wrapped in `<untrusted_conversation_history>` XML/fence delimiters) are passed as passive context—never as executable `functionCall`/`functionResponse` history.
  - Prompt injection checks (`detectPromptInjection`) run on `message` and every `history` turn `[C]`.
- **P2-T13 Server-Authoritative History:** Backend loads prior turns directly from `public.chat_messages` (RLS-enforced), ignoring client-supplied `history` payloads.

### 7.4 Transaction Confirmation & Proposal Ownership Boundary `[C]/[P]`
- **Backend (`propose_transaction`):** Validates and normalizes the proposed transaction (`type`, `amount`, `date`, `category`, `merchant`, `note`, `items`) and returns a structured proposal payload (`{ sourceType: 'assistant_proposal', sourceRef: conversationId ?? null, proposal: { ... } }`). The backend does **not** persist the proposal, does **not** claim ownership of browser IndexedDB, and does **not** generate a browser-local `draftId` on `/api/chat-assistant` (only the temporary `/api/expense-assistant` compatibility façade may attach a compatibility `draftId` if an un-migrated caller expects one).
- **Frontend (`ExpenseAssistant.jsx` / `useTransactionDrafts`):** Generates the browser-local `draftId` (`crypto.randomUUID()`), stages the draft in user-scoped IndexedDB (`draftStorage.js`), renders `TransactionDraftReview`, and commits only via the existing explicit confirmation workflow (`POST /api/transaction`). No model-callable confirmation tool may exist `[C]`.

---

## 8. Tool Contracts `[P]`

| Tool Name | Purpose | Validation & Ownership | Side Effects |
| :--- | :--- | :--- | :--- |
| **`search_knowledge_base`** | Retrieve SpendWise docs/policies | Zod `{ query: string (1..300) }`; resolves `spendwise_active` Qdrant alias via `retriever.js` `[C]` | Read-only (Qdrant) |
| **`search_transactions`** | Search user's ledger | `searchTransactionsArgsSchema` `[C]`; `user.token` RLS via `transaction.service.listTransactions` `[C]` | Read-only (PostgreSQL) |
| **`get_spending_summary`** | Aggregate income/expense/balance | `spendingSummaryArgsSchema` `[C]`; `user.token` RLS via `transaction.service.getSpendingSummary` `[C]` | Read-only (PostgreSQL) |
| **`propose_transaction`** | Validate & return structured draft proposal | `createTransactionArgsSchema` (`parseVndAmount` `[C]`) + authoritative backend category & type validation | **None** (returns `{ sourceType, sourceRef, proposal }`; frontend creates `draftId` & stores in IndexedDB) |

---

## 9. RAG Integration and Retrieval Semantics

### 9.1 Current RAG Behavior `[C]`
- `executeRAG` (`server/src/features/knowledgeBase/ragService.js:27-192`) runs `detectPromptInjection` $\rightarrow$ `classifyScope` $\rightarrow$ `retrieveRelevantChunks(query, topK)` $\rightarrow$ `searchVectorPoints` (against active Qdrant alias).
- Preserves amendment-aware grounding (`AMENDMENT_SCORE_THRESHOLD` in `retriever.js:60-69`) and `similarityThreshold` (`config.similarityThreshold`) evaluation.
- Returns explicit status: `INJECTION_REFUSED`, `OUT_OF_SCOPE`, `RETRIEVAL_ERROR`, `INSUFFICIENT`, `SUFFICIENT`.

### 9.2 Unified Tool Interface (`search_knowledge_base`) `[P]`
- Reuses `retrieveRelevantChunks` and the existing threshold/amendment logic **unchanged** (no per-chunk filtering rewrite in P2-T12).
- Evaluates outcomes in **strict deterministic order**:
  1. `RETRIEVAL_UNAVAILABLE`: Qdrant/embedding error $\rightarrow$ `{ status: 'unavailable', chunks: [] }`; assistant informs user KB is temporarily unavailable and **must not** fabricate policy answers.
  2. `NO_RESULTS`: `retrievedChunks.length === 0` $\rightarrow$ `{ status: 'no_results', chunks: [] }`.
  3. `INSUFFICIENT_EVIDENCE`: `retrievedChunks.length > 0 && bestScore < similarityThreshold` $\rightarrow$ `{ status: 'insufficient', chunks: [] }`; model must state insufficient documentation rather than guessing.
  4. `SUFFICIENT`: `bestScore >= similarityThreshold` $\rightarrow$ assigns deterministic `[S1]`, `[S2]`, ... IDs to chunks and records metadata in turn state.
- **Missing Documentation vs. Prohibition Rule:** Missing documentation (`NO_RESULTS` or `INSUFFICIENT_EVIDENCE`, e.g. no SpendWise doc mentioning *"Grab"*) **never** implies a prohibition. The assistant must state that SpendWise documentation does not mention the item—never claim it is disallowed.

---

## 10. Citation Design `[P]`

- **Stable Source IDs:** Each chunk returned by `search_knowledge_base` is assigned a turn-unique identifier (`[S1]`, `[S2]`, ...) mapped in server memory (`retrievedSourcesMap: Map<string, SourceMetadata>`).
- **Validation:** `assistantResponse.js` scans the model's final answer for `[S\d+]` tokens:
  - Known IDs present in `retrievedSourcesMap` are collected into `citedSources` (preserving `id`, `title`, `sectionNumber`, `sectionTitle`, `source`, `score`).
  - Unknown/fabricated IDs (e.g. `[S99]`) are stripped from the final answer text and never added to `sources`.
- **Streaming Timing Resolution (Selected: Option A):**
  - Pre-stream (`metadata` / `sources_consulted`): emit `consultedSources` (all retrieved chunks from `search_knowledge_base` so the UI may show "Consulting SpendWise docs..."), explicitly **not** claiming they were cited yet.
  - Terminal (`done.sources`): emit the authoritative **cited-only `sources`** computed after full answer validation. If a stream is incomplete/aborted, `done.sources` (or fallback reconciliation) remains authoritative.

---

## 11. Tool Loop and Execution Limits `[P]`

| Limit | Proposed Value | Rationale |
| :--- | :--- | :--- |
| **Max Orchestration Rounds** | `4` | Allows: (1) KB + finance read, (2) follow-up/proposal, (3) final answer, +1 buffer. |
| **Max Total Tool Executions** | `6` | Prevents runaway tool loops while permitting hybrid multi-tool turns. |
| **Max KB Searches per Turn** | `2` | Allows 1 initial search + 1 refined query. |
| **Max Transaction Proposals per Turn** | `1` | Matches single-draft UI card in `ExpenseAssistant.jsx:43-55` `[C]`. |
| **Per-Tool Timeout** | `10,000 ms` | Bounds Qdrant/Supabase latency per call. |
| **Overall Request Deadline** | `30,000 ms` | Protects HTTP/SSE worker threads (`AbortSignal` propagated). |

- **Pre-Proposal Evidence Rule:** When `requiresKbEvidence === true`, `propose_transaction` is deterministically blocked until `search_knowledge_base` has returned `SUFFICIENT` in the current turn. If `search_knowledge_base` was skipped by the model, `canExecuteTool` rejects the proposal call; if KB returns `unavailable`, `no_results`, or `insufficient`, `propose_transaction` remains blocked.
- **Sequential Default & Conditional Parallel Tool Calling (`@google/genai`):**
  - Currently `geminiProvider.js:611` reads only `response?.functionCalls?.[0]` and omits `id` `[C]`.
  - **Safe P2-T12 Default:** Sequential tool execution is the safe initial implementation, preserving compatibility with existing `generateToolTurn` / `generateToolFollowup` callers.
  - **Conditional Parallel Upgrade:** Parallel execution of independent **read-only** tools (`search_knowledge_base`, `search_transactions`, `get_spending_summary`) is enabled **only after** verifying the installed `@google/genai` SDK provides `functionCall.id` and supports multi-part `functionResponse` arrays in deterministic order. If `functionCall.id` is absent, execution automatically falls back to sequential mode. `propose_transaction` always executes sequentially.
- **Numeric Correctness Boundary:** Tool results (`get_spending_summary`, `search_transactions`) are computed deterministically in PostgreSQL/JS `[C]`. However, natural-language prose numbers generated by the LLM remain a **model-quality risk** (code cannot reliably parse/verify arbitrary prose arithmetic); therefore, the UI must continue rendering authoritative structured `ToolSpendingSummary` / `ToolSearchResults` cards alongside prose `[C]`.

---

## 12. Category Normalization `[P]`

- **Authoritative Backend Source:** Canonical categories currently live in `RECEIPT_CATEGORIES` (`server/src/features/receipt/receipt.schema.js:4-7`) and mirrored client constants (`client/src/shared/transactions/expenseConstants.js:1-11`, `expenseCategories.js:1`) `[C]`. The backend will consolidate authority in `server/src/constants/categories.js` `[P]` with explicit type separation:
  - **Expense Categories:** `['Food & dining', 'Transportation', 'Shopping', 'Education', 'Health', 'Entertainment', 'Other expenses']` `[C]`
  - **Income Categories:** `['Salary', 'Other income']` `[C]`
  - **All Canonical Categories:** Union of both arrays (preserving `RECEIPT_CATEGORIES` order `[C]`).
- **Shared Contract Across Paths:** Receipt extraction (`receipt.schema.js`), transaction creation (`transaction.schema.js`), and assistant proposals (`propose_transaction`) all validate against this same backend authority, including `type === 'income'` $\rightarrow$ `INCOME_CATEGORIES` and `type === 'expense'` $\rightarrow$ `EXPENSE_CATEGORIES`.
- **Resolution Order (No Ambiguous Prefix Matching):**
  1. **Exact normalized match:** case-insensitive, trimmed match against canonical categories (e.g. `'food & dining'` $\rightarrow$ `'Food & dining'`).
  2. **Explicit alias map (grounded in existing `receipt.schema.js:16-24` `[C]`):** exact normalized terms already present in `normalizeReceiptCategory` (`food`, `dining`, `restaurant`, `cafe`, `coffee`, `grocery` $\rightarrow$ `'Food & dining'`; `transport`, `travel`, `taxi`, `fuel`, `parking` $\rightarrow$ `'Transportation'`; `shop`, `retail`, `clothing` $\rightarrow$ `'Shopping'`; `tuition`, `book`, `course`, `school`, `education` $\rightarrow$ `'Education'`; `medical`, `health`, `hospital`, `pharmacy` $\rightarrow$ `'Health'`; `movie`, `game`, `entertainment`, `music` $\rightarrow$ `'Entertainment'`; `salary`, `wage`, `payroll` $\rightarrow$ `'Salary'`; `income`, `refund` $\rightarrow$ `'Other income'`). Ambiguous prefix matching (e.g. `startsWith`) is **prohibited**.
  3. **Unknown category handling:**
     - `receiptExtractionSchema` retains fallback to `'Other expenses'` / `'Other income'` so partial OCR extractions remain reviewable `[C]`.
     - `propose_transaction` and `transactionSchema` **reject** unmapped unknown categories (and income/expense category mismatches) with a Zod validation error.
- **Frontend Compatibility Without Server Imports:** `client/src/shared/transactions/expenseConstants.js` and `expenseCategories.js` remain independent of `server/` imports `[C]` and are verified against `server/src/constants/categories.js` via a shared contract parity unit test (with optional read-only `GET /api/categories` metadata later if dynamic categories are introduced).

---

## 13. Legacy Compatibility `[P]`

- **Canonical Route:** `POST /api/chat-assistant` becomes the canonical unified assistant endpoint, returning `{ sourceType, sourceRef, proposal }` (no server-generated `draftId`) for `propose_transaction`.
- **Compatibility Façade:** `POST /api/expense-assistant` remains mounted in P2-T12 and delegates internally to `orchestrateUnifiedChat` with a response adapter:
  - Internal/model-facing tool name: **`propose_transaction`**.
  - Legacy `/api/expense-assistant` response adapter maps `toolName: 'propose_transaction'` $\rightarrow$ `'create_transaction'` and `{ draft: toolResult.proposal, ... }` (attaching compatibility `draftId` only on the legacy façade if required) so existing callers/tests continue working unchanged.
  - `ExpenseAssistant.jsx:43-55` `[C]` will be updated in P2-T12 to call `/api/chat-assistant`, generate local `draftId = crypto.randomUUID()` on the frontend when staging in IndexedDB, and accept canonical `'propose_transaction'` (plus `'create_transaction'` during transition).

---

## 14. P2-T12 Implementation Boundary `[P]`

**In Scope for P2-T12:**
- Implement `assistantOrchestrator`, `assistantPolicy`, `assistantTools`, `assistantPrompt`, `assistantResponse` under `server/src/features/chatAssistant/`.
- Wire `POST /api/chat-assistant` (and `/api/expense-assistant` compatibility façade) to the unified orchestrator using **synchronous JSON** responses.
- Update `geminiProvider.js` `generateToolTurn` / `generateToolFollowup` to support multi-call arrays (`id`, `name`, `args`) while keeping existing single-call callers compatible.
- Update `client/src/app/App.jsx` / `ExpenseAssistant.jsx` to call `/api/chat-assistant` and render KB `sources` alongside transaction tool cards.

**Explicitly Out of Scope for P2-T12 (MUST NOT DO):**
- Frontend `ReadableStream` / `EventSource` SSE consumption or `AbortController` UI.
- Genuine token-by-token model streaming on the agent path.
- Any database migration or `chat_conversations` / `chat_messages` schema changes.
- Provider/token-estimator refactoring (`P2-T14`).
- Rewriting Qdrant retrieval/threshold logic.

---

## 15. P2-T13 SSE and Persistence Boundary `[P]`

Reserved exclusively for **P2-T13**:
- Genuine token streaming during final tool-followup generation (`generateContentStream`).
- Frontend `fetch` + `ReadableStream` SSE consumer + `AbortController` Stop button.
- Server-authoritative chat history persistence (`assistantPersistence.js`) + forward-only `chat_messages` migration (e.g. `status` column: `'streaming' | 'completed' | 'aborted' | 'error'`).
- **Retry & Idempotency Constraint:** Do **NOT** create a unique index on `reply_to` if retry attempts create multiple assistant rows linked to one user message. P2-T13 must either separate `request_id` vs `attempt_id` (marking prior attempts superseded) or use a single-row update model per `(conversation_id, reply_to)`.

---

## 16. Testing Strategy `[P]`

1. **Unit Tests:**
   - `assistantPolicy.test.js`:
     - `out_of_scope` blocks all tools (`[]`).
     - `unknown` allows `search_knowledge_base` only, sets `requiresKbEvidence = true`, and rejects model-requested finance calls (`search_transactions`, `get_spending_summary`, `propose_transaction`).
     - `in_scope` + `kb_docs` allows `search_knowledge_base` only (blocks finance read & proposal tools).
     - `in_scope` + `finance_read` allows `search_transactions` / `get_spending_summary` (blocks `propose_transaction`).
     - `in_scope` + `transaction_proposal` (ordinary) allows `propose_transaction` with `requiresKbEvidence = false`; policy-dependent proposal (`hybrid`) enforces `requiresKbEvidence = true` and blocks `propose_transaction` if KB retrieval was skipped, unavailable, or insufficient.
     - Prompt injection in `message` or `history` blocked.
   - `assistantTools.test.js`: Zod validation, `user.id` JWT enforcement, authoritative category + income/expense type resolution (no prefix guessing), `propose_transaction` returns `{ sourceType, sourceRef, proposal }` without DB writes or `draftId` invention, caps/timeouts enforced.
   - `assistantResponse.test.js`: `[S1]`/`[S2]` citation mapping, stripping unknown `[S99]`, `validateChatResponse` leak checks.
   - `assistantOrchestrator.test.js`: KB-only, finance-only, hybrid (KB + finance), missing-doc vs prohibition behavior, pre-proposal KB verification skip/failure blocking proposal, sequential execution default & multi-round cap.
   - `categoryParity.test.js`: verifies frontend `EXPENSE_CATEGORIES` / `INCOME_CATEGORIES` match backend `server/src/constants/categories.js`.
2. **Integration Tests:**
   - `POST /api/chat-assistant` with mocked AI + mocked Qdrant + mocked transaction service verifying RBAC (`authenticate`, `authorize('user')`), hybrid response `{ answer, toolName, toolResult, sources }`, and `/api/expense-assistant` legacy `create_transaction` façade compatibility.

---

## 17. Risks and Unverified Assumptions `[U]`

- **Live `@google/genai` Parallel Tool-Calling & `id` Behavior `[U]`:** Inspected `geminiProvider.js:611` uses `response?.functionCalls?.[0]` without `id`. Exact runtime `functionCall.id` presence and multi-part `functionResponse` behavior in the installed `@google/genai` SDK version must be verified against the live Gemini API (or SDK types) during P2-T12.
- **Live Qdrant & Supabase Runtime `[U]`:** Live Qdrant alias resolution (`spendwise_active`) and Supabase RLS queries were not executed in this design-only task.
- **LLM Prose Arithmetic `[C]/[I]`:** Even with deterministic tool calculations, LLM summaries can misstate numbers; UI must continue rendering structured tool result cards.

---

## 18. Architecture Decision Records (`Proposed`)

| Decision ID | Context | Options Considered | Decision | Rationale | Consequences | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **ADR-P2-01** | Active assistant lacks RAG; `chatAssistant` splits `'agent'`/`'rag'`. | A: Extend `expenseAssistant`; B: Unified orchestrator in `chatAssistant/`; C: Multi-agent router. | **Option B** (`chatAssistant/` unified orchestrator) | Reuses `/api/chat-assistant`, centralizes policy, supports hybrid turns without multi-agent overhead. | Requires updating `App.jsx` to call `/api/chat-assistant` and keeping `/api/expense-assistant` façade temporarily. | **Proposed** |
| **ADR-P2-02** | Scope vs. tool permissions: `in_scope` must not grant all finance tools to doc queries, and `unknown` must not gain finance access. | A: Grant all tools on `in_scope`; B: Refuse `unknown`; C: Separate scope from capability policy (`kb_docs`, `finance_read`, `transaction_proposal`, `hybrid`), `unknown` $\rightarrow$ KB-only, deterministic `requiresKbEvidence`. | **Option C** | Prevents model-driven scope/permission escalation and ensures mandatory KB policy checks cannot be skipped. | Policy classifier must distinguish `kb_docs`, `finance_read`, `transaction_proposal`, `hybrid`, and `requiresKbEvidence`. | **Proposed** |
| **ADR-P2-03** | Client-supplied `history` is untrusted in P2-T12 before server-authoritative P2-T13. | A: Trust client `assistant` turns; B: Wrap/strip client `assistant` turns as untrusted context. | **Option B** (treat client history as untrusted text context) | Prevents forged assistant turns from injecting fake tool results. | Multi-turn tool memory awaits P2-T13 server-authoritative DB history. | **Proposed** |
| **ADR-P2-04** | Streaming UI wants sources, but cited IDs are unknown before answer finishes. | A: Emit consulted sources pre-stream, cited-only in `done.sources`; B: Emit cited sources only at end. | **Option A** (consulted pre-stream, authoritative cited-only in `done.sources`) | Honest timing semantics; avoids claiming citations before text exists. | UI must distinguish consulted vs cited sources in P2-T13. | **Proposed** |
| **ADR-P2-05** | Category normalization across receipts, transactions, and proposals. | A: Prefix matching; B: Exact canonical + explicit alias dictionary. | **Option B** (exact + explicit aliases, no prefix matching) | Eliminates ambiguous prefix collisions. | Unmapped aliases require explicit dictionary addition or fallback. | **Proposed** |

---

## 19. P2-T12 Implementation Readiness Checklist

- [x] Existing call graphs (`App.jsx` $\rightarrow$ `/api/expense-assistant`, `/api/chat-assistant`, `ragService.js`, `geminiProvider.js`) verified by direct inspection `[C]`.
- [x] All 10 design contradictions checked and resolved in Sections 7, 9, 10, 11, 12, 13, 14, and 15.
- [ ] Architect/user review and approval of `Proposed` ADRs (`ADR-P2-01`–`ADR-P2-05`).
- [ ] Verify `@google/genai` `functionCall.id` and multi-`functionResponse` structure against installed SDK before enabling optional parallel read-only tool calls in P2-T12 (sequential execution is the safe default).
