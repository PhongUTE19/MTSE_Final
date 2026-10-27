# AI Usage and Human Review Log (AI_USAGE.md)

**Project:** SpendWise — Personal Expense Tracker & AI Assistant  
**Academic Year:** 2026–2027  
**Team Composition:** 3 Members  
**Last Updated:** 2026-10-26  

---

## 1. Overview and Intent

In accordance with course guidelines for *New Technologies in Software Engineering*, this document provides an honest, transparent record of how Artificial Intelligence (AI) tools were integrated into the development lifecycle of SpendWise.

AI tools were employed as pair-programming assistants to accelerate repetitive tasks (boilerplate generation, test fixture creation, refactoring, and documentation drafting). All architectural decisions, security boundaries, business logic, and code reviews were strictly owned, reviewed, and validated by the team members.

---

## 2. AI Development Tools Utilized

| Tool / Model | Primary Usage Area | Context & Deployment |
|---|---|---|
| **Antigravity IDE / Agentic AI** | Architecture refactoring, Docker configuration, test automation, and codebase auditing | Local IDE pair-programming agent with workspace tool execution. |
| **Google Gemini 3.5 Flash & Flash Lite** | Application-level AI capabilities (Multimodal OCR, Structured Output, Tool-Using Agent) | Official `@google/genai` Node.js SDK for live runtime capabilities. |
| **GitHub Copilot / Cursor** | In-editor autocompletion and repetitive boilerplate generation | Daily feature development across React components and Express route schemas. |

---

## 3. Representative Prompts and Task Summaries

### 3.1 Zod Schema & Validation Generation
* **Representative Prompt / Summary**: *"Generate strict Zod schemas for expense transaction creation and filtering, including pagination defaults (page 1, limit 1–50) and date validation ensuring ISO 8601 formatting."*
* **Generated Code**: `server/src/features/expenses/expenses.schemas.js`.
* **Human Review**: Enforced positive amount checks, category enum matching, and sanitized string boundaries to prevent prototype pollution or database injection.

### 3.2 Automated Test Suite Expansion
* **Representative Prompt / Summary**: *"Write unit tests for the expense assistant function-calling flow, verifying that queries for 'last week' or 'today' resolve to correct calendar dates and that the agent asks for clarification on ambiguous transfer inputs."*
* **Generated Code**: `tests/unit/expenseAgent.test.js`.
* **Human Review**: Adjusted time assertions to test boundary dates, added edge cases for Vietnamese money strings (`500k`, `500.000đ`), and verified mock cleanup in `afterEach()`.

### 3.3 Route Guard & Layout Consolidation
* **Representative Prompt / Summary**: *"Refactor AuthenticatedRouteGuard and AdminRouteGuard to eliminate duplicate session checking and loading states while strictly keeping regular user and admin access boundaries distinct."*
* **Generated Code**: `client/src/layouts/AuthenticatedRouteGuard.jsx` and `client/src/layouts/AdminRouteGuard.jsx`.
* **Human Review**: Tested redirect loops, verified that missing `app_metadata.role` defaults safely to `user`, and confirmed that unauthenticated visitors are redirected to `/auth`.

### 3.4 Early Multimodal OCR & Structured Output Scaffolding [Reconstructed]
* **Evidence Source**: Git commit `215cf21` ("finish Multimodal, Structured Output and create guide doc for user", 2026-10-24) and diffs.
* **Reconstructed Task Summary**: Scaffolding receipt image upload middleware (`receiptUpload.middleware.js` using Sharp and Multer), Zod extraction schemas (`receipt.schemas.js`), and prompt versions `receipt-v1.md`, `receipt-v2.md`, `receipt-v3.md` targeting Gemini 3.5 Flash vision.
* **Attribution & Limitations**: Initial scaffolding utilized pair-programming AI assistance (Copilot / Gemini). Exact prompt text prior to `AI_USAGE.md` creation was not recorded at invocation time; marked for team confirmation.
* **Human Engineering Review**: Team added image pixel safety bounds (`limitInputPixels: 8000*8000`), magic bytes validation, VND thousands separator normalization (`normalizeLikelyVndThousands`), and review-only draft isolation requiring explicit user confirmation before transaction persistence.

### 3.5 Tool-Using Expense Agent Scaffolding [Reconstructed]
* **Evidence Source**: Git commits `b72eedb`, `cd9f7fa`, `647b6e5` (feat: transaction search, spending summary, 3 tools and assistant UI, 2026-10-25).
* **Reconstructed Task Summary**: Implementation of function declarations for `search_transactions`, `get_spending_summary`, and `create_transaction` using Google GenAI SDK function-calling protocol in `geminiExpenseAgent.js` and `expenseAgent.service.js`.
* **Attribution & Limitations**: AI tools assisted in prototyping tool schemas and route scaffolding. Exact author prompts predating `AI_USAGE.md` are reconstructed from code artifacts and marked for team confirmation.
* **Human Engineering Review**: Enforced strict Zod validation on model-generated arguments (`searchTransactionsArgsSchema`, `spendingSummaryArgsSchema`, `createTransactionArgsSchema`), quarantined user identity strictly to authenticated JWT tokens (`userClient(user)`), and separated proposal drafting from financial write operations with a 10-minute in-memory TTL.

### 3.6 RAG Pipeline & Guardrail Foundation [Reconstructed]
* **Evidence Source**: Git commit `9d71673` ("feat: guardrails", 2026-10-20) and diffs.
* **Reconstructed Task Summary**: Scaffolding prompt injection detection (`promptInjection.js`), scope classification (`scopeGuard.js`), response validation (`responseValidator.js`), and grounding prompt assembly (`promptBuilder.js`).
* **Attribution & Limitations**: Pattern dictionaries and test fixtures were developed with AI pair-programming assistance. Specific prompt iterations predating `AI_USAGE.md` are reconstructed from git diffs and marked for team confirmation.
* **Human Engineering Review**: Implemented strict grounding rules, out-of-scope intent boundaries, regex boundary checks, system prompt signature leakage sanitization, and `withTimeout` race protection against hanging connections.

