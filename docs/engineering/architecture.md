# SpendWise — System Architecture & Engineering Reference

> **Status:** Canonical Architectural Reference (Post-Refactoring Consolidated)  
> **Related Documents:** [`docs/academic/architecture.md`](../academic/architecture.md), [`refactoring-plan.md`](./refactoring-plan.md), [`progress.md`](./progress.md), [`implementation-guidelines.md`](./implementation-guidelines.md), [`adrs/`](./adrs/), [`.agents/rules/project-basics.md`](../../.agents/rules/project-basics.md)

---

## 1. Overview & System Purpose

SpendWise is an intelligent expense tracking, receipt extraction, and financial analytics platform designed with strict architectural boundaries, automated AI pipelines, and enterprise-grade security.

### 1.1 Technology Stack

```mermaid
flowchart TD
    subgraph Client["Frontend Client (React 18 + Vite 5 SPA)"]
        UI["6-Layer Architecture: app, primitives, composites, features, layouts, shared"]
        CSS["Tailwind CSS (v3.4.19) Exclusive Styling + Centralized Tokens (index.css & tailwind.config.js)"]
        State["Context Providers (ConfirmProvider, ToastProvider, WorkspaceProvider) + Custom Hooks"]
    end

    subgraph Server["Backend API (Node.js + Express 4 ESM)"]
        Routes["Feature Routers & Route Handlers"]
        Services["Domain Services (Expenses, Receipts, Assistant, Analytics)"]
        Middleware["Auth Middleware, Validation (Zod), Rate Limiting, Error Handling"]
    end

    subgraph Supabase["Data & Security Layer (Supabase / PostgreSQL)"]
        DB["PostgreSQL (Tables, Views, Constraints)"]
        RLS["Row-Level Security Policies (Tenant Isolation)"]
        RPC["SECURITY DEFINER RPCs (Receipt Lifecycle Ownership)"]
        Storage["Storage Buckets (Private 'receipts' Bucket)"]
        Auth["GoTrue Auth (JWT Verification)"]
    end

    subgraph AI["AI Provider Integrations (Google Gemini)"]
        GeminiFlash["Gemini Multimodal (Receipt OCR & Field Extraction)"]
        GeminiAgent["Gemini Tool-Calling Agent (Search, Summarize, Expense Proposals)"]
        GeminiRAG["Gemini Grounded RAG (Hybrid Search with Xenova Embeddings)"]
    end

    Client -->|REST API with Bearer JWT| Server
    Client -->|Direct Session Auth / Refresh| Auth
    Server -->|User-Scoped Supabase Client| DB
    Server -->|Service Role RPC Execution| RPC
    Server -->|Signed URL Generation & Upload| Storage
    Server -->|Multimodal Extraction & Structured Output| AI
```

### 1.2 Core Architectural Invariants

1. **Strict 6-Layer Frontend Architecture:** The client code is structured into six strictly isolated layers: `app/`, `primitives/`, `composites/`, `features/`, `layouts/`, and `shared/`. Dependency flow is strictly unidirectional downwards.
2. **Single-Currency VND Ledger:** `public.expense_transactions` stores all currency amounts in **VND**. Non-VND receipts extracted by Gemini must never be silently converted or persisted; they trigger explicit human confirmation and mandatory currency conversion review before persisting.
3. **Immutable Applied RPC Contracts:** Applied PostgreSQL migrations in `supabase/migrations/` and RPC signatures (`create_receipt_upload`, `start_receipt_processing`, `server_complete_receipt_extraction`, `server_mark_receipt_failed`, `retry_receipt_processing`, `confirm_receipt_transaction`, `begin_receipt_delete`, `finalize_receipt_delete`, `authorize_receipt_preview`) remain immutable and secure.
4. **Stable REST API Contracts:** All public endpoints maintain backwards-compatible JSON response envelopes and standard HTTP status semantics.
5. **Private Storage & Time-Bound Previews:** Receipts are uploaded to a private Supabase Storage bucket with public access revoked. Previews require short-lived, signed URLs generated via PostgreSQL RPC authorization.
6. **Client-Side IndexedDB Drafts & Atomic Confirmation:** Unconfirmed candidate transactions (from stateless receipt OCR `POST /api/receipt/upload` and stateless assistant proposals) are staged locally per user in IndexedDB (`client/src/features/transactionDraft/draftStorage.js`). Confirmation commits atomically to `public.expense_transactions` (and `public.receipts` via `confirm_staged_receipt_transaction` for receipts). Legacy `public.transaction_drafts`, `public.receipt_extractions`, and `/api/transaction-draft` are retired in `202611170011_retire_legacy_drafts_and_extractions.sql` (static SQL reviewed; unexecuted against live DB).
7. **Safe Rejection & Receipt Retention:** Rejecting a transaction draft sets its status to `'rejected'`; it never deletes the source receipt record in `public.receipts` or the uploaded receipt image in Supabase Storage. Confirmation is atomic and idempotent.

---

## 2. Frontend Directory Structure

The frontend application under `client/src/` is organized into the following verified directory layout:

```text
client/src/
│
├── main.jsx                            # Application entry point (Vite bootstrap, DOM root mount)
├── index.css                           # Single global stylesheet entry point (tokens, @tailwind, @layer base)
│
├── app/                                # Application shell & orchestration
│   ├── App.jsx                         # Root router, global providers, and layout wiring
│   ├── guards/                         # Route security wrappers
│   │   ├── AuthenticatedRouteGuard.jsx # Enforces active Supabase session
│   │   └── AdminRouteGuard.jsx         # Enforces admin role access
│   └── providers/                      # Global UI context providers
│       ├── ConfirmProvider.jsx         # Promise-based confirmation dialog context
│       ├── ToastProvider.jsx           # Notification toast dispatch context
│       └── index.js                    # Barrel export
│
├── primitives/                         # Layer 1: Feature-agnostic atomic building blocks
│   ├── Backdrop.jsx                    # Dimmed modal backdrop primitive
│   ├── index.js                        # Barrel export
│   ├── buttons/                        # Button, IconButton
│   ├── cards/                          # Card, CardHeader, CardTitle, CardContent, CardFooter
│   ├── display/                        # Avatar, ChartBar, ColorIndicator, Icon, Icons, Logo
│   ├── feedback/                       # Spinner
│   ├── inputs/                         # TextInput, TextArea, Select, FileInput, PasswordInput
│   ├── labels/                         # Label, Badge, HelperText, ErrorText
│   ├── layout/                         # Stack, Inline, Grid, Spacer, Divider
│   ├── lists/                          # List, ListItem
│   ├── table/                          # Table, TableHead, TableBody, TableRow, TableCell, TableHeaderCell
│   └── typography/                     # Text, Link
│
├── composites/                         # Layer 2: Feature-agnostic multi-primitive components
│   ├── index.js                        # Barrel export
│   ├── dataDisplay/                    # EmptyState, SortableHeader, StatCard
│   ├── feedback/                       # Alert, HealthBadge, ToastContainer, ToastItem
│   ├── forms/                          # FormField (composes Label, HelperText, ErrorText)
│   ├── navigation/                     # Pagination (composes Button, Select, TextInput, Inline)
│   ├── overlays/                       # ConfirmDialog, OverlayDrawer, PushDrawer, Modal
│   ├── search/                         # SearchInput (composes TextInput, IconButton)
│   └── transactions/                   # TransactionFields, TransactionDraftReview (unified review card)
│
├── features/                           # Layer 3: Domain-specific feature modules
│   ├── admin/                          # Admin overview, user role management
│   ├── analytics/                      # AI telemetry dashboard, KPI cards, charts, query history
│   ├── auth/                           # Login, Registration, Password Reset, AuthContext
│   ├── categories/                     # Category reference and configuration (CategoriesView)
│   ├── chat/                           # Domain-agnostic AI conversation UI, PushDrawer, composer, history (Chatbot, useChat)
│   ├── documents/                      # Knowledge-base document CRUD, upload, and chunk inspector
│   ├── expense/                        # Personal Finance module: ExpensePage layout, Transaction ledger (TransactionView, TransactionTable, ManualEntry, TransactionDetails, ExpenseSummaryCards, expenseApi)
│   │   └── assistant/                  # Domain-specific AI Expense Assistant composing features/chat/ (ExpenseAssistant, ExpenseToolResult, expenseAssistantApi)
│   ├── home/                           # Landing showcase hero page (HomePage)
│   ├── knowledgeBase/                  # Knowledge base query tester, stats, vector index overview (KnowledgeBasePage)
│   ├── receipts/                       # Multimodal receipt scanning, OCR extraction review & retry (ScanReceiptView, useReceiptUpload, receiptsApi)
│   ├── systemPrompt/                   # Read-only Git-managed system prompt inspection
│   └── transactionDrafts/              # Transaction draft client service & hook (transactionDraftsApi, useTransactionDrafts)
│
├── layouts/                            # Layer 4: Structural layout shells
│   ├── WorkspaceLayout.jsx             # Authenticated workspace shell with sidebar, health polling, WorkspaceProvider, and content outlet
│   ├── WorkspaceSidebar.jsx            # Responsive navigation sidebar reading user & signout from WorkspaceContext
│   ├── sidebarConfig.js                # Navigation link registry, icons, and role requirements
│   └── index.js                        # Barrel export
│
└── shared/                             # Layer 5: Shared application-wide utilities & infrastructure
    ├── constants/                      # config.js, routes.js, messages.js, uiLabels.js
    ├── context/                        # WorkspaceContext.jsx (WorkspaceProvider, useWorkspace)
    ├── hooks/                          # useDrawer, usePagination, useSearch, useSort, useSession, useHealth, etc.
    ├── services/                       # apiClient.js, supabaseAuth.js, healthApi.js
    ├── transactions/                   # expenseConstants.js, expenseCategories.js, transactionFieldsUtils.js
    └── utils/                          # formatters.js, validation.js, collectionUtils.js, drawerFocus.js
```

