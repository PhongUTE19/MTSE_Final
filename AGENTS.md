# SpendWise — AI Agent Guidelines & Engineering Handbook (`AGENTS.md`)

> **Primary Audience:** AI coding assistants (Antigravity, Cursor, Copilot, Gemini CLI, Claude Code) and autonomous software engineering agents.  
> **Status:** Canonical repository-wide agent instructions.

---

## 1. Project Overview & Technology Stack

SpendWise is an intelligent expense tracking, multimodal receipt digitizer, and conversational AI assistant web application.

* **Frontend:** React 18 SPA (Vite 5/6), React Router 6, Tailwind CSS (v3.4.19) as the exclusive styling system with centralized design tokens in `client/tailwind.config.js` and `client/src/index.css`, and Node.js testing harness (JSDOM + custom ESM JSX loader).
* **Backend:** Node.js 20+ ESM, Express 4, Zod schema validation, Multer + Sharp image preprocessing, and token-bounded telemetry queue.
* **Database & Auth:** Supabase PostgreSQL with Row-Level Security (`auth.uid() = user_id`), GoTrue JWT authentication, and private Supabase Storage (`receipts` bucket).
* **AI Provider:** Google Gemini API (`@google/genai`) for multimodal receipt extraction, tool-calling financial assistant, and document embeddings.
* **Testing:** Pure Node.js test runner (`node:test`) and strict assertions (`node:assert/strict`).

---

## 2. Repository Directory Structure

```text
SpendWise/
├── README.md                           # Primary repository introduction
├── AGENTS.md                           # This agent instruction handbook
│
├── docs/
│   ├── academic/                       # Course deliverables & evaluation artifacts
│   │   ├── architecture.md             # Evaluator architecture overview
│   │   ├── user-stories.md             # M1 user stories & acceptance criteria
│   │   ├── ai-usage.md                 # AI tool usage & human review log
│   │   ├── adrs/                       # Academic ADRs (0001–0003)
│   │   ├── ai-data-flows/              # Source-traceable AI architecture & flows
│   │   └── ai-receipts/                # Multimodal scanner reports (VN)
│   │
│   └── engineering/                    # Canonical engineering documentation
│       ├── architecture.md             # Implemented 6-layer architecture reference
│       ├── api-reference.md            # Authoritative Express 4 REST & SSE API reference
│       ├── database-and-data-lifecycle.md # Local PostgreSQL baseline & IndexedDB boundary
│       ├── deployment-checklist.md     # Controlled Docker & Supabase migration checklist
│       ├── documentation-maintenance.md# Canonical documentation map & maintenance rules
│       ├── refactoring-plan.md         # Master refactoring backlog & tech tasks
│       ├── progress.md                 # Chronological verification log
│       ├── implementation-guidelines.md# Agent guidelines, invariants & bootstrap DDL
│       └── adrs/                       # Engineering ADRs (0001–0009)
│
├── client/                             # React 18 SPA frontend
│   └── src/
│       ├── index.css                   # Single global entry stylesheet (tokens, @tailwind, @layer base)
│       ├── app/                        # Shell, router, route guards, context providers
│       ├── primitives/                 # Atomic, feature-agnostic UI building blocks
│       ├── composites/                 # Reusable multi-primitive UI components (forms, overlays, transactions)
│       ├── features/                   # Self-contained domain modules (transaction, expenseAssistant, receipt, transactionDraft, etc.)
│       ├── layouts/                    # WorkspaceLayout, WorkspaceSidebar, ExpenseLayout
│       └── shared/                     # Utilities, hooks, services, shared/transactions (no standalone .css)
│
├── server/                             # Express ESM API backend
│   ├── prompts/                        # Versioned markdown system prompts
│   └── src/
│       ├── features/                   # transaction, expenseAssistant, receipt, transactionDraft, chatAssistant, aiUsage, etc.
│       ├── routes/                     # Admin and feature composite routers
│       └── shared/                     # Auth middleware, guardrails, error hierarchy
│
├── supabase/migrations/                # PostgreSQL schema & security-definer RPCs
└── tests/                              # Automated tests (tests/unit/, tests/integration/)
```