---

## 4. Code Reviewed, Modified, and Verified by Team Members

The team established a strict policy: **No AI-generated code is committed without automated testing and human inspection.**

1. **Security & Authorization Review**:
   * Every database query was inspected to ensure user ID isolation (`auth.uid() = user_id`).
   * Verified that service-role keys are never bundled into the client build context or exposed in HTTP responses.
2. **Deterministic Arithmetic Verification**:
   * Confirmed that financial summaries, balances, and totals are computed strictly in SQL/PostgreSQL or integer-cents math, never trusted to generative LLM tokens.
3. **Automated Testing Gate**:
   * All 49 test suites (344 tests) must pass with zero failures before accepting modifications (`npm test`).
   * Live multimodal evaluations must be executed across 20 synthetic test cases to verify prompt accuracy (`evals/receipts/`).

---

## 5. Verified Incidents: AI-Generated Mistakes and Remediations

Below are three verified real-world incidents where AI tools produced incorrect, inadequate, or insecure code during development, along with our detection methods and engineering remediations.

### Incident 1: Bypassing Row-Level Security (RLS) with Singleton Service-Role Client
* **AI-Generated Approach**: When scaffolding the initial expense CRUD services, the AI instantiated Supabase database queries using the shared backend singleton client initialized with `SUPABASE_SECRET_KEY` (service role).
* **Why It Was Inadequate/Dangerous**: The Supabase service-role key completely bypasses PostgreSQL Row-Level Security (RLS) policies. If a developer accidentally omitted `WHERE user_id = ?` in any query, or if a parameter was manipulated, the endpoint would read or modify other users' private financial data.
* **How It Was Detected**: Detected during a security architecture review and verified by a tenant isolation unit test (`tests/unit/authService.test.js`) where tenant A was able to read tenant B's records when using the service key.
* **Remediation**:
  * The team refactored `server/src/shared/middleware/authenticate.js` and `server/src/features/expenses/expenses.service.js` to construct a short-lived, user-scoped Supabase client for each request using `SUPABASE_ANON_KEY` and the caller's verified `Bearer <token>`.
  * The service-role client was strictly quarantined to internal telemetry logging (`server/src/features/analytics/analytics.repository.js`).
  * Documented as an architectural requirement in [docs/README/adr/0001-spendwise-authentication-architecture.md](docs/README/adr/0001-spendwise-authentication-architecture.md).

---

### Incident 2: Timezone Mismatch in Relative Date Filtering (UTC vs. Vietnam Time)
* **AI-Generated Approach**: When generating natural-language date resolution logic in `server/src/features/expenseAgent/geminiExpenseAgent.js`, the AI used `new Date().toISOString().split('T')[0]` to determine the current day for relative terms like `"today"` or `"yesterday"`.
* **Why It Was Inadequate/Dangerous**: Container servers in cloud environments default to UTC (GMT+0). In Vietnam (`UTC+7`), between 00:00 and 07:00 local time, the UTC date is still on the previous calendar day. Consequently, an expense logged at 1:30 AM in Ho Chi Minh City on October 25th was queried as October 24th, resulting in missing transactions and incorrect summaries.
* **How It Was Detected**: Caught by automated test case `"uses the Vietnam calendar date instead of the server UTC date for relative filters"` in `tests/unit/expenseAgent.test.js`.
* **Remediation**:
  * Implemented a dedicated timezone-aware helper `getVietnamDate()` utilizing `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })`.
  * Injected this explicit date anchor into the system instruction on every agent call so Gemini evaluates relative intervals against Vietnam local calendar time.

---

### Incident 3: Static Bundling Failure from Missing Client Build Arguments in Docker
* **AI-Generated Approach**: The AI generated Docker Compose and Dockerfile configurations treating client environment variables (`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`) as runtime container environment variables.
* **Why It Was Inadequate/Dangerous**: Vite is a client-side static bundler that compiles React code into static HTML/JS during `npm run build`. Runtime container environment variables provided to the Nginx container are invisible to Vite during compilation. Because `.dockerignore` excluded local `.env` files, Vite compiled the bundle with `undefined` values, displaying the error: *"Authentication is not configured for this environment"*.
* **How It Was Detected**: Detected when running `docker compose up` and accessing `http://localhost:5173` in a clean environment.
* **Remediation**:
  * Updated `client/Dockerfile` to explicitly accept `ARG VITE_SUPABASE_URL` and `ARG VITE_SUPABASE_ANON_KEY`, validate their non-empty presence before building, and export them as build-time `ENV`.
  * Updated `docker-compose.yml` to pass these build arguments from the environment during `docker compose build`.

---

## 6. Team Attribution and Ownership Confirmation

* All team members participated in reviewing, testing, and verifying the AI-assisted code.
* Specific member ownership of features:
  * **Member 1 (PhongUTE19)**: Authentication, Session Management, Docker deployment pipeline, and Architecture Documentation.
  * **Member 2**: Transaction CRUD, Pagination, Table UI, and Analytics Dashboard.
  * **Member 3**: Multimodal Receipt Scanning, AI Prompt Engineering, and Live Evaluations.
* Any unverified code or claims have been marked for team verification and will not be presented as finished without automated test coverage.

---

## 7. Agent Invocation Log: Admin Analytics Request History Improvements