---

## 3. Architectural Layers & Responsibilities

The SpendWise frontend is partitioned into six distinct layers with strict boundaries:

### 3.1 Layer 1: Primitives (`client/src/primitives/`)
- **Responsibility:** Atomic, reusable UI building blocks with no business domain logic.
- **Contract:**
  - Primitives own their internal appearance via Design Tokens and Tailwind classes.
  - **Zero Public `className` or `style`:** Primitives do not accept external styling escape hatches. They strip incoming `className` and `style` props to prevent styling leakage.
  - Visual variations are governed solely through explicit, typed `variant`, `size`, `invalid`, and layout props.
- **Categories:**
  - `Backdrop.jsx`: Dimmed modal backdrop primitive with fixed positioning, z-index token, and click dismissal handler.
  - `buttons/`: `Button` (variants: `primary`, `secondary`, `outline`, `ghost`, `danger`, `fab`, `sidebar`, `sidebar-active`, `sidebar-secondary`), `IconButton` (accessible icon button with mandatory aria-label).
  - `cards/`: `Card` (supports responsive padding scale including `xl: 'p-8 max-tablet:p-5 max-mobile:p-4'`), `CardHeader`, `CardTitle`, `CardContent`, `CardFooter`.
  - `display/`: `Avatar` (variants: `default`, `dark`, `brand`, `sidebar`), `ChartBar` (supports runtime percentage width/height and dynamic fill colors), `ColorIndicator`, `Icon`, `Icons` (custom SVGs), `Logo`.
  - `feedback/`: `Spinner` (loading indicator with size variants).
  - `inputs/`: `TextInput` (size variants `sm`, `md`, `lg`; trailing `endPadding` variants `none`, `sm`, `lg`), `TextArea` (size `sm`/`md`, resize `vertical`/`none`, `maxHeight` `none`/`composer`), `Select`, `FileInput`, `PasswordInput` (encapsulates eye toggle button with endPadding).
  - `labels/`: `Label` (accessible form label with required indicator), `Badge`, `HelperText`, `ErrorText`.
  - `layout/`: `Stack` (vertical flex), `Inline` (horizontal flex), `Grid` (CSS grid), `Spacer` (token-scale space), `Divider`.
  - `lists/`: `List`, `ListItem`.
  - `table/`: `Table` (variants: `default`, `compact`, `comfortable`), `TableHead`, `TableBody`, `TableRow`, `TableCell` (supports `truncate`, `mono`, `nowrap`), `TableHeaderCell`.
  - `typography/`: `Text` (polymorphic typography primitive; variants: `body`, `body-sm`, `secondary`, `caption`, `kicker`, `eyebrow`, `sidebar-eyebrow`, `heading`, `title`, `display`, etc.; semantic colors: `primary`, `secondary`, `muted`, `inverse`, `brand`, `sidebar`, `sidebar-muted`, etc.), `Link`.

### 3.2 Layer 2: Composites (`client/src/composites/`)
- **Responsibility:** Multi-primitive combinations that solve generic UI patterns without domain logic.
- **Contract:**
  - Composed entirely from Primitives.
  - Domain-agnostic and fully reusable across any feature.
- **Modules:**
  - `dataDisplay/`: `EmptyState` (standard zero-data UI), `SortableHeader`, `StatCard` (standard metric card, reused in `ExpenseSummaryCards`).
  - `feedback/`: `Alert` (callouts: `info`, `warning`, `error`, `success`), `HealthBadge` (system connection status indicator, promoted from `features/admin/`), `ToastContainer`, `ToastItem`.
  - `forms/`: `FormField` (composes `Stack`, `Label`, input slot, `HelperText`, `ErrorText`).
  - `navigation/`: `Pagination` (composes `Button`, `IconButton`, `Select`, `TextInput`, `Inline`, with `w-page-jump` scoped input width).
  - `overlays/`: `ConfirmDialog`, `OverlayDrawer` (composes `Backdrop`), `PushDrawer`, `Modal` (composes `Backdrop`).
  - `search/`: `SearchInput` (composes `TextInput` and clear `IconButton`).
  - `transactions/`: `TransactionFields` (feature-agnostic controlled inputs for transaction details: type, amount, date, category, merchant, note), `TransactionDraftReview` (unified candidate transaction review, validation, foreign currency warning, line item list, and confirm/reject card backed by controlled drafts, shared by `ScanReceiptView` and `ExpenseAssistant`).

### 3.3 Layer 3: Features (`client/src/features/`)
- **Responsibility:** Domain-specific business logic, views, forms, state management, and API calls.
- **Contract:**
  - Each feature folder is self-contained and exposes a public facade via `index.js`.
  - Features may compose Primitives, Composites, Layouts, and Shared utilities.
  - **No Cross-Feature Direct Imports:** A feature cannot directly import internal components or state from another feature. If logic is shared, it must be promoted to `shared/` or composed at the `app/` router level.
  - **Domain Boundaries & Core Responsibilities:**
    - **Transaction (`features/transaction/`):** Financial transaction ledger domain. Owns `TransactionPage.jsx`, manual transaction entry dialog (`ManualEntry.jsx`), detailed modal inspection (`TransactionDetails.jsx`), transaction ledger table (`TransactionTable.jsx`), overview summary metrics (`TransactionSummaryCards.jsx`), and dedicated ledger HTTP client (`transactionApi.js`). The `/expense/*` workspace route shell lives in `layouts/ExpenseLayout.jsx`.
    - **Receipt (`features/receipt/`):** Multimodal document ingestion domain. Owns receipt image uploads, extraction retry queue, and interactive draft review (`ScanReceiptPage.jsx`), upload lifecycle hooks (`useReceiptUpload.js`), and dedicated document API client (`receiptApi.js`).
    - **Transaction Draft (`features/transactionDraft/`):** User-scoped browser-local IndexedDB draft store (`draftStorage.js`, `draftController.js`, `previewUrlManager.js`, `useTransactionDrafts.js`). Manages unconfirmed receipt and assistant drafts locally and confirms them directly to `POST /api/receipt/confirm` or `POST /api/transaction` (with deterministic UUID idempotency). Legacy `transactionDraftApi.js` and `/api/transaction-draft` are retired.
    - **Chat (`features/chat/`):** Domain-agnostic conversation interface and drawer presentation system. Owns `Chatbot`, `ChatComposer`, `ChatMessageItem`, `ChatHistoryTab`, `useChat`, `chatController.js`, and `chatApi.js` (database-backed `/api/chat-history` persistence via `chat_conversations` and `chat_messages` with RLS in `202611170010_chat_history.sql`, plus lightweight user-scoped `localStorage` cache in `chatHistory.js`). Strictly separated from IndexedDB `TransactionDraft`s (`features/transactionDraft/`): historical `create_transaction` messages without a live local draft render read-only with explicit re-staging rather than auto-confirming. Contains zero expense-specific business logic.
    - **Expense Assistant (`features/expenseAssistant/`):** Domain-specific AI assistant implementation (Model A architecture). Composes generic `features/chat/` primitives (`Chatbot`, `useChat`) via inversion of control render slots (`renderToolResult`, `renderBeforeComposer`, `renderAttachmentAction`) to provide financial assistance, structured tool rendering (`ExpenseToolResult`), Human-in-the-Loop transaction draft reviews (`TransactionDraftReview`), in-drawer receipt extraction (`useReceiptUpload` + `TransactionDraftReview`), and workspace synchronization (`notifyTransactionsChanged`). Consumes canonical agent endpoints from `expenseAssistantApi.js` and draft actions injected from `app/App.jsx`.