---

## 3. Architecture & Dependency Rules

### 3.1 Frontend Dependency Hierarchy
Imports in `client/src/` must strictly flow downward in a unidirectional manner:
`app` $\rightarrow$ `features` $\rightarrow$ `layouts` $\rightarrow$ `composites` $\rightarrow$ `primitives` $\rightarrow$ `shared`

* **Primitives (`primitives/`):** Pure building blocks (`Button`, `Card`, `Stack`, `TextInput`, `Text`). Primitives must never import from `composites/`, `features/`, or `layouts/`.
* **Composites (`composites/`):** Generic multi-primitive widgets (`FormField`, `Pagination`, `Alert`, `PushDrawer`, `OverlayDrawer`, `TransactionDraftReview`, `TransactionFields`). Composites must never import from `features/`.
* **Features (`features/`):** Domain modules (`auth`, `transaction`, `expenseAssistant`, `receipt`, `transactionDraft`, etc.). Cross-feature direct imports are strictly forbidden. Common logic belongs in `shared/` (e.g. `shared/transactions/`).

### 3.2 Backend Service Boundaries
* **Controllers:** Handle HTTP request extraction, validation delegation, and JSON response formatting.
* **Services:** Coordinate business domain logic, staging drafts, and AI provider invocations.
* **Repositories / DB Helpers:** Execute user-scoped PostgreSQL queries enforcing Row-Level Security (`user.token`).

---

## 4. Component & Coding Conventions

1. **Tailwind-Exclusive Styling & Token Standardization:** Tailwind CSS (`v3.4.19`) is the **exclusive** frontend styling system. All 19 legacy standalone `.css` files have been consolidated into `client/src/index.css` (defining `:root` design tokens, `@tailwind` directives, and `@layer base` defaults) and `client/tailwind.config.js`. Do **not** create or import standalone `.css` files in `client/src/`. Styling must consume centralized design tokens (colors, 4px/semantic spacing scale, typography, radii, shadows, z-index, layout dimensions, responsive screens).
2. **Controlled Variant APIs & ClassName Stripping:** Base Primitives (`primitives/`) and Composites (`composites/`) do **not** accept arbitrary `className` or `style` props. Strip them before rendering to native DOM nodes. Manage variations via explicit props (`variant`, `size`, `disabled`, `invalid`, `fullWidth`).
3. **Layout vs. Appearance Separation:** Primitives and Composites own their internal appearance (padding, colors, borders, focus rings). External spacing and layout must be handled by Layout Primitives (`Stack`, `Inline`, `Grid`, `Spacer`, `Divider`) or semantic container elements (`<header>`, `<section>`, `<form>`).
4. **Exceptional CSS Policy:** Pure Vanilla CSS is strictly disallowed for ordinary styling. Zero exceptions currently exist across the application. Runtime `style` props are permitted exclusively for dynamic data-driven values (e.g., `ChartBar.jsx` percentage widths and dynamic colors).
5. **Module & Export Conventions:** Use `export default` for React page/feature components and named exports for API modules, hooks, constants, utilities, schemas, and backend services/repositories; avoid mixed default+named exports in API/utility/feature modules. See [`docs/engineering/implementation-guidelines.md`](docs/engineering/implementation-guidelines.md) (Section 5) for full JavaScript, naming, import ordering, and barrel-file standards.
5. **PushDrawer vs. OverlayDrawer:**
   - Use `PushDrawer` for companion side panels (AI chat) that push page content and allow continued interaction with background controls.
   - Use `OverlayDrawer` for modal slide-overs (document inspection) that require `Backdrop`, scroll locking, and `Tab` focus trapping.