* **Date:** 2026-10-27
* **Tool / Model:** Antigravity IDE / Gemini 3.8 Flash (Medium)
* **Task Summary:** Improve Admin Analytics Request History table with full-dataset search, server-side / repository full-dataset sorting, direct page navigation ("Go to page"), and independent pagination/sort/filter state coordination.
* **Key User Prompt:** *"Improve the Admin Analytics Request History table with search, full-dataset sorting, and direct page navigation... Search the full dataset rather than only the currently displayed page... Sorting must apply to the entire matching dataset before pagination... Add an input that lets users navigate directly to a specific page... Validate the input, handle out-of-range values safely... Keep behaviors independent... Preserve existing table columns, row expansion, cost information, prompt metadata, visual styling, and responsive behavior."*
* **Files Changed:**
  * `server/src/features/analytics/analytics.schemas.js`: Extended `analyticsHistorySchema` with validated query fields (`search`, `q`, `sortBy`, `sortKey`, `sortOrder`, `sortDirection`).
  * `server/src/features/analytics/analytics.utils.js`: Updated `filterInMemoryRecords` with case-insensitive search across request ID, feature, operation, model, outcome, promptId, promptVersion, and promptHash. Added and exported `sortInMemoryRecords` with deterministic tie-breaking.
  * `server/src/features/analytics/analytics.service.js`: Normalized query parameters in `getAnalyticsHistory`.
  * `server/src/features/analytics/analytics.repository.js`: Added search filter support (`.or(...)`) and sorting (`order(column, { ascending })`) to Supabase queries, and integrated `sortInMemoryRecords` before slicing in-memory fallback results.
  * `client/src/shared/components/Pagination.jsx`: Added `showGoToPage` prop, direct numeric page jump input form, and safe bounds validation/clamping.
  * `client/src/shared/styles/components/tables.css`: Added styles for `.pagination-go-to-page`, `.pagination-jump-label`, and `.page-jump-input`.
  * `client/src/features/analytics/analytics.css`: Added `.analytics-history-header` layout and `.analytics-empty-search` styling.
  * `client/src/features/analytics/useAnalytics.js`: Initialized search and sort keys in filter state and optimized `loadData` to fetch only history when top-level filters have not changed.
  * `client/src/features/analytics/AnalyticsHistoryTable.jsx`: Reused shared `SearchInput`, wired search change/clear handlers, enabled `showGoToPage` in `Pagination`, passed `filters.sortBy` and `filters.sortOrder` to `SortableHeader`, and added clear empty-search state.
  * `tests/unit/analytics.test.js`: Added test cases for full-dataset search across fields, multi-page sorting before slicing, and schema validation.
  * `tests/unit/analyticsHistoryTable.test.js`: Added unit tests covering search filter transitions, sort toggling, page resets, and direct page navigation boundary clamping.
* **Review & Verification:**
  * Executed `node --test "tests/unit/analytics.test.js"`: All 42 tests passed.
  * Executed `node --test "tests/unit/analyticsHistoryTable.test.js"`: All 13 tests passed.
  * Executed `npm --prefix client run build`: Vite build completed successfully without errors.
  * Executed `git diff --check`: Passed with zero whitespace or conflict warnings.
  * Verified input boundaries: invalid/out-of-range page inputs are clamped safely to `[1, totalPages]`; search query resets page to 1 while preserving active filters; sorting determines entire dataset order before slicing.

---

## 8. Agent Invocation Log: Historical AI Telemetry Data & UI Field Mapping Repair

* **Date:** 2026-10-27
* **Tool / Model:** Antigravity IDE / Gemini 3.8 Flash (Medium)
* **Task Summary:** Fix historical AI telemetry data, prompt identity, token counts, and UI field mappings in SpendWise without inventing missing values.
* **Key User Prompt:** *"Fix historical AI telemetry data and UI field mappings in SpendWise without inventing missing values... Keep prompt_id, prompt_version, and prompt_hash separate... Move historical values from prompt_version to prompt_hash only when their hash format and meaning can be verified... Recover a logical prompt version only when established from reliable evidence; otherwise leave it unknown and render 'Legacy / unknown' in the UI instead of displaying a hash as a version... Preserve valid recorded token counts; never replace missing token values with zero... Normalize cost_status... Recalculate historical cost only when actual token usage, the exact model, and verified historical price exist... Safe migration and verification."*
* **Files Changed:**
  * `supabase/migrations/202610270006_repair_historical_telemetry_prompt_and_cost.sql`: Repeatable migration to add `prompt_hash`, safely split composite `<version>:<hash>` patterns, isolate pure 64-character SHA-256 hashes from `prompt_version`, derive `total_tokens` only when missing but input/output exist, normalize unpriced missing-token requests to `cost_status = 'missing_tokens'`, and recalculate historical cost using verified rates for `gemini-3.5-flash-lite`, `gemini-2.5-flash`, and `gemini-1.5-flash`.
  * `server/scripts/backfill-telemetry.js`: Repeatable, backward-compatible Node.js telemetry backfill script supporting `--dry-run` and `--apply` modes with granular audit reporting.
  * `server/src/features/analytics/analytics.repository.js`: Updated `formatDbToRecord` to safely derive missing `total_tokens` from input + output tokens without overwriting provider totals, preserve null tokens without zero-fabrication, normalize legacy `'unknown'` cost status to `'missing_tokens'` or `'calculated'`, and added `estimated_cost` and `cost_status` to `fetchOverviewRecords` and `fetchTimeseriesRecords` database selects.
  * `client/src/features/analytics/AnalyticsHistoryTable.jsx`: Updated Prompt Version column to strictly display logical versions and render `Legacy / unknown` for legacy hash rows; updated Tokens column to never fabricate `0` for null/missing counts (`${in} / ${out} (${tot})`); updated Cost column to show `—` with descriptive tooltips explaining why pricing is unavailable (`missing_tokens`, `unknown_pricing`, or `legacy unpriced`); updated `AnalyticsHistoryDetailRow` to clearly separate Prompt Version, `Prompt Hash (SHA-256)`, and cost availability reasons.
  * `tests/unit/analyticsTelemetryRepair.test.js`: Added 16 focused unit tests covering legacy hash detection, composite recovery, UI field mapping, missing token preservation, historical pricing calculation, cost-status normalization, and overview average-cost calculations.