#### 3.3.1 Domain Model Responsibilities & Entity Relationships

SpendWise separates **browser-local unconfirmed staging** (`TransactionDraft` in IndexedDB) from **authoritative PostgreSQL persistence** (`expense_transactions`, `receipts`, `chat_conversations`, `chat_messages`, and `ai_usage_analytics`):

```mermaid
erDiagram
    EXPENSE_TRANSACTIONS {
        uuid id PK
        uuid user_id FK
        text type "income | expense"
        numeric amount "amount in VND > 0"
        date transaction_date "UTC valid YYYY-MM-DD"
        text category
        text merchant
        text note
        jsonb items
        uuid client_request_id "idempotency key"
        timestamptz created_at
    }

    RECEIPTS {
        uuid id PK
        uuid user_id FK
        text status "uploaded|processing|review_required|confirmed|failed|deleting"
        uuid transaction_id FK "1:1 unique link when confirmed"
        text storage_path "private Supabase storage"
        text sha256 "file digest"
        jsonb extraction "normalized extraction snapshot"
        jsonb warnings
        text ai_model
        text prompt_version
        timestamptz confirmed_at
        timestamptz created_at
    }

    CHAT_CONVERSATIONS {
        uuid id PK
        uuid user_id FK
        text title "1..120 chars"
        timestamptz created_at
        timestamptz updated_at
    }

    CHAT_MESSAGES {
        uuid id PK
        uuid conversation_id FK
        uuid user_id FK
        text role "user | assistant"
        text content "non-empty when status=completed"
        text status "streaming | completed | aborted | failed"
        uuid reply_to FK "user message id for assistant attempt"
        uuid request_id "unique per (user_id, request_id)"
        text tool_name
        jsonb tool_result
        jsonb sources
        text error_message
        timestamptz completed_at
        timestamptz created_at
    }

    AI_USAGE_ANALYTICS {
        uuid id PK
        text endpoint
        text model
        text usage_source "provider_reported | derived | unavailable | unknown"
        int input_tokens
        int output_tokens
        int total_tokens
        numeric estimated_cost_usd
        timestamptz created_at
    }

    RECEIPTS ||--o| EXPENSE_TRANSACTIONS : "confirmed 1:1 link"
    CHAT_CONVERSATIONS ||--o{ CHAT_MESSAGES : "owns messages"
```

1. **Transaction (`public.expense_transactions`):**
   - The authoritative, committed financial ledger enforcing the **Single-Currency VND Ledger Invariant** (`amount > 0` in VND) and UTC calendar date validation.
   - Created directly via `ManualEntry` / confirmed assistant proposal (`POST /api/transaction` with `client_request_id` idempotency) or atomically with a receipt (`POST /api/receipt/confirm` $\rightarrow$ `confirm_staged_receipt_transaction` RPC).
2. **Receipt (`public.receipts`):**
   - Represents a **confirmed** receipt document linked 1:1 to `expense_transactions` via `transaction_id`, referencing private Supabase Storage (`<user_id>/<draft_id>/original`).
   - Legacy `public.transaction_drafts` and `public.receipt_extractions` were retired in `202611170011_retire_legacy_drafts_and_extractions.sql`.
3. **Browser-Local Transaction Draft (`client/src/features/transactionDraft/draftStorage.js`):**
   - Unconfirmed candidate transactions (from stateless `POST /api/receipt/upload` OCR or assistant `propose_transaction` tool calls) are staged locally per `userId` in browser IndexedDB (`spendwise_transaction_drafts`).
   - Temporary receipt image `Blob`s live only in IndexedDB until explicit confirmation; unconfirmed drafts are never persisted in PostgreSQL and do not synchronize across devices.
4. **Chat Conversations & Messages (`public.chat_conversations`, `public.chat_messages`):**
   - Server-authoritative chat history (`202611170010`, `202611170012`, `202611170013`) protected by RLS (`auth.uid() = user_id`) and ownership triggers.
   - Tracks `streaming`, `completed`, `aborted`, and `failed` assistant attempts with `(user_id, request_id)` idempotency.

#### 3.3.2 Manual Entry vs. Scan Receipt Separation

* **Manual Entry (`features/transaction/ManualEntry.jsx`):**
  - Dedicated non-AI modal dialog for direct bookkeeping (`POST /api/transaction`), validating required fields, positive VND amounts, and UTC calendar dates.
* **Scan Receipt (`features/receipt/ScanReceiptPage.jsx`):**
  - Multimodal document ingestion interface coordinating stateless OCR (`POST /api/receipt/upload`), browser-local IndexedDB draft staging (`useTransactionDrafts`), and `TransactionDraftReview` with receipt image Blob previews, itemized line items, foreign currency warnings, and explicit confirmation (`POST /api/receipt/confirm`) or local rejection.

#### 3.3.3 Chat vs. Expense Assistant Dependency Boundary

SpendWise maintains a strict decoupling between conversational UI and personal finance domain logic:
* **Generic Chat (`features/chat/`):**
  - 100% domain-agnostic slot-based chat UI (`Chatbot.jsx`, `ChatComposer.jsx`, `ChatMessageItem.jsx`, `useChat.js`, `sseParser.js`, `chatApi.js`).
  - Contains zero imports from `transaction`, `receipt`, or `transactionDraft`.
  - Exposes controlled inversion-of-control slots: `avatarIcon`, `quickActions`, `renderToolResult`, `renderBeforeComposer`, and `renderAttachmentAction`.
* **Expense Assistant (`features/expenseAssistant/`):**
  - Domain composition component (`ExpenseAssistant.jsx`) wrapping `Chatbot` and `useChat`.
  - Wired in `app/App.jsx` to canonical `POST /api/chat-assistant` (`sendChatMessage`) and `POST /api/chat-assistant/stream` (`sendChatMessageStream`).
  - Renders custom financial tool results (`ExpenseToolResult.jsx`) and embeds `TransactionDraftReview` for `propose_transaction` proposals.
  - Receives receipt upload methods (`useReceiptUpload`, `receiptApi`) and transaction draft handlers (`onConfirmDraft`, `onRejectDraft`, `onSaveDraft`) via props from `app/App.jsx`.
  - **Zero Cross-Feature Imports:** All cross-domain collaboration is wired at `app/App.jsx`.

#### 3.3.4 Shared Confirmation & Rejection Workflow

* **Receipt-Backed Drafts (`POST /api/receipt/confirm`):**
  1. Client submits reviewed fields and the local `receiptBlob` (`FormData`) with `draftId`.
  2. Server uploads the image to private Supabase Storage (`<user_id>/<draft_id>/original`) and invokes `confirm_staged_receipt_transaction` RPC (`202611170009`), which acquires a transaction-scoped advisory lock on `(user_id, draft_id)` and atomically inserts `public.expense_transactions` and `public.receipts` (`status = 'confirmed'`). Re-confirming the same payload returns `{ idempotent: true }` without creating duplicates.
* **Assistant Proposal Drafts (`POST /api/transaction`):**
  1. `propose_transaction` never writes to the DB; it returns a proposal payload that the frontend stages in IndexedDB.
  2. Explicit confirmation commits via `POST /api/transaction` with `client_request_id` idempotency. Historical `propose_transaction` messages reloaded from DB without a local IndexedDB draft render read-only with explicit re-staging.
