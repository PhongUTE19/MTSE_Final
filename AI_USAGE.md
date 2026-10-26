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