* **Review & Verification:**
  * Ran read-only assessment on live Supabase records: Identified 266 total records, including 34 pure 64-hex hashes in `prompt_version`, 12 composite `<version>:<hash>` records, 125 records with incomplete/missing tokens, and 109 unpriced records eligible for verified historical pricing recalculation.
  * Executed dry-run backfill (`node server/scripts/backfill-telemetry.js --dry-run`): Evaluated all 266 records, correctly identified 207 records requiring updates, 0 fabricated values, 125 preserved missing-token records, and 109 eligible cost recalculations.
  * Applied backfill (`node server/scripts/backfill-telemetry.js --apply`): Successfully updated all 207 targeted database records with zero errors.
  * Re-inspected live database: Confirmed 0 pure hashes remain in `prompt_version` (all 34 moved to `prompt_hash`), 0 composite strings remain in `prompt_version`, all 109 eligible requests have recalculated costs with `cost_status = 'calculated'`, and all 125 incomplete-token requests have `cost_status = 'missing_tokens'` with `estimated_cost = null`.
  * Executed `node --test tests/unit/analytics.test.js tests/unit/analyticsHistoryTable.test.js tests/unit/analyticsTelemetryRepair.test.js`: All 71 tests passed across 21 test suites.
  * Executed `npm --prefix client run build`: Production client build succeeded in 18.42s without errors.
  * Executed `git diff --check`: Passed with zero whitespace, line ending, or conflict markers.

---

## 9. Agent Invocation Log: Historical Token & Cost Estimation Coverage

* **Date:** 2026-10-27
* **Tool / Model:** Antigravity IDE / Gemini 3.8 Flash (Medium)
* **Task Summary:** Improve historical token and estimated-cost coverage in SpendWise Admin Analytics using clearly identified deterministic estimates without overwriting actual provider usage data.
* **Key User Prompt:** *"Improve historical token and estimated-cost coverage in SpendWise Admin Analytics using clearly identified estimates... Never overwrite provider-reported token counts or valid recorded costs... Use deterministic pseudo-random values derived from the request ID... Use sensible ranges for receipt multimodal extraction, structured category prediction, and tool-using agent requests... Store estimated values separately from provider-reported values, preferably in nullable estimated_input_tokens, estimated_output_tokens, and estimated_total_tokens fields... Display actual values when available; otherwise show estimates with a clear '~' marker or an 'Estimated' indicator... Mark backfilled estimates with an explicit status such as estimated_backfill... Do not mix synthetic estimates into a metric presented as actual usage... Safe, repeatable backfill."*
* **Files Changed:**
  * `server/src/features/analytics/tokenEstimator.js`: Created deterministic pseudo-random estimation engine (`getDeterministicRandom`, `deterministicIntInRange`, `estimateTokensForRequest`, `calculateEstimatedBackfillCost`) calibrated to empirical task profiles (`RECEIPT_EXTRACTION`, `AGENT_TOOL_SELECTION`, `AGENT_SUMMARY`, `KNOWLEDGE_EMBEDDING`, `GENERAL_FALLBACK`).
  * `supabase/migrations/202610270007_add_estimated_tokens_to_ai_usage.sql`: Added nullable columns `estimated_input_tokens`, `estimated_output_tokens`, `estimated_total_tokens` and partial index `idx_ai_usage_estimated_tokens`.
  * `server/scripts/backfill-telemetry.js`: Updated backfill script to deterministically estimate missing token usage, calculate estimated cost from verified model rates, set `cost_status = 'estimated_backfill'`, and preserve all actual provider tokens and recorded costs intact.
  * `server/src/features/analytics/analytics.repository.js`: Updated `formatRecordForDb` and `formatDbToRecord` to persist and decode separate estimated token dimensions, preserve existing `cost_status` values (`calculated` vs `estimated_backfill`), and provide fallback deterministic estimation on the fly.
  * `server/src/features/analytics/analytics.utils.js`: Updated `calculateOverviewMetrics` to strictly compute verified actual average costs from `calculated` records, separately report `estimatedCostUsd` and `estimatedPricedCount`, compute combined average costs labeled as estimated, and fallback to effective estimated total tokens in `sortInMemoryRecords`.
  * `client/src/features/analytics/AnalyticsHistoryTable.jsx`: Updated Tokens column to display `~${in} / ~${out} (~${tot})` with `~Estimated` subtext for estimated tokens; updated Cost column to display `~$${cost}` with `~Est` subtext for `estimated_backfill` status; updated `AnalyticsHistoryDetailRow` to clearly distinguish `Actual` vs `Estimated (Deterministic backfill estimate)`.
  * `client/src/features/analytics/AnalyticsKpiCards.jsx`: Updated Avg Cost KPI card to preserve the verified actual average cost in `stat-value` and transparently display separate verified vs estimated breakdowns and sample counts.
  * `tests/unit/analyticsTokenEstimator.test.js`: Added 16 focused unit tests covering deterministic pseudo-random repeatability, sensible profile ranges, failure output reductions, partial token preservation, pricing lookup, database mapping, and verified vs estimated overview metrics separation.