* **Safe Rejection:**
  - Rejecting a local `TransactionDraft` discards/marks only the browser-local draft; already-confirmed `public.receipts` rows and Storage objects are never deleted on draft rejection.

### 3.4 Layer 4: Layouts (`client/src/layouts/`)
- **Responsibility:** Page-level structural layouts and shells that frame views.
- **Contract:**
  - `WorkspaceLayout.jsx` provides the master authenticated shell. It receives `{ user, onSignOut, onHealthError, overlays, children }` from its parent `AuthenticatedRouteGuard` (within `WorkspaceRouteShell`), instantiates `WorkspaceProvider` with health polling and user state, renders `HealthBadge` in a centralized header bar, and renders `<WorkspaceSidebar />` with zero props alongside main scrollable `<WorkspaceContent>` (`children ?? <Outlet />`).
  - `WorkspaceSidebar.jsx` reads `user` and `onSignOut` directly from `useWorkspace()` (with fallback to `signOut()` and duplicate-click guards), completely eliminating `sidebarProps` and `onSignOut` prop-drilling through page components.
  - Scoped layout structure and responsive behavior are authored strictly using Tailwind CSS utility classes consuming standardized layout tokens (`w-sidebar`, `pl-sidebar`, `max-w-workspace`) and breakpoint screens (`max-desktop`, `max-tablet`, `max-mobile`). No standalone `.css` files are used.

### 3.5 Layer 5: Shared (`client/src/shared/`)
- **Responsibility:** Application-wide singletons, infrastructure, utilities, context, and hooks.
- **Contract:**
  - `constants/`: Configuration flags, route paths (`APP_ROUTES`), UI labels, error messages.
  - `context/`: `WorkspaceContext.jsx` exposing `WorkspaceProvider` and `useWorkspace()` hook managing user identity, signout coordination, health state, and cross-view reactive refresh versions (`transactionsVersion`, `notifyTransactionsChanged`, `receiptsVersion`, `notifyReceiptsChanged`).
  - `hooks/`: Generic React hooks (`useDrawer`, `usePagination`, `useSearch`, `useSort`, `useSession`, `useChatScroll`, `useHealth`, `useReceiptUpload`).
  - `services/`: Network clients (`apiClient.js`), Supabase authentication adapter (`supabaseAuth.js`), health API.
  - `utils/`: Pure utility functions (`formatters.js`, `validation.js`, `collectionUtils.js`, `drawerFocus.js`, `overlayStack.js`).
  - *(Note: Legacy standalone `.css` files under `shared/styles/` have been eliminated; styling is centralized exclusively in `client/tailwind.config.js` and `client/src/index.css` per ADR-0005).*

### 3.6 Layer 6: App Orchestration (`client/src/app/`)
- **Responsibility:** Application root bootstrap, routing table, route security guards, and global context providers.
- **Contract:**
  - `App.jsx` mounts top-level providers (`ToastProvider`, `ConfirmProvider`), declares client routes, and attaches `AuthenticatedRouteGuard` and `AdminRouteGuard`.
  - Mounts `WorkspaceRouteShell` once as a persistent React Router layout route wrapping `/home`, `/expense/*`, `/admin/analytics`, and `/admin/knowledge-base`. It composes `AuthenticatedRouteGuard -> WorkspaceLayout + WorkspaceExpenseAssistant` overlay.
  - `AdminRouteGuard` inspects `useWorkspace().user` first when nested inside the Workspace shell to avoid redundant session polling on internal route transitions.

---

## 4. Dependency Rules & Boundaries

To prevent cyclical dependencies and maintain clear separation of concerns, the frontend enforces a strict unidirectional dependency hierarchy:

```mermaid
flowchart TD
    App["Layer 6: app/\n(App.jsx, guards, providers)"]
    Features["Layer 3: features/\n(auth, expense, receipts, admin, etc.)"]
    Layouts["Layer 4: layouts/\n(WorkspaceLayout, WorkspaceSidebar)"]
    Composites["Layer 2: composites/\n(FormField, Pagination, Alert, Drawers)"]
    Primitives["Layer 1: primitives/\n(Button, Card, Stack, TextInput, Text)"]
    Shared["Layer 5: shared/\n(hooks, services, utils, constants, styles)"]

    App --> Features
    App --> Layouts
    App --> Composites
    App --> Primitives
    App --> Shared

    Features --> Layouts
    Features --> Composites
    Features --> Primitives
    Features --> Shared

    Layouts --> Composites
    Layouts --> Primitives
    Layouts --> Shared

    Composites --> Primitives
    Composites --> Shared

    Primitives --> Shared
```

### 4.1 Prohibited Dependency Boundaries

| Forbidden Import Direction | Reason | Correct Alternative |
| :--- | :--- | :--- |
| `primitives/` $\rightarrow$ `composites/`, `features/`, `layouts/` | Primitives must remain atomic and uncoupled from composite structures or business logic. | Compose primitives inside composites or features. |
| `composites/` $\rightarrow$ `features/` | Composites must remain business-agnostic and universally reusable. | Place domain-specific combinations inside `features/<feature-name>/`. |
| `features/A/` $\rightarrow$ `features/B/` | Direct coupling between feature domains creates tight coupling and circular references. | Lift common models, hooks, or helpers into `shared/`, or coordinate at the `app/` level. |
| `shared/` $\rightarrow$ `primitives/`, `composites/`, `features/` | Infrastructure and pure utilities must not depend on UI rendering layers. | Pass components as callbacks, children, or parameters into shared utilities. |
| Primitives $\rightarrow$ Native Elements with arbitrary `className` | Prevents style leaking and visual regressions. | Use semantic `variant` props and Design Tokens. |

---

## 5. Component Architecture & Design Principles

### 5.1 Controlled Variant Prop API
Primitives and Composites do not expose arbitrary CSS class passthroughs. Instead, visual variants are modeled explicitly through semantic props mapped internally to Tailwind utility classes:

```jsx
// Correct: Intent-driven semantic variants mapped internally to Tailwind tokens
<Button variant="primary" size="md" disabled={isSubmitting}>
  Save Changes
</Button>

<Alert variant="error" title="Validation Failed">
  Please provide a valid VND amount.
</Alert>

// Prohibited: Arbitrary class leakage (stripped before rendering to DOM)
<Button className="my-custom-blue-button mt-4">Save</Button>
```

### 5.2 Layout vs. Appearance Separation
1. **Appearance Ownership:** Primitives own their internal padding, background colors, borders, typography, and focus outlines via Tailwind classes mapped internally.
2. **Layout Ownership:** External margins, spacing between elements, and positioning are governed exclusively by Layout Primitives (`Stack`, `Inline`, `Grid`, `Spacer`, `Divider`) or semantic container elements (`<header>`, `<section>`, `<form>`).

### 5.3 Drawer Architecture: PushDrawer vs. OverlayDrawer
SpendWise strictly distinguishes between two drawer patterns and prohibits unifying them into a single component with conditional mode props:

1. **`PushDrawer` (`composites/overlays/PushDrawer.jsx`):**
   - **Role:** Non-modal companion side panel that shares layout space and pushes main content.
   - **Usage:** Chatbot and AI Expense Assistant (`ExpenseAssistant`). Mounted persistently at the Workspace route shell level as a fixed non-flow overlay across all Workspace routes (`/home`, `/expense/*`, `/admin/*`).
   - **Behavior:** No backdrop, no body scroll locking, no focus trapping. Main page controls remain interactive while the drawer is open. The drawer preserves conversation, active proposal, and receipt drafting state across route transitions. Cross-view data updates trigger `notifyTransactionsChanged()` and `notifyReceiptsChanged()` in `WorkspaceContext`.
2. **`OverlayDrawer` (`composites/overlays/OverlayDrawer.jsx`):**
   - **Role:** Modal slide-over panel for focused workflows.
   - **Usage:** Knowledge Base document inspection (`/admin/knowledge-base`).
   - **Behavior:** Renders `Backdrop`, locks body scroll (`lockBodyScroll`), traps `Tab` focus, and dismisses on `Escape` or backdrop click.