6. **Single-Currency VND Ledger Invariant:** `public.expense_transactions` stores amounts in **VND**. Non-VND receipts must never be silently converted; they require an explicit warning and user review before saving.
7. **UTC Calendar Date Validation:** Validate calendar dates with UTC round-trip verification to prevent rollover bugs (e.g. `2026-02-30` rolling over to `2026-03-02`).
8. **Unified Candidate Staging & Confirmation Idempotency:** Unconfirmed candidate transactions (from stateless receipt OCR `POST /api/receipt/upload` or AI assistant `propose_transaction` calls) stage browser-locally in user-scoped IndexedDB (`client/src/features/transactionDraft/draftStorage.js`). Confirmed receipt drafts commit atomically via `POST /api/receipt/confirm` (`confirm_staged_receipt_transaction` RPC, idempotent per `(user_id, draft_id)`), and assistant/manual drafts commit via `POST /api/transaction` (idempotent via `client_request_id`). Legacy `public.transaction_drafts` and `/api/transaction-drafts` are retired (`202611170011`).
9. **Safe Rejection & Receipt Retention:** Rejecting a local `TransactionDraft` removes/marks only the browser-local draft without deleting any already-confirmed `public.receipts` row or Supabase Storage object. Unconfirmed receipt image Blobs exist only in browser-local IndexedDB until explicit confirmation.

---

## 5. Mandatory Coding & Refactoring Constraints

* **Preserve Unrelated Changes:** Never discard, reset, or overwrite user modifications in the working tree.
* **No Unsolicited Git Commits or Pushes:** Never run `git commit` or `git push` unless explicitly asked by the user.
* **Preserve Applied RPCs & Migrations:** Never modify existing SQL files in `supabase/migrations/` or change PostgreSQL RPC signatures.
* **Stable REST API Contracts:** Preserve public endpoint paths, HTTP status codes, and JSON response envelope structures.
* **Strict Task Scoping:** Only touch source and test files relevant to the active assignment.

---

## 6. Verification Commands

Run only the necessary checks and report actual executed results:

```bash
# 1. Full automated test suite (backend + frontend, 719 tests across 209 suites)
npm test

# 2. Frontend production build compilation (~15s)
npm --prefix client run build

# 3. Targeted unit tests
node --test tests/unit/expenseAgent.test.js
node --test tests/unit/frontendStandardization.test.js
```

---

## 7. Task-to-Documentation Lookup Table

When assigned a specific task, consult the authoritative documentation below:

| Task Type | Primary Documentation to Consult |
| :--- | :--- |
| **General Repository Context** | `AGENTS.md`, root `README.md` |
| **Frontend Implementation & Styling** | [`docs/engineering/architecture.md`](docs/engineering/architecture.md) (Sections 3, 5, 7) |
| **Refactoring & Backlog Tasks** | [`docs/engineering/refactoring-plan.md`](docs/engineering/refactoring-plan.md) |
| **Verification & Progress History** | [`docs/engineering/progress.md`](docs/engineering/progress.md) |
| **Technical Invariants & Bootstrap DDL**| [`docs/engineering/implementation-guidelines.md`](docs/engineering/implementation-guidelines.md) |
| **Architecture Decision Records (ADRs)**| [`docs/engineering/adrs/`](docs/engineering/adrs/) |
| **Documentation Map & Maintenance** | [`docs/engineering/documentation-maintenance.md`](docs/engineering/documentation-maintenance.md) |
| **Academic Evaluation & SRS** | [`docs/academic/SRS/`](docs/academic/SRS/README.md), [`docs/academic/`](docs/academic/) (`architecture.md`, `user-stories.md`, `ai-usage.md`) |
| **Source-Level AI Data Flows** | [`docs/academic/ai-data-flows/`](docs/academic/ai-data-flows/) |

---

> [!TIP]
> **Discovery Note:** In addition to this `AGENTS.md` file, Antigravity IDE loads scoped rules from `.agents/rules/` (`project-basics.md`, `frontend.md`, `backend.md`, `ai-and-rag.md`) and reusable skills from `.agents/skills/`. Always verify that modifications adhere to both this handbook and workspace agent rules.