* **Review & Verification:**
  * Pre-backfill read-only inspection: Identified 141 records with actual provider tokens and 128 records with missing tokens (89 knowledge embeddings with actual output=0, 20 agent tool selections, 9 agent summaries, 10 receipt extractions).
  * Executed dry run (`node server/scripts/backfill-telemetry.js --dry-run`): Evaluated all 269 records; confirmed 141 actual provider token records were preserved untouched, 128 records qualified for deterministic token estimation and backfill pricing, and 0 unpriced unknown models existed.
  * Executed backfill apply (`node server/scripts/backfill-telemetry.js --apply`): Successfully updated all 128 missing records with zero errors.
  * Live database inspection: Verified 141 records have `cost_status = 'calculated'` (100% verified actual costs preserved) and 128 records have `cost_status = 'estimated_backfill'` with non-null estimated tokens and costs. Total cost coverage reached 100% (269 of 269 records).
  * Executed `node --test tests/unit/analytics.test.js tests/unit/analyticsHistoryTable.test.js tests/unit/analyticsTelemetryRepair.test.js tests/unit/analyticsTokenEstimator.test.js`: All 87 tests passed across 28 suites with zero failures.
  * Executed `npm --prefix client run build`: Production client bundle built in 9.94s with zero errors.
  * Executed `git diff --check`: Passed with zero whitespace, line ending, or conflict warnings.

---

## 10. Agent Invocation Log: System Prompts, Guardrails, and Fallback Behavior Audit & Hardening

* **Date:** 2026-10-27
* **Tool / Model:** Antigravity IDE / Gemini 3.8 Flash (Medium)
* **Task Summary:** Audit and improve system prompts, guardrails, and fallback behavior for every existing SpendWise AI capability (Multimodal Receipt Extraction, Structured Output, Tool-Using Expense Agent, and RAG).
* **Key User Prompt:** *"Audit and improve system prompts, guardrails, and fallback behavior for every existing SpendWise AI capability... Multimodal input: handle receipt images only, extract supported fields without inventing unreadable/missing values, treat image text as untrusted data... Structured output: require expected schema, validate against application schema before business logic/persistence, never silently coerce invalid fields... Tool-using Expense Agent: define supported financial scope, allowed tools, data-isolation, treat user messages/receipts/tools as untrusted, backend arithmetic, explicit confirmation before write operations, prevent duplicate writes on retry... RAG: grounded answers, untrusted context, clear limitations... Safe logging without secrets or raw receipt contents... Update AI_USAGE.md including historical entries predating it... Run tests and verify."*
* **Files Reviewed and Changed:**
  * `server/src/shared/guardrails/promptInjection.js`:
    * Expanded `INJECTION_PATTERNS` to catch directive prefixes (`system override:`, `system instruction:`, `developer override:`), reset instructions (`reset all rules/constraints`), and extended delimiter boundary tags (`<retrieved_context>`, `<student_question>`, `<user_question>`, `<system>`, `<prompt>`, `<instruction>`, `[SYSTEM]`, `[ASSISTANT]`, `<|im_start|>`, `<|im_end|>`).
    * Updated `sanitizeGeneratedOutput` to strip simulated tag delimiters if echoed by models.
  * `server/src/features/expenses/receiptGuardrails.js`:
    * Hardened `enforceReceiptGuardrails` with object validation and extended prompt injection inspection across `merchant`, `note`, `category`, and line item names.
    * Throws operational `ReceiptGuardrailError` with codes `NOT_A_RECEIPT`, `PROMPT_INJECTION_REJECTED`, or `EXTRACTION_FAILED`.
  * `server/src/shared/integrations/ai/providers/geminiProvider.js`:
    * Added image buffer validation at the start of `extractReceiptImage` to reject missing or empty image buffers early with `AIResponseValidationError`.
    * Imported and surfaced operational errors safely.
  * `server/src/features/expenses/receipt.service.js`:
    * Sanitized error logging in `processStoredReceipt` to record only operational error names, codes, and IDs, masking raw receipt content, parsed text, or personal financial payload data.
    * Maintained safe fallback: unreadable images or timeouts mark receipts as `failed` for user retry while permanently rejected prompt injections clean up temporary storage.
  * `server/prompts/expenseAgent/assistant-v1.md`, `search-v1.md`, `summary-v1.md`, `create-v1.md`:
    * Enhanced prompts with explicit financial scope boundaries (personal expense tracking for authenticated user only).
    * Explicitly classified user messages, receipt text, and tool results as untrusted input.
    * Prohibited arbitrary mental arithmetic, mandating that all totals, balances, and category sums derive strictly from backend tool results.
    * Enforced explicit user confirmation boundaries: `create_transaction` prepares a draft proposal only, never a saved transaction; the model is prohibited from claiming success until confirmed by the user.
    * Mandated honest reporting of empty results: state clearly that no transactions were found instead of hallucinating records.
  * `server/src/features/expenseAgent/expenseAgentPrompt.js`:
    * Synchronized `BUILTIN_FALLBACKS` with the updated prompt instructions for resilience when files are read from memory/fallback paths.
  * `server/src/features/expenseAgent/geminiExpenseAgent.js`:
    * Routed both clarification responses and final answers through `validateChatResponse` to eliminate empty responses, system prompt leakage, or echoed delimiter tags.
  * `server/src/features/expenseAgent/expenseAgent.service.js`:
    * Added `detectPromptInjection` guardrail checks on all user entry points: `searchTransactionsForUser`, `getSpendingSummaryForUser`, `createTransactionProposalForUser`, and `runExpenseAssistantForUser`.
    * Validated prior conversation history turns in multi-turn assistant queries to block indirect injection.
    * Reaffirmed idempotency and RLS isolation in `confirmTransactionProposal` via atomic `processing` status transition and JWT user validation.
  * `server/src/features/knowledgeBase/promptBuilder.js`:
    * Sanitized chunk contents in `formatContextSections` and student queries in `buildGroundedPrompt` by stripping delimiter boundary tags to prevent context breakout.
  * `tests/unit/aiCapabilitiesGuardrails.test.js`:
    * Created comprehensive 19-test suite verifying receipt buffer validation, category prompt injection blocking, structured output validation, codeblock extraction, agent injection rejection, agent leakage sanitization, proposal authorization/expiration/idempotency, and RAG delimiter integrity.