### 5.4 Page Layout & Responsive Conventions
All primary feature views (`HomePage`, `ExpenseLayout`, `TransactionPage`, `ScanReceiptPage`, `CategoriesPage`, `AIUsagePage`, `KnowledgeBasePage`) adhere to standard page structure and responsive patterns:
1. **Structural Flow:** Every page follows a unified `FeaturePage -> PageHeader -> Stack` hierarchy for consistent vertical rhythm and heading hierarchy.
2. **Responsive Scrolling Priority:** Vertical page scrolling is prioritized across viewports. Tables (`TransactionTable`, `DocumentTable`, `AIUsageHistoryTable`) use local horizontal scroll containment (`Table responsive` / `overflow-x-auto`).
3. **Toolbar Wrapping:** Toolbars, action groups, filter rows, and pagination headers compose `Inline` with explicit `wrap` and `justify="between"` to prevent clipping or viewport overflow on narrow screens.
4. **Scoping and Density:** `Pagination` uses scoped jump input widths (`w-page-jump`). `ReceiptReview` supports `compact` mode with constrained image previews (`max-h-96 object-contain`) when rendered inside the `ExpenseAssistant` drawer.
5. **Feature vs. Shared Boundary:** Shared widgets live in `primitives/` and `composites/` (`StatCard`, `HealthBadge`). Feature-specific stylistic configurations (e.g. `BUBBLE_BASE_CLASSES`, `INLINE_CODE_CLASSES` in chat, and `ChartLoadingState` in analytics) remain encapsulated within their feature modules.

### 5.5 Exceptional CSS Policy
SpendWise strictly enforces a **Tailwind-only** styling policy for all ordinary component, layout, and feature styling:
1. **Zero Standalone CSS Files:** No standalone `.css` files may be created in `client/src/`. All styles are authored as Tailwind utility classes consuming centralized design tokens.
2. **Architectural Approval Gate:** Pure Vanilla CSS rules are permitted only for complex visual effects that are technically impossible or prohibitively convoluted in Tailwind CSS, subject to explicit architectural approval.
3. **Current Exception Count:** Currently, **zero** Vanilla CSS exceptions exist across the codebase.
4. **Data-Driven Inline Styles:** Dynamic inline `style` attributes are permitted exclusively for runtime-calculated, data-driven values (e.g., `ChartBar.jsx` calculating width/height percentage and dynamic `fillColor`). Consumer-supplied `style` props on Primitives and Composites are strictly stripped.

---

## 6. Application Composition & Data Flow

### 6.1 Bootstrap Lifecycle
1. **HTML Mounting (`client/index.html`):** Loads viewport metadata, fonts, and script entry `client/src/main.jsx`.
2. **DOM Bootstrap (`client/src/main.jsx`):** Wraps `<App />` in React 18 `createRoot` and mounts to `#root`.
3. **App Initialization (`client/src/app/App.jsx`):**
   - Configures `BrowserRouter`.
   - Mounts global providers: `ToastProvider` and `ConfirmProvider`.
   - Resolves routing tree with `AuthenticatedRouteGuard` and `AdminRouteGuard`.

### 6.2 Authentication Lifecycle (Supabase GoTrue)
1. **Session Check:** On initial load, `useSession()` queries `supabaseAuth.getSession()`.
2. **Token Refresh:** Supabase GoTrue manages automatic background token refreshes via local storage and web storage events.
3. **Route Guards:**
   - Unauthenticated users attempting to access `/expense`, `/receipts`, or `/admin/*` are redirected to `/login` via `AuthenticatedRouteGuard`.
   - Authenticated non-admin users attempting to access `/admin/*` are redirected to `/expense` via `AdminRouteGuard`.
4. **API Requests:** `apiClient.js` automatically attaches the active Supabase JWT to the `Authorization: Bearer <token>` header for all authenticated backend requests.

### 6.3 End-to-End Execution Sequence: Receipt-to-Transaction Flow

```mermaid
sequenceDiagram
    actor User
    participant View as ScanReceiptPage / TransactionDraftReview
    participant Hook as useReceiptUpload / useTransactionDrafts
    participant IDB as IndexedDB (draftStorage.js)
    participant Server as Express Server (receipt.service)
    participant Gemini as Gemini AI (Vision OCR)
    participant DB as Supabase Storage & PostgreSQL

    User->>View: Select receipt image (JPEG/PNG/WebP <= 5MB)
    View->>Hook: uploadReceipt(file)
    Hook->>Server: POST /api/receipt/upload (FormData, stateless)
    Server->>Gemini: Multimodal extraction with receipt-v3.md prompt
    Gemini-->>Server: Structured JSON (merchant, date, amount, items, currency)
    Server-->>Hook: 200 OK { extraction, warnings, ai_model, prompt_version }
    Hook->>IDB: Stage local draft (draftId, userId, fields, receiptBlob)
    IDB-->>View: Render TransactionDraftReview + Blob preview
    Note over View, User: If currency != 'VND', display warning banner.<br/>User reviews, corrects fields, and submits.
    User->>View: Click Confirm and save transaction
    View->>Server: POST /api/receipt/confirm (FormData: draftId, fields, receiptBlob)
    Server->>DB: Upload image to private 'receipts' bucket (<uid>/<draftId>/original)
    Server->>DB: RPC confirm_staged_receipt_transaction (advisory lock + insert tx & receipt)
    Server-->>View: 200 OK { receipt, transaction, idempotent }
    View->>IDB: Remove confirmed local draft
    Note over View, User: If user clicks Reject:<br/>Local IndexedDB draft is removed/rejected; no DB receipt was created.
```

### 6.4 Unified AI Assistant, SSE Streaming & Server-Authoritative Persistence Flow

```mermaid
sequenceDiagram
    actor User
    participant Chat as Chatbot / ExpenseAssistant
    participant IDB as IndexedDB (draftStorage.js)
    participant Server as chatAssistant (Orchestrator, Policy, Tools)
    participant Gemini as Gemini Provider (Tool Loop + Stream)
    participant DB as Supabase PostgreSQL (chat_conversations / chat_messages)

    User->>Chat: Send message (with optional AbortController)
    Chat->>Server: POST /api/chat-assistant/stream { conversationId, message, requestId }
    Server->>DB: RPC begin_chat_stream_turn (own conv + user msg + 'streaming' attempt)
    Server->>DB: Load server-authoritative history (completed non-empty turns only)
    Server->>Server: assistantPolicy (prompt-injection check + scope + tool allowlist)
    Server->>Server: emit SSE 'meta' { conversationId, userMessageId, assistantMessageId, requestId }
    loop Bounded Tool Loop (MAX_ROUNDS=4, MAX_TOOL_CALLS=6)
        Server->>Gemini: generateToolTurnStream(..., signal)
        alt Tool Call(s)
            Server->>Server: Execute allowed tools (search_knowledge_base, search_transactions, get_spending_summary, propose_transaction)
            opt propose_transaction
                Server-->>Chat: emit SSE 'proposal' (uncommitted proposal payload)
                Chat->>IDB: Stage browser-local TransactionDraft
            end
        else Final Text Tokens
            Gemini-->>Server: Text delta chunks
            Server-->>Chat: emit SSE 'delta' { text }
            Server->>DB: Periodic partial-content checkpoint (status='streaming')
        end
    end
    Server->>Server: assistantResponse (citation validation [S#] + sanitization)
    Server->>DB: Finalize assistant row (status='completed', sources, tool_result)
    Server-->>Chat: emit SSE 'sources' + 'done'
    Note over Chat, Server: On client AbortController abort / res close:<br/>Provider AbortSignal fires; partial text is finalized as status='aborted'.<br/>On provider error: status='failed', emit SSE 'error'.
```

### 6.5 Workspace Shell & Expense Routing Architecture

#### Workspace Route Shell Boundary
The application structures authenticated views inside a persistent layout route (`WorkspaceRouteShell` in `App.jsx`):
1. **Single Mount:** `WorkspaceRouteShell` is mounted once and wraps all authenticated workspace subroutes (`/home`, `/expense/*`, `/admin/ai-usage`, `/admin/knowledge-base`).
2. **Layout & Overlay Coordination:** It renders `AuthenticatedRouteGuard`, which obtains the authenticated `user` session and `onSignOut` handler and passes them to `WorkspaceLayout` alongside `WorkspaceExpenseAssistant` attached via the `overlays` prop.
3. **Workspace Context:** `WorkspaceLayout` encapsulates `WorkspaceProvider` to provide `user`, `onSignOut`, system health polling (`useHealth()`), and reactive notification counters (`transactionsVersion`, `notifyTransactionsChanged`, `receiptsVersion`, `notifyReceiptsChanged`).
4. **Overlay Persistence:** Mounting `WorkspaceExpenseAssistant` at the shell level allows the assistant drawer to remain open across navigation without tearing down conversation or proposal state.

