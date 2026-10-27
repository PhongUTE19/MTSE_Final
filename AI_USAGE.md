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