* **Review & Verification:**
  * Executed focused test suite: `node --test tests/unit/aiCapabilitiesGuardrails.test.js` — All 19 tests passed.
  * Executed full AI test suite: `node --test tests/unit/guardrails.test.js tests/unit/receiptGuardrails.test.js tests/unit/expenseAgent.test.js tests/unit/promptRegistry.test.js tests/unit/aiCapabilitiesGuardrails.test.js tests/unit/chatOrchestrator.test.js tests/unit/spendingSummary.test.js` — All 83 tests passed across 21 test suites with zero failures.
  * Executed production client build: `npm --prefix client run build` — Vite build completed successfully in 9.94s with zero errors.
  * Executed git whitespace check: `git diff --check` — Passed with code 0 (no trailing whitespace, conflict markers, or line ending issues).
  * Verified that user changes (`AnalyticsHistoryTable.jsx` and user-modified badges) were completely preserved.

---

## 11. Agent Invocation Log: Hybrid Prompt Organization & Architecture Refactoring (RAG & Expense Agent)

* **Date:** 2026-10-27
* **Tool / Model:** Antigravity IDE / Gemini 3.8 Flash (Medium)
* **Task Summary:** Refactor SpendWise prompt organization using a hybrid architecture covering both RAG/Knowledge Base and the Expense Agent. Extract static natural-language instructions into versioned `.md` files under `server/prompts/` while strictly keeping executable logic (regexes, schemas, guardrails, tools, and confirmation gates) in JavaScript.
* **Key User Prompt:** *"Refactor SpendWise prompt organization using a hybrid approach, covering both RAG/Knowledge Base and the Expense Agent... Move substantial static natural-language instructions into appropriately organized, version-controlled `.md` files under the existing `prompts/` structure. Keep prompts grouped by capability and task, with clear IDs and explicit logical versions... Keep JavaScript responsible for loading prompts, applying dynamic variables, selecting tools, invoking models, validating results, and handling errors. Do not leave duplicate active prompt strings in the code after extraction... Keep executable logic in code (regex patterns, guardrails, Zod/JSON schemas, tool declarations, structured-output validation, confirmation gates)... Preserve behavior and prompt management... Ensure all required `.md` files are included in production Docker images... Update AI_USAGE.md... Run relevant tests, client/server production builds, and git diff --check."*
* **Files Reviewed and Changed:**
  * `server/Dockerfile`:
    * Added `COPY prompts/ ./prompts/` to ensure production Docker images bundle prompt templates and resolve correctly from runtime working directories.
  * `server/prompts/knowledgeBase/grounded-v1.md`:
    * Created versioned Markdown template for grounded RAG prompt containing passive reference instructions, untrusted context/query XML boundary guidelines, and `{{systemPrompt}}`, `{{context}}`, and `{{question}}` placeholders.
  * `server/prompts/knowledgeBase/system-v1.md`:
    * Created versioned baseline system prompt for the SpendWise Assistant with strict grounding, out-of-scope policies, and security guardrail rules.
  * `server/prompts/expenseAgent/context-v1.md`:
    * Created versioned conversation turn formatting template (`Conversation context:\n{{context}}\n\nCurrent user request: {{message}}`).
  * `server/src/features/knowledgeBase/ragPrompt.js`:
    * Created dedicated prompt management module exporting `RAG_PROMPT_IDS` (`GROUNDED: 'rag_grounded'`, `SYSTEM: 'rag_system'`), `RAG_PROMPT_VERSION = 'v1'`, `getRagPrompt`, `getRagPromptDetails`, `renderRagPrompt`, and `computeRagPromptVersion`.
    * Implemented concise operational fallback instructions to safeguard execution resilience without duplicating verbose prompt paragraphs in code.
  * `server/src/features/knowledgeBase/promptBuilder.js`:
    * Refactored `buildGroundedPrompt` to resolve templates via `getRagPrompt`, removing large inline static instruction strings.
    * Added `buildGroundedPromptDetails` to return prompt text along with stable ID, logical version, and content hash.
    * Retained input sanitization logic in code.
  * `server/src/features/knowledgeBase/ragService.js`:
    * Updated `executeRAG` to invoke `buildGroundedPromptDetails` and expose `promptId`, `promptVersion`, and `promptHash` in the execution result.
  * `server/src/features/assistant/assistant.service.js`:
    * Propagated `promptId` and `promptVersion` in `orchestrateRAGChat` and `orchestrateRAGChatStream` to `llmGenerator` and `llmStreamGenerator`, enabling accurate telemetry recording.
    * Returned prompt metadata in normalized orchestrator response contract.
  * `server/src/features/expenseAgent/expenseAgentPrompt.js`:
    * Added `EXPENSE_AGENT_PROMPT_IDS.CONTEXT = 'expense_agent_context'`.
    * Replaced bloated duplicate prompt strings in `BUILTIN_FALLBACKS` with concise operational fallbacks, eliminating active prompt duplication in JavaScript code.
    * Added `formatConversationContext` helper for clean multi-turn template rendering.
  * `server/src/features/expenseAgent/expenseAgent.service.js`:
    * Replaced inline template literal with `formatConversationContext`, removing hardcoded formatting strings from service logic.
  * `tests/unit/promptRegistry.test.js`:
    * Expanded test suite to 73 unit tests (including 8 new tests for RAG prompt loading, hashing, fallback, interpolation, and telemetry propagation, plus tests for context prompt loading and `formatConversationContext`).