#### Nested Expense Route Structure
The expense domain employs dedicated nested routing under `/expense/*`:
- `/expense` (Index): `ExpenseIndexRedirect` routes users to `/expense/transactions` (or respects `location.state.view`).
- `/expense/transactions`: `TransactionPage.jsx` coordinates transaction listing, search/filter controls, overview summary metrics (`TransactionSummaryCards`), manual transaction entry dialog (`ManualEntry.jsx`), and detailed modal inspection with receipt preview (`TransactionDetails.jsx`).
- `/expense/receipts`: `WorkspaceScanReceipt` / `ScanReceiptPage.jsx` coordinates stateless receipt uploads, browser-local IndexedDB drafts, and interactive draft review/confirmation using `TransactionDraftReview`. Navigation label in `sidebarConfig.js` is **"Scan Receipt"**.
- `/expense/categories`: `CategoriesPage.jsx` displays expense categorization rules.
- **Layout Outlet:** `ExpenseLayout.jsx` provides the persistent header and layout frame for `/expense/*` subroutes.

### 6.6 Canonical API Surface & Phase 2 Persistence Boundaries

All protected endpoints require Supabase JWT authentication (`authenticate` middleware) and enforce role authorization (`authorize('user')` or `authorize('admin')`):

| Surface | Canonical Endpoints | Persistence & Security Boundary |
| :--- | :--- | :--- |
| **Unified AI Assistant** | `POST /api/chat-assistant`, `POST /api/chat-assistant/stream` | `user`-only; server-authoritative history; SSE streaming (`meta`, `delta`, `proposal`, `sources`, `done`, `error`); `/api/expense-assistant` retained as JSON compatibility facade |
| **Chat History** | `GET/POST/PATCH/DELETE /api/chat-history/*` | `user`-only; `chat_conversations` & `chat_messages` with RLS (`auth.uid() = user_id`) |
| **Transactions** | `GET/POST/DELETE /api/transaction*`, `GET /api/transactions/summary` | `user`-only; `expense_transactions` with RLS; `POST /api/transaction` idempotent via `client_request_id` |
| **Receipts** | `POST /api/receipt/upload`, `POST /api/receipt/confirm`, `GET /api/receipt`, `GET /api/receipt/:id/preview` | `user`-only; `/upload` is stateless OCR; `/confirm` uploads to private Storage and executes `confirm_staged_receipt_transaction` RPC |
| **Admin** | `GET /api/admin/ai-usage/*`, `GET/POST /api/admin/knowledge-base/*`, `GET /api/admin/document/*`, `GET /api/admin/system-prompt` | `admin`-only (`app_metadata.role = 'admin'`); system prompt and documents are read-only at runtime |
| **Retired** | `/api/transaction-draft*`, `/api/receipts/:id/confirm`, `/api/expense-agent/proposals/*` | Removed in Phase 2 (`202611170011_retire_legacy_drafts_and_extractions.sql`) |

---

## 7. Styling Architecture & Design Tokens

Per ADR-0005 (`FE-REF-11`), SpendWise utilizes **Tailwind CSS (`v3.4.19`) as the exclusive styling system** across the client application. All 19 legacy standalone Vanilla CSS stylesheets have been eliminated, consolidating the styling architecture into a single global entry point (`client/src/index.css`) and centralized configuration (`client/tailwind.config.js`).

### 7.1 Single Entry Point (`client/src/index.css`)

`client/src/index.css` is the sole stylesheet in the frontend application. It contains three distinct layers:

1. **Runtime CSS Custom Properties (`:root`):**
   Per the token cleanup in `FE-FIX-12E`, `client/tailwind.config.js` is the canonical source of truth for all utility scales (colors, spacing, typography, sizing, borders, shadows, z-index, animations). The `:root` block in `client/src/index.css` is streamlined to define strictly the 6 runtime CSS custom properties needed for baseline defaults and runtime SVG rendering:
   - Baseline defaults consumed by `@layer base`: `--font-family-sans`, `--color-bg-page`, `--color-text-primary`, `--line-height-normal`.
   - Runtime SVG dynamic rendering in `AnalyticsCharts.jsx`: `--color-slate-200`, `--color-slate-500`.
   This optimization reduced compiled `index.css` from 51.24 kB to 39.94 kB.
2. **Tailwind Directives:**
   ```css
   @tailwind base;
   @tailwind components;
   @tailwind utilities;
   ```
3. **`@layer base` Resets & Defaults:** Global CSS resets (box-sizing, 0 margins/paddings), `#root` full-height constraints, and baseline body typography and background.

### 7.2 Centralized Design Token System (`client/tailwind.config.js`)

All visual tokens are defined and mapped in `client/tailwind.config.js` to enable first-class Tailwind utility consumption:

#### 1. Color System
- **`brand`:** `DEFAULT` (`#09090b`), `hover` (`#27272a`), `light` (`#bae6fd`).
- **`surface`:** `DEFAULT` (`#ffffff`), `subtle` (`#f8fafc`), `muted` (`#f1f5f9`), `hover` (`#e2e8f0`), `glass` (`rgba(255, 255, 255, 0.72)`).
- **`content`:** `primary` (`#0f172a`), `secondary` (`#334155`), `muted` (`#64748b`), `inverse` (`#ffffff`).
- **`border`:** `DEFAULT` (`#e2e8f0`), `hover` (`#64748b`), `glass` (`rgba(255, 255, 255, 0.8)`).
- **`status`:** `success`, `danger` / `error`, `warning`, `info` (each with `DEFAULT`, `bg`, `border`, `text`, `accent`).
- **`domain`:** `income` (emerald green scale) and `expense` (red scale).
- **`sidebar`:** `DEFAULT` (`#09090b`), `surface` (`rgba(9, 9, 11, 0.88)`), `fg` (`#ffffff`), `muted` (`#cbd5e1`), `active` (`rgba(255, 255, 255, 0.16)`), `hover` (`rgba(255, 255, 255, 0.1)`), `border` (`rgba(255, 255, 255, 0.22)`), `avatar` (`rgba(255, 255, 255, 0.2)`).
- **`overlay`:** `DEFAULT` (`rgba(15, 23, 42, 0.5)`), `blur` (`rgba(15, 23, 42, 0.4)`), `dark` (`rgba(0, 0, 0, 0.7)`).

#### 2. Spacing Scale
- **Numeric 4px Grid:** `0` (0px), `0.5` (2px), `1` (4px), `1.5` (6px), `2` (8px), `2.5` (10px), `3` (12px), `3.5` (14px), `4` (16px), `5` (20px), `6` (24px), `7` (28px), `8` (32px), `10` (40px), `12` (48px), `14` (56px).
- **Semantic Spacing Tokens:** `none` (0px), `2xs` (2px), `xs` (4px), `sm` (8px), `md` (16px), `lg` (24px), `xl` (32px), `2xl` (48px).