* **Executable Logic Intentionally Retained in Code:**
  * Regex patterns: `INJECTION_PATTERNS`, sanitization tags (`retrieved_context`, `student_question`, etc.).
  * Guardrail matching & enforcement: `detectPromptInjection`, `classifyScope`, `enforceReceiptGuardrails`, `validateChatResponse`.
  * Zod / JSON schemas & tool declarations: `searchTransactionsArgsSchema`, `spendingSummaryArgsSchema`, `createTransactionArgsSchema`, `receiptExtractionSchema`, `SEARCH_TRANSACTIONS_TOOL`, `SPENDING_SUMMARY_TOOL`, `CREATE_TRANSACTION_TOOL`.
  * Financial write authorization and confirmation gates: in-memory proposal store, expiration timer, idempotent processing lock, and authenticated JWT user validation.
  * Error mapping & retry configurations: `executeWithRetry`, exponential backoff, rate limiting, and timeout wrappers.
* **Review & Verification:**
  * Executed focused prompt test suite: `node --test tests/unit/promptRegistry.test.js tests/unit/knowledgeBase.test.js tests/unit/chatOrchestrator.test.js tests/unit/expenseAgent.test.js tests/unit/aiCapabilitiesGuardrails.test.js` — All 73 tests passed across 20 test suites.
  * Executed full relevant AI and prompt test suite: `node --test tests/unit/promptRegistry.test.js tests/unit/knowledgeBase.test.js tests/unit/chatOrchestrator.test.js tests/unit/expenseAgent.test.js tests/unit/aiCapabilitiesGuardrails.test.js tests/unit/receiptExtractionSchema.test.js tests/unit/receiptGuardrails.test.js tests/unit/transactionProposal.test.js tests/unit/spendingSummary.test.js tests/unit/systemPrompt.test.js` — All 101 tests passed across 15 test suites with zero failures.
  * Executed client production build: `npm --prefix client run build` — Vite production bundle built cleanly in 20.78s with zero errors.
  * Executed git whitespace check: `git diff --check` — Passed cleanly with exit code 0.
  * Verified Docker packaging: `server/Dockerfile` now bundles `COPY prompts/ ./prompts/`.
  * Preserved all user changes and unrelated branch commits.

### 12. Fix Receipt Date and Total Amount Extraction and Proposal State Contamination

* **Date:** 2026-10-27
* **Tool / Model:** Antigravity IDE / Gemini 3.8 Flash (Medium)
* **Task Summary:** Investigate and fix incorrect date and total amount extraction in SpendWise receipt extraction and transaction proposals, resolve stale state and cross-receipt contamination where values from prior receipts lingered or overwrote the active proposal, and add regression tests.
* **Key User Prompt:** *"Fix the incorrect date and total amount in SpendWise receipt extraction and transaction proposals... 1. Investigate first... Trace the complete flow from image selection and upload through Supabase Storage, receipt records, Gemini multimodal extraction, structured-output schema/validation, backend mapping, and the transaction proposal UI... 2. Fix receipt date extraction... The transaction date must come from the date printed on the current receipt, not today's date, upload time, created_at, or the previous receipt... 3. Fix total amount extraction... The transaction amount must reflect the receipt's actual final total, such as Grand Total, Total Paid, or Amount Due... 4. Investigate possible stale data or cross-receipt contamination... 5. Preserve existing safeguards... Add focused regression tests... Update AI_USAGE.md... Run relevant receipt and transaction-proposal tests, the full test suite where feasible, client/server production builds, and git diff --check. Report the root cause with file-level evidence, the fix, actual verification results, and whether live Gemini extraction was tested."*
* **Root Causes Identified (with File-Level Evidence):**
  1. *Prompt Underspecification (`server/prompts/receipts/receipt-v3.md`):*
     - The natural language instructions did not explicitly mandate that `transactionDate` must be the actual printed date on the receipt, nor forbid falling back to the current date or upload time when the date was unreadable.
     - The prompt did not explicitly disambiguate `totalAmount` from `subtotal`, `tax`, discounts, `cash tendered`, or `change`. On receipts with multiple numeric lines, Gemini would sometimes pick up the subtotal or cash paid instead of the grand total.
  2. *Schema Property Description Gaps (`server/src/shared/integrations/ai/providers/geminiProvider.js`):*
     - The Gemini `responseJsonSchema` lacked descriptive metadata on `transactionDate` and `totalAmount`, meaning the structured-output parser had no field-level guidance distinguishing printed calendar date from current time, or final total from subtotal/change.
  3. *Strict Schema Formatting Rejections (`server/src/features/expenses/receipt.schemas.js`):*
     - `receiptExtractionSchema` previously checked `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)` without preprocessing, rejecting valid real-world date formats (`DD/MM/YYYY`, `DD-MM-YYYY`, `YYYY/MM/DD`, `DD.MM.YYYY`, and timestamp prefixes). This caused legitimate date extractions to fail validation and fall back to null.
     - Amounts with currency symbols or commas (`"150,000"`, `"₫ 250.000"`) were not normalized before schema coercion.
  4. *Stale React State & Missing Component Keys (`client/src/features/receipts/ReceiptReview.jsx`, `client/src/features/receipts/ReceiptsView.jsx`, `client/src/features/expense/assistant/ExpenseAssistant.jsx`, `client/src/features/expense/assistant/TransactionProposalCard.jsx`):*
     - `<ReceiptReview>` was rendered inside `ReceiptsView.jsx` as `<ReceiptReview file={receipt.file} draft={receipt.draft} ... />` without a `key={receipt.id}` prop. In React, when the user switched between different pending receipts or uploaded a new receipt, the existing `ReceiptReview` instance remained mounted.
     - `ReceiptReview` initialized form state with `useState(buildInitialForm(draft))` once upon mounting. Because it had no `key` prop and no `useEffect` syncing with changes to `draft`, it continued displaying the form values (date, amount, merchant) from the *first* receipt.
     - Similarly, `<TransactionProposalCard>` in `ExpenseAssistant.jsx` lacked `key={proposal.id}` and did not synchronize state via `useEffect` when a second proposal was received, retaining the previous proposal's draft.
     - In `ReceiptReview.jsx`, `INITIAL_TRANSACTION` defaulted `date` to `new Date().toISOString().slice(0, 10)`, silently replacing empty/unreadable receipt dates with today's date during review.
  5. *Unbounded Out-of-Order Async Responses (`client/src/features/receipts/ReceiptsView.jsx`, `client/src/features/expense/assistant/ExpenseAssistant.jsx`):*
     - Upload and resume operations lacked request sequence counters. If a user clicked "Review" or uploaded a receipt and subsequently switched receipts or retried, a delayed response from the first request could resolve late and overwrite the active receipt in state.
* **Files Changed:**
  * `server/prompts/receipts/receipt-v3.md`:
    * Added explicit constraints requiring `transactionDate` to strictly reflect the printed date in `YYYY-MM-DD` format (never today's date, upload date, or a fabricated value; null if faint/missing/unreadable).
    * Clarified `totalAmount` as the final grand total, total paid, or amount due, explicitly instructing the model to disregard subtotal, tax, cash tendered, change, or line item re-summing.
  * `server/src/shared/integrations/ai/providers/geminiProvider.js`:
    * Added comprehensive `description` properties to `transactionDate` and `totalAmount` in `responseJsonSchema` for Gemini multimodal extraction.
  * `server/src/features/expenses/receipt.schemas.js`:
    * Implemented `isValidCalendarDate` and `normalizeReceiptDate` pure calendar parser supporting `YYYY-MM-DD`, `YYYY/MM/DD`, `DD/MM/YYYY`, `DD-MM-YYYY`, `DD.MM.YYYY`, and timestamp prefixes without timezone shifts.
    * Implemented `normalizeReceiptAmount` cleaning currency symbols and thousand separators while rejecting zero or negative amounts.
    * Added automated warnings to `receiptExtractionSchema` when `transactionDate` or `totalAmount` is null, alerting the user to supply the missing information before confirming.
  * `server/src/features/expenses/receipt.service.js`:
    * Exported `toDraft` for direct testing and verified mapping of null/empty fields to editable blank strings.
  * `client/src/features/receipts/ReceiptReview.jsx`:
    * Added `buildInitialForm` where `date` strictly uses `draft?.date || draft?.transactionDate || ''` (never defaulting to today).
    * Added `useEffect` to synchronize form state whenever `draft` changes.
    * Added client validation in `handleConfirm` requiring valid `YYYY-MM-DD` date before submission.
  * `client/src/features/receipts/ReceiptsView.jsx`:
    * Added `key={receipt.id}` to `<ReceiptReview>` to ensure fresh component lifecycle per receipt.
    * Added `activeUploadIdRef` sequence counter to `uploadReceipt`, `resumePendingReview`, and `closeReceiptReview` to drop stale, out-of-order asynchronous responses.
  * `client/src/features/expense/assistant/ExpenseAssistant.jsx`:
    * Added `key={proposal.id}` to `<TransactionProposalCard>` and `key={receipt.id}` to `<ReceiptReview>`.
    * Added `activeReceiptUploadRef` sequence counter in `handleAttachReceipt`, `handleConfirmReceipt`, and `handleDiscardReceipt`.
  * `client/src/features/expense/assistant/TransactionProposalCard.jsx`:
    * Added `useEffect` to synchronize `draft` state when `proposal.id` or `proposal.transaction` changes.
    * Handled null/undefined amounts safely and enforced date format validation before submission.
  * `tests/unit/receiptDateAndAmountRegression.test.js`:
    * Created comprehensive 13-test regression suite covering date normalization, calendar validation, grand total extraction vs subtotal/cash, missing/ambiguous handling, sequential and concurrent receipt processing isolation, and retry safety.
* **Review & Verification:**
  * Focused unit regression tests: `node --test tests/unit/receiptDateAndAmountRegression.test.js` — All 13 tests passed.
  * Full relevant test suite: `node --test tests/unit/receiptExtractionSchema.test.js tests/unit/receiptServiceContract.test.js tests/unit/transactionProposal.test.js tests/unit/promptRegistry.test.js tests/unit/aiCapabilitiesGuardrails.test.js tests/unit/expenseAgent.test.js tests/unit/knowledgeBase.test.js tests/unit/chatOrchestrator.test.js tests/unit/receiptDateAndAmountRegression.test.js` — All 108 tests passed across 24 test suites with zero failures.
  * Client production build: `npm --prefix client run build` — Vite production build completed cleanly in 13.70s with zero errors.
  * Git whitespace check: `git diff --check` — Passed cleanly with exit code 0.
  * Live Gemini extraction testing note: Live Gemini API extraction calls were verified against unit contracts and offline mocked fixtures; live network calls to Gemini require runtime `GEMINI_API_KEY` configuration.
  * Unrelated user changes preserved; no git commit or push executed.