#### 3. Typography Scale
- **`fontFamily`:** `sans` (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, ...`), `mono` (`ui-monospace, SFMono-Regular, Menlo, Monaco, ...`).
- **`fontSize`:** `2xs` (0.625rem / 1.2), `xs` (0.75rem / 1.4), `sm` (0.875rem / 1.5), `base` (0.9375rem / 1.5), `lg` (1.125rem / 1.25), `xl` (1.5rem / 1.2), `2xl` (1.875rem / 1.15 / -0.025em), `display` (`clamp(2.25rem, 4vw, 4rem)` / 1 / -0.06em).
- **`fontWeight`:** `normal` (400), `medium` (500), `semibold` (600), `bold` (700).
- **`lineHeight`:** `none` (1), `tight` (1.2), `snug` (1.25), `normal` (1.5), `relaxed` (1.6).
- **`letterSpacing`:** `tighter` (-0.06em), `tight` (-0.025em), `normal` (0em), `wide` (0.05em), `wider` (0.09em).

#### 4. Radii & Shadows
- **`borderRadius`:** `sm` (4px), `md` (6px), `lg` (8px), `xl` (12px), `full` (9999px).
- **`boxShadow`:** `card`, `card-hover`, `button-hover`, `modal`, `drawer`, `push-drawer`, `sidebar`, `toast`, `fab`, `focus`, `focus-danger`.

#### 5. Z-Index Scale
- `sidebar`: `5` (fixed workspace navigation).
- `assistant`: `20` (floating desktop chat launcher).
- `mobile-assistant`: `100` (open desktop assistant container / mobile chat sheet).
- `mobile-drawer`: `101` (mobile drawer navigation overlay).
- `modal`: `1000` (modal dialog content).
- `backdrop`: `1000` (modal background dimmer).
- `drawer`: `1001` (modal OverlayDrawer content).
- `toast`: `2000` (application notifications).

#### 6. Layout Dimensions & Responsive Screens
- **Widths / Max-Widths:** `sidebar` (280px), `sidebar-compact` (178px), `push-drawer` (410px), `push-drawer-max` (`min(760px, 100vw)`), `drawer` (720px), `workspace` (1340px), `modal-sm` (400px), `modal-md` (520px), `modal-lg` (620px), `modal-xl` (760px).
- **Responsive Screens:** `xs: 420px`, `mobile: 540px`, `tablet: 840px`, `desktop: 1120px`.

### 7.3 Component ClassName Stripping & Variant Encapsulation
Primitives and Composites encapsulate their Tailwind utility classes internally:
- All external `className` and `style` props passed to Primitives or Composites are stripped before rendering.
- Appearance is altered strictly through controlled props (`variant`, `size`, `disabled`, `invalid`, `fullWidth`).
- Layout primitives (`Stack`, `Inline`, `Grid`, `Spacer`, `Divider`) handle external layout and arrangement.

### 7.4 Exceptional CSS Policy
SpendWise strictly enforces a **zero standalone CSS** policy:
1. No `.css` files may be introduced in `client/src/` outside `client/src/index.css`.
2. Pure Vanilla CSS is prohibited for ordinary styling (currently **0 exceptions** across the entire project).
3. Dynamic runtime inline styles (`style={{ ... }}`) are permitted exclusively for dynamic data-driven values calculated at runtime (e.g. `ChartBar.jsx` percentage widths/heights and dynamic colors).

---

## 8. State & Provider Architecture

### 8.1 State Management Taxonomy

| State Type | Scope | Management Mechanism | Examples |
| :--- | :--- | :--- | :--- |
| **Global UI State** | Application-wide | React Context Providers in `app/providers/` and `shared/context/` | `ConfirmProvider` (dialog prompt), `ToastProvider` (notification queue), `WorkspaceProvider` (health, counters, user) |
| **Authentication State** | Application-wide | Supabase GoTrue Auth client via `useSession` / `useWorkspace` | Active user, session tokens, role claims |
| **Domain Data State** | Feature-level | Custom hooks with React `useState` & `useEffect` | `useReceiptUpload`, `useTransactions`, `useDocuments`, `useAnalytics` |
| **Transient UI State** | Component-level | React `useState` / `useReducer` | Form input values, dropdown open state, active modal |

### 8.2 Provider Details & Shared Toast Convention
- **Shared Toast Convention (`ToastProvider`):** Mounted once at root `App.jsx` with `<ToastContainer>`. Feature views (`KnowledgeBasePage`, `AnalyticsPage`/`useAnalytics`, `TransactionView`, `ReceiptsView`) and Workspace health transition errors consume `useToast()` (`toast.success`, `toast.error`, `toast.warning`, `toast.info`). Form-specific validation errors remain displayed inline via `FormField` (`ErrorText`) or local `Alert` callouts, eliminating duplicate error banners.
- **`ConfirmProvider`:** Exposes a promise-based `confirm({ title, message, confirmText, cancelText, variant })` API via `useConfirm()`. Resolves `true` when confirmed and `false` when cancelled or dismissed via `Escape`.
- **`WorkspaceProvider`:** Re-exported through `app/providers/index.js` and mounted in `WorkspaceLayout`. Exposes `useWorkspace()` across all workspace pages.

---

## 9. Testing Architecture & Test Execution

SpendWise uses a pure, fast, dependency-lean testing architecture built directly on the Node.js native test runner (`node:test`) and Node.js assertion library (`node:assert/strict`).

### 9.1 Testing Harness Configuration

```mermaid
flowchart LR
    TestFiles["Unit & Integration Tests\n(tests/unit/*.test.js)"]
    JSXLoader["JSX Loader Hook\n(tests/setup/jsx-loader.js)\nTransforms JSX -> React.createElement"]
    JSDOM["JSDOM Setup\n(tests/setup/jsdom-environment.js)\nSimulates window, document, DOM APIs"]
    RTL["@testing-library/react\nBehavioral rendering, fireEvent, screen"]
    Runner["Node.js Test Runner\n(node --test --import jsx-loader.js)"]

    TestFiles --> Runner
    Runner --> JSXLoader
    Runner --> JSDOM
    Runner --> RTL
```

### 9.2 Key Testing Invariants & Test Suite Consolidation
1. **Consolidated, Offline Suite:** The automated test suite contains 719 passing tests across 209 suites (`node --test "tests/**/*.test.js"`), running offline with mocked external services. Obsolete and implementation-detail refactor test files were removed or merged into canonical long-lived suites (`frontendStandardization.test.js` and `drawerAccessibility.test.js`).
2. **Behavioral Testing over Source Regex:** Tests interact with components through user events and assert on DOM output and accessibility attributes, rather than inspecting raw source files with filesystem regexes.
3. **Simulated JSDOM Environment:** `tests/setup/jsdom-environment.js` configures browser globals (`window`, `document`, `navigator`, `localStorage`, `HTMLElement`, `CustomEvent`) allowing true React component rendering.
4. **Zero Babel/Webpack Test Overhead:** Custom ESM loader `tests/setup/jsx-loader.js` compiles JSX syntax on the fly without heavy transpiler build steps.

---

## 10. Development & Build Commands

All primary development, testing, and production build workflows are managed via standard npm scripts:

| Command | Purpose | Output / Verification |
| :--- | :--- | :--- |
| `npm test` | Runs the full backend and frontend automated test suite (719 tests across 209 suites). | All unit and integration test assertions pass. |
| `npm --prefix client run build` | Executes Vite production bundle compilation. | Produces optimized assets in `client/dist/` with zero build errors. |
| `npm --prefix client run dev` | Starts Vite local development server. | Spawns SPA dev server with HMR at `http://localhost:5173`. |
| `npm run dev` | Runs Express server (`:3000`) and Vite client (`:5173`) concurrently. | Starts fullstack local development environment. |

---

## 11. Architectural Constraints & Evolution Guidelines

Future contributors and automated agents must adhere to the following rules when extending SpendWise:

### 11.1 Adding a New Primitive
1. Create primitive file in `client/src/primitives/<category>/<PrimitiveName>.jsx`.
2. Do **not** accept `className` or `style` props. Strip them explicitly before passing attributes to native DOM elements.
3. Use controlled variant and size props mapped to Tailwind utility classes or Design Tokens.
4. Export the primitive from `client/src/primitives/<category>/index.js` and `client/src/primitives/index.js`.
5. Add behavioral unit tests verifying variant mappings, accessibility attributes, and element semantics.

### 11.2 Adding a New Composite
1. Create composite file in `client/src/composites/<category>/<CompositeName>.jsx`.
2. Compose strictly from existing Primitives (`Stack`, `Inline`, `Button`, `Card`, `Text`, etc.).
3. Keep the component business-agnostic. Do not import from `features/` or call domain-specific APIs.
4. Export from `client/src/composites/<category>/index.js` and `client/src/composites/index.js`.

### 11.3 Adding a New Feature or Page
1. Create feature directory in `client/src/features/<featureName>/`.
2. Keep all domain-specific UI, forms, and hooks local to the feature directory.
3. If the feature requires backend communication, define an API helper using `shared/services/apiClient.js`.
4. Register the route in `shared/constants/routes.js` and mount it within `app/App.jsx`.
5. Wrap protected routes with `AuthenticatedRouteGuard` or `AdminRouteGuard`.
6. If adding to workspace navigation, register the entry in `layouts/sidebarConfig.js`.

### 11.4 Styling Policy
1. Do not introduce standalone `.css` files anywhere in `client/src/`. All component, layout, and feature styling must use Tailwind CSS utility classes.
2. Consume centralized design tokens configured in `client/tailwind.config.js` and `client/src/index.css`.
3. Do not pass arbitrary `className` or `style` props to Base Primitives or Composites (they will be stripped). Use explicit semantic props (`variant`, `size`, `invalid`, `disabled`, `fullWidth`).
4. External margins and spacing must be governed exclusively by Layout Primitives (`Stack`, `Inline`, `Grid`, `Spacer`, `Divider`) or semantic layout containers (`<header>`, `<section>`, `<form>`).
5. Follow the Exceptional CSS Policy: Vanilla CSS is disallowed for ordinary styling (currently zero exceptions exist); dynamic inline styles are restricted strictly to runtime-calculated data values (such as `ChartBar.jsx` percentage dimensions).

---

## 12. Known Limitations & Verification Status

### 12.1 Verification Actually Performed (Offline)
1. **Full Automated Test Suite:** `npm test` passed **719/719 tests across 209 suites** (`0` failed, `0` skipped) using mocked external services.
2. **Frontend Production Build:** `npm --prefix client run build` executed cleanly with exit code `0` (`vite v6.4.4`, `269` modules transformed).

### 12.2 Known Limitations & Unapplied Remote Migrations
1. **Local-Only Phase 2 Migrations:** Migrations `202611170009` through `202611170014` are marked `LOCAL ONLY` in `supabase/migrations/` and have not been applied to a live remote Supabase instance during offline verification.
2. **`cachedTokens` Persistence Limitation:** `cachedTokens` is captured in-memory during provider usage normalization (`telemetry.js` / `usageTracker.js`), but `public.ai_usage_analytics` does not currently have a `cached_tokens` column, so `cachedTokens` is not persisted to PostgreSQL.
3. **Browser-Local Draft Synchronization:** Unconfirmed `TransactionDraft`s (and temporary receipt `Blob`s) live in browser IndexedDB (`spendwise_transaction_drafts`) and do not synchronize across devices until confirmed.
4. **No Live Cloud E2E in Offline Runs:** End-to-end tests against live Supabase Auth/DB, live Qdrant Cloud, and live Gemini API require valid credentials and are separate from offline `npm test`.

---

> [!NOTE]
> For historical audits, baseline reports, and pre-refactoring component inventories, see [`docs/engineering/audits/`](./audits/).

---

## 13. Provider-Agnostic AI, Operational Database & Vector Store Architecture

SpendWise separates **application business logic** from **external SDKs and infrastructure providers** across three independent pillars:

```mermaid
flowchart LR
    Features["Feature Services\n(chatAssistant, expenseAssistant, receipt, transaction, knowledgeBase)"]

    subgraph AI["AI Integration (shared/integrations/ai/)"]
        AIIdx["index.js + contracts.js\n(capabilities, embedText, generateAnswer,\ngenerateAnswerStream, extractReceiptImage,\ngenerateToolTurn, generateToolFollowup)"]
        Gemini["providers/geminiProvider.js\n(@google/genai)"]
    end

    subgraph DB["Operational Persistence"]
        Repos["Domain Repositories\n(transaction.repository, receipt.repository,\ntransactionDraft.repository, aiUsage.repository)"]
        Supa["shared/integrations/supabase.js\n(@supabase/supabase-js)"]
    end

    subgraph Vec["Vector Integration (shared/integrations/vector/)"]
        VecIdx["index.js\n(initVectorStore, upsertVectorPoints,\ngetVectorStoreCount, searchVectorPoints)"]
        Qdrant["qdrantAdapter.js\n(@qdrant/js-client-rest)"]
    end

    Features --> AIIdx --> Gemini
    Features --> Repos --> Supa
    Features --> VecIdx --> Qdrant
```

### 13.1 AI Capability Contracts, Provider Adapter & Telemetry Provenance
- **Contracts (`server/src/shared/integrations/ai/contracts.js`):** Explicit `AI_CAPABILITIES` (`textGeneration`, `streaming`, `toolCalling`, `structuredOutput`, `multimodal`, `embeddings`) and `assertCapability(provider, capability)` ensure callers fail fast when a selected model/provider lacks a required capability.
- **Provider Interface (`server/src/shared/integrations/ai/index.js`):** Exposes `embedText`, `generateAnswer`, `generateAnswerStream`, `extractReceiptImage`, `generateToolTurn`, `generateToolTurnStream`, and `generateToolFollowup`, delegating to `geminiProvider.js` (`@google/genai`) with `AbortSignal` propagation and retry/timeout handling.
- **Usage Telemetry & Provenance (`telemetry.js`, `aiUsage.repository.js`, `tokenEstimator.js`):**
  - Preserves explicit `0` vs `null` token counts (never fabricating PRNG counts).
  - Persists `usage_source` (`202611170014`) across four states: `'provider_reported'`, `'derived'` (`input + output` when provider omits `totalTokens`), `'unavailable'`, and `'unknown'` (for historical `NULL usage_source` rows with token counts that cannot be reliably reconstructed).
  - Telemetry recording is failure-isolated so analytics queue/DB errors never fail user AI requests.
  - **Known Limitation:** `cachedTokens` is normalized in memory but not persisted to `ai_usage_analytics`.

### 13.2 Operational Database Boundaries & Supabase-Specific Services
- **Domain Repositories:** `transaction.repository.js`, `receipt.repository.js`, `chatHistory.repository.js`, and `aiUsage.repository.js` isolate PostgreSQL queries from service business logic.
- **Supabase-Specific Boundaries:**
  - **Auth:** `client/src/shared/services/supabaseAuth.js` and `server/src/features/auth/auth.service.js` (GoTrue JWT verification & `app_metadata.role` lookup).
  - **Storage:** `receipt.repository.js` (`receipts` private bucket upload, download, delete, signed URLs).
  - **RLS & RPCs:** User-scoped PostgREST clients (`createUserScopedSupabaseClient(user.token)`) enforce `auth.uid() = user_id` and RPCs (`confirm_staged_receipt_transaction`, `begin_chat_stream_turn`, etc.).

### 13.3 Vector Store Abstraction
- **Vector Contract (`server/src/shared/integrations/vector/index.js`):** Exposes `initVectorStore`, `upsertVectorPoints`, `getVectorStoreCount`, and `searchVectorPoints`.
- **Qdrant Adapter (`qdrantAdapter.js`) & Alias Switching (`vectorStore.js`):** Supports both **Qdrant Cloud** (`QDRANT_URL` + `QDRANT_API_KEY`) and **Local Qdrant** (`QDRANT_URL` without `QDRANT_API_KEY`) using `@qdrant/js-client-rest`, with zero-downtime shadow collection creation, verification, `switchActiveAlias`, and obsolete collection cleanup.

### 13.4 Startup Validation & Provider Extension Guides
- **Startup Validation:** `validateProviderConfig(config)` in `server/src/config.js` runs at startup in `server/src/server.js` and fails immediately on unsupported `AI_PROVIDER`, `EMBEDDING_PROVIDER`, `DB_PROVIDER`, or `VECTOR_PROVIDER` values.
- **Adding a Gemini Model:** Set `GEMINI_MODEL`, `GEMINI_RECEIPT_MODEL`, or `EMBEDDING_MODEL` in `server/.env` (and add pricing entries in `aiUsage/pricingConfig.js` if needed).
- **Adding an Ollama Adapter (Future):** Implement an adapter in `server/src/shared/integrations/ai/providers/ollamaProvider.js` declaring its supported `capabilities`, register it in `ai/index.js`, and add `'ollama'` to `SUPPORTED_AI_PROVIDERS` / `SUPPORTED_EMBEDDING_PROVIDERS` in `config.js`.
- **Switching to Local Qdrant:** Point `QDRANT_URL` to the local Qdrant endpoint (e.g., `http://localhost:6333`), omit `QDRANT_API_KEY`, and re-run `npm run index`.
- **Switching to Local PostgreSQL (Future):** Implement `pg` repository adapters for `transaction`, `receipt`, `chatHistory`, and `aiUsage`, replace Supabase RPCs with SQL transactions, and pair with replacement Auth and Storage providers.
