# SpendWise System Architecture

This document provides a clear architectural overview of SpendWise for engineering team members, evaluators, and project defense.

---

## 1. System Overview & Scope

SpendWise is an AI-assisted personal expense tracking web application. It combines traditional transaction ledger management with conversational AI assistance, automated receipt digitization, and usage telemetry.

### 1.1. Core Capabilities in Milestone 1 (M1)

In accordance with approved Milestone 1 requirements, the system implements three specific AI capabilities:
* **Capability B (Tool-Using Agent)**: Natural-language conversational agent using Google Gemini function calling to query transaction statistics in SQL and draft expense proposals.
* **Capability C (Structured Output)**: Receipt OCR extraction constrained to a strict, validated JSON schema via Gemini's `responseJsonSchema` and backend Zod schemas (`server/src/features/receipt/receipt.schema.js`).
* **Capability D (Multimodal Input)**: Direct ingestion of physical receipt images (JPEG, PNG, WebP) into Gemini 3.5 Flash vision models without external OCR engines.

### 1.2. Scope Classification

To avoid ambiguity during evaluation, capabilities are categorized into three tiers:

| Tier | Status | Components Included |
|---|---|---|
| **Implemented Capabilities** | Committed & Active | User Authentication (Supabase GoTrue), Transaction CRUD, Spending Breakdown Charts, Stateless Multimodal Receipt Extraction + Browser IndexedDB Draft Confirmation, Unified Tool-Using & RAG Chat Assistant (SSE + Server-Authoritative Chat History), AI Usage Telemetry, Admin Analytics Dashboard, and Read-Only Git-Managed System Prompt & Knowledge Base Inspection. |
| **Optional Infrastructure** | Operational Platform Code | Knowledge Base chunking (`data/knowledge/`), Qdrant Cloud vector indexing, and Cosine similarity document retrieval. These support platform documentation Q&A, but RAG is not a committed Milestone 1 User Story. |
| **Future / Planned Work** | Out of Scope for M1 | Autonomous unconfirmed database writes, multi-agent coordination frameworks, bank API sync, and custom category budget threshold alerts. |

---

## 2. Multi-Service Architecture Diagram

The system consists of two containerized application services managed via Docker Compose, communicating externally with three managed cloud providers:

```mermaid
flowchart TB
    subgraph ClientHost ["Docker Host: Client Container"]
        ClientUI["React 18 SPA (Vite / Nginx :5173)\n• Expense List & Filters\n• AI Chat & Proposal Cards\n• Receipt Scanner & Review\n• Admin Analytics Dashboard"]
    end

    subgraph ServerHost ["Docker Host: Server Container"]
        ExpressApp["Node.js Express Server (:3000)\n• Helmet & CORS Protection\n• Supabase JWT Bearer Auth Guard\n• Feature-First Domain Controllers\n• Asynchronous Telemetry Writer"]
    end

    subgraph CloudServices ["External Managed Cloud Backends"]
        SupabaseAuth["Supabase Auth (GoTrue)\n• User Accounts & Passwords\n• Access JWT Issuance (User & Admin)"]
        SupabaseDB["Supabase PostgreSQL 15\n• public.expense_transactions\n• Row-Level Security (auth.uid = user_id)\n• ai_usage_analytics Table"]
        SupabaseStorage["Supabase Storage\n• Private 'receipts' Bucket\n• Uploaded Receipt Image Files"]
        GeminiAPI["Google Gemini API\n• gemini-3.5-flash-lite (Agent & OCR)\n• gemini-embedding-001 (Docs)\n• Function Tools & JSON Schemas"]
        QdrantCloud["Qdrant Cloud Vector Store\n• 'spendwise_active' Alias (Shadow-Switched)\n• 3072-dim Cosine Document Index"]
    end

    ClientUI -- "Direct Auth / Refresh" --> SupabaseAuth
    ClientUI -- "HTTP REST & SSE (/api/*)" --> ExpressApp

    ExpressApp -- "Verify Bearer JWT & RLS Client" --> SupabaseDB
    ExpressApp -- "Upload Confirmed Receipt & Signed URL" --> SupabaseStorage
    ExpressApp -- "Batch Usage Telemetry" --> SupabaseDB
    ExpressApp -- "Agent Tools & Vision OCR" --> GeminiAPI
    ExpressApp -- "Vector Embedding Search" --> QdrantCloud
```

---

## 3. Component Responsibilities & Rationale

### 3.1. Frontend Client (`client/`)
* **Technology**: React 18, Vite 6, Nginx (Alpine-based Docker container on port `5173`, injecting public Supabase config at startup via `/runtime-config.js`).
* **Responsibility**: Renders the responsive user interface, manages client-side authentication state, stages unconfirmed `TransactionDraft`s in browser IndexedDB, displays live spending charts, provides receipt upload previews, and renders interactive proposal cards.
* **Why It Exists**: Delivers a fast, zero-latency single-page application (SPA) experience with client-side routing while keeping sensitive backend database keys out of the browser and decoupling the Docker build from local `.env` files.

### 3.2. Backend Server (`server/`)
* **Technology**: Node.js 20+, Express 4 (`express@^4.21.2`, Docker container on port `3000` with `/api/health/live` liveness probe and graceful `SIGTERM`/`SIGINT` shutdown).
* **Responsibility**: Exposes feature-first REST endpoints, validates input payloads using Zod schemas, authenticates caller identity via Supabase JWTs, coordinates AI provider interactions, and buffers AI telemetry records.
* **Why It Exists**: Serves as the central API gateway and business logic coordinator, ensuring security policies are enforced on every request before touching database tables or calling external AI models.

### 3.3. Supabase Cloud (Auth, PostgreSQL, Storage)
* **Supabase Auth (GoTrue)**: Handles user registration, email/password verification, and access token issuance. Eliminates custom cryptographic password-handling code.
* **PostgreSQL with Row-Level Security (RLS)**: Stores financial transactions and analytics. RLS policies guarantee that a tenant can only view and mutate rows where `auth.uid() = user_id`, preventing data leakage across users even if an application filter has an error.
* **Supabase Storage**: Stores receipt image files in a private `receipts` bucket, returning secure reference URLs for expense records.

### 3.4. Google Gemini API
* **Technology**: Official `@google/genai` Node.js SDK.
* **Responsibility**: Powers the tool-using conversational assistant (`gemini-3.5-flash-lite`), performs zero-shot receipt multimodal vision OCR, and generates 3072-dimensional vector embeddings (`gemini-embedding-001`).
* **Why It Exists**: Native multimodal vision and strict JSON schema adherence eliminate brittle OCR pipelines and prevent JSON syntax parsing failures.

### 3.5. Qdrant Cloud Vector Database
* **Technology**: Managed Qdrant cluster over HTTPS (port `6333`).
* **Responsibility**: Stores 3072-dimensional vector embeddings of section-chunked platform documentation (`spendwise` collection) for similarity search.
* **Why It Exists**: Provides fast cosine similarity matching for the documentation assistant without requiring heavy local vector database containers on developer workstations.

---

## 4. Key Terminology Explained

* **Row-Level Security (RLS)**: A PostgreSQL security feature where database policies automatically filter rows returned by queries based on the identity of the authenticated user (`auth.uid() = user_id`). Even if `SELECT * FROM expense_transactions` is executed, the user only receives their own rows.
* **Function Calling (Tools)**: An LLM capability where the model does not attempt to calculate answers itself; instead, it outputs a structured function call request (e.g. `get_spending_summary({ startDate, endDate })`) that the backend executes against real SQL databases before returning the verified result to the LLM.
* **Structured Output**: Forcing the AI model to output syntactically valid JSON conforming to an explicit schema, preventing hallucinated keys or invalid markdown text.
* **Server-Sent Events (SSE)**: A lightweight, unidirectional HTTP protocol allowing the server to stream real-time text chunks and metadata events to the browser client.

---

## 5. Representative AI Request Flow (Tool-Using Agent)

This sequence diagram illustrates an end-to-end AI interaction: a user submits a natural-language request (*"I spent 150k on lunch today, please add it"*), the agent resolves calendar dates, invokes the proposal tool, and requires explicit user confirmation before committing changes to PostgreSQL.

```mermaid
sequenceDiagram
    autonumber
    actor User as User / Browser Client
    participant Server as Express Server (/api/expense-agent/chat)
    participant Agent as ExpenseAgent Service
    participant Gemini as Google Gemini 3.5 Flash
    participant Telemetry as Usage Tracker Queue
    participant DB as Supabase PostgreSQL (RLS)

    User->>Server: POST /api/expense-agent/chat { message: "Spent 150k on lunch today" } [Bearer JWT]
    Server->>Server: Authenticate JWT with Supabase Auth & extract user ID
    Server->>Agent: processAgentChat(user, messageHistory)
    Note over Agent: Injects Vietnam Calendar Date Anchor<br/>(resolves 'today' to local Asia/Ho_Chi_Minh day)
    Agent->>Gemini: generateAnswerWithTools(prompt, tools: [search_transactions, get_spending_summary, create_transaction])
    Gemini-->>Agent: Function Call: create_transaction({ amount: 150000, category: "Food & Dining", merchant: "Lunch", date: "2026-10-26" })
    Agent->>Agent: Construct transient Proposal Object { proposalId, type: "expense", amount: 150000, ... }
    Agent->>Telemetry: trackAiUsage({ model: "gemini-3.5-flash-lite", feature: "expense_agent", tokens, latency })
    Telemetry-->>DB: Async flush to ai_usage_analytics
    Agent-->>Server: Return response { answer: "I have prepared a draft...", proposal: {...} }
    Server-->>User: 200 OK with formatted proposal
    Note over User: Client displays Proposal Confirmation Card<br/>(Category: Food & Dining, Amount: 150,000 VND, Date: 2026-10-26)
    User->>User: Reviews details and clicks "Confirm"
    User->>Server: POST /api/assistant/confirm { proposalId } [Bearer JWT]
    Server->>Server: Validate proposalId, verify expiration, and check ownership
    Server->>DB: INSERT INTO expense_transactions (user_id, amount, category, date, ...)
    DB-->>Server: 201 Created
    Server-->>User: 200 OK { success: true, message: "Transaction saved successfully." }
```

---

## 6. Source Code Directory Structure

SpendWise adopts a feature-first architectural pattern across both frontend and backend codebases, co-locating routes, controllers, services, schemas, and UI components with their respective domain domains.

### 6.1. Frontend Architecture (`client/src/`)

> [!TIP]
> For the complete, canonical deep-dive on frontend layers, component invariants, dependency boundaries, and strict styling rules, see [docs/engineering/architecture.md](../engineering/architecture.md).

The frontend follows a strictly separated 6-layer architecture:

```
client/src/
├── main.jsx                              # Application entry & DOM bootstrap
├── index.css                             # Single global stylesheet entry point (runtime CSS variables, @tailwind, @layer base)
├── app/                                  # Layer 6: Application shell, routing & providers
│   ├── App.jsx                           # Root router, global providers & layout mounts
│   ├── guards/                           # Client-side session and role route guards
│   │   ├── AdminRouteGuard.jsx           # Verifies 'admin' role in app_metadata
│   │   └── AuthenticatedRouteGuard.jsx   # Verifies active Supabase session
│   └── providers/                        # Application-wide UI context providers
│       ├── ConfirmProvider.jsx           # Promise-based confirmation dialog context
│       ├── ToastProvider.jsx             # Notification toast dispatch context
│       └── index.js                      # Barrel export
├── primitives/                           # Layer 1: Feature-agnostic atomic building blocks
│   ├── buttons/                          # Button, IconButton
│   ├── cards/                            # Card, CardHeader, CardTitle, CardContent, CardFooter
│   ├── display/                          # Avatar, ChartBar, ColorIndicator, Icon, Icons, Logo
│   ├── feedback/                         # Spinner
│   ├── inputs/                           # TextInput, TextArea, Select, FileInput, PasswordInput
│   ├── labels/                           # Label, Badge, HelperText, ErrorText
│   ├── layout/                           # Stack, Inline, Grid, Spacer, Divider
│   ├── lists/                            # List, ListItem
│   ├── table/                            # Table, TableHead, TableBody, TableRow, TableCell, TableHeaderCell
│   ├── typography/                       # Text, Link
│   ├── Backdrop.jsx                      # Modal backdrop primitive
│   └── index.js                          # Barrel export
├── composites/                           # Layer 2: Feature-agnostic multi-primitive components
│   ├── dataDisplay/                      # EmptyState, SortableHeader, StatCard
│   ├── feedback/                         # Alert, ToastContainer, ToastItem
│   ├── forms/                            # FormField (composes Label, HelperText, ErrorText)
│   ├── navigation/                       # Pagination
│   ├── overlays/                         # ConfirmDialog, OverlayDrawer, PushDrawer, Modal
│   ├── search/                           # SearchInput
│   └── index.js                          # Barrel export
├── features/                             # Layer 3: Feature-first domain modules
│   ├── admin/                            # Admin overview, user role management, system health (HealthBadge)
│   ├── analytics/                        # Admin AI telemetry charts, KPI metrics, history table
│   ├── analytics/                        # Admin AI telemetry charts, KPI metrics, history table
│   ├── auth/                             # User authentication flows (login, register, reset password)
│   ├── categories/                       # Category management view
│   ├── chat/                             # AI Chatbot, PushDrawer companion, composer, message history
│   ├── documents/                        # Admin knowledge base document CRUD & chunk inspector
│   ├── expense/                          # Personal expense ledger, TransactionTable, TransactionForm
│   ├── home/                             # Landing hero page
│   ├── knowledgeBase/                    # Knowledge base query tester, stats, vector index overview
│   ├── receipts/                         # Multimodal receipt scanning, upload, and review flow
│   └── systemPrompt/                     # Admin system prompt configuration editor
├── layouts/                              # Layer 4: Shared structural application layouts
│   ├── WorkspaceLayout.jsx               # Authenticated workspace shell with sidebar and content area
│   ├── WorkspaceSidebar.jsx              # Responsive navigation sidebar with collapse & drawer
│   ├── sidebarConfig.js                  # Navigation route registry, icons, and role requirements
│   └── index.js                          # Barrel export
└── shared/                               # Layer 5: Shared application-wide utilities & infrastructure
    ├── constants/                        # config.js, routes.js, messages.js, uiLabels.js
    ├── hooks/                            # useDrawer, usePagination, useSearch, useSort, useSession, etc.
    ├── services/                         # apiClient.js, supabaseAuth.js, healthApi.js
    └── utils/                            # formatters.js, validation.js, collectionUtils.js, drawerFocus.js
```

### 6.2. Backend Architecture (`server/src/`)

```
server/src/
├── config.js                             # Environment variable loader & defaults
├── server.js                             # Express app setup, middleware, and startup
├── constants/                            # HTTP status codes, chunk limits, default configs
├── features/                             # Feature-first domain modules
│   ├── aiUsage/                          # AI usage telemetry aggregation & persistence
│   │   ├── aiUsage.controller.js         # Admin telemetry HTTP endpoints
│   │   ├── aiUsage.repository.js         # Dual-mode storage (Supabase + memory fallback)
│   │   ├── aiUsage.routes.js             # Routes for overview, timeseries, and history
│   │   ├── aiUsage.writer.js             # In-memory FIFO queue with batched flushes
│   │   └── usageTracker.js               # Helper to format and enqueue AI telemetry records
│   ├── assistant/                        # Platform knowledge base Q&A assistant (RAG)
│   │   ├── assistant.controller.js       # Chat & SSE streaming controllers
│   │   └── assistant.service.js          # RAG query retrieval and LLM response generation
│   ├── auth/                             # Authentication & role management
│   │   ├── auth.schemas.js               # Role and user validation schemas
│   │   └── auth.service.js               # Service-role user lookup and role update
│   ├── documents/                        # Markdown knowledge base document CRUD
│   │   ├── documents.controller.js       # File read/write/delete handlers
│   │   └── documents.service.js          # Filesystem I/O for data/knowledge/
│   ├── expenseAssistant/                 # Tool-Using AI Assistant (Capability B)
│   │   ├── expenseAssistant.controller.js # Agent chat and proposal endpoints
│   │   ├── expenseAssistant.service.js   # Proposal lifecycle and tool execution coordinator
│   │   └── geminiExpenseAssistant.js     # Gemini function-calling declarations and tool dispatcher
│   ├── expense/                          # Personal expenses (transactions & spending summary)
│   │   ├── expense.controller.js         # Transaction CRUD & spending summary endpoints
│   │   └── expense.service.js            # RLS-scoped PostgreSQL queries & aggregations
│   ├── receipt/                          # Multimodal receipt OCR (Capabilities C & D)
│   │   ├── receipt.controller.js         # Receipt upload, list, preview, and retry endpoints
│   │   ├── receipt.schemas.js            # Strict Zod schema for OCR extraction
│   │   ├── receipt.service.js            # Receipt processing and storage coordinator
│   │   ├── receiptGuardrails.js          # OCR output normalization & non-receipt detection
│   │   └── receiptUpload.middleware.js   # Multer memory storage & Sharp image validation
│   ├── knowledgeBase/                    # Documentation chunking & vector search (Infrastructure)
│   │   ├── chunker.js                    # Markdown Level-2 header section splitter
│   │   ├── indexer.js                    # Vector embedding generation & Qdrant upsertion
│   │   ├── retriever.js                  # Cosine similarity candidate search in Qdrant
│   │   └── vectorStore.js                # Qdrant client connection & collection management
│   └── systemPrompt/                     # System prompt persistence
│       ├── systemPrompt.controller.js    # Prompt read/write/reset handlers
│       └── systemPrompt.service.js       # File I/O for data/prompts/
├── routes/                               # Route composition
│   └── adminRoute.js                     # Root admin router mounting protected features
├── shared/                               # Shared cross-cutting modules
│   ├── errors/                           # AppError and domain operational error classes
│   ├── guardrails/                       # Security filters (prompt injection, scope check)
│   ├── integrations/                     # External provider interfaces
│   │   ├── ai/                           # AI provider abstraction & geminiProvider.js
│   │   └── supabase.js                   # Scoped Supabase client factory (createScopedSupabaseClient)
│   ├── middleware/                       # Express middleware (authenticate, authorize, validateRequest, rateLimiter)
│   └── validation/                       # Shared validation helpers (zodIntegerParam)
└── scripts/                              # Server CLI scripts
    └── set-user-role.js                  # Administrative role assignment CLI script
```

---

## 7. Architecture Decision Records (ADRs)

SpendWise architectural decisions are formally documented in:
* [ADR 0001: SpendWise Authentication and Expense Ownership Architecture](adrs/adr-0001-spendwise-authentication-architecture.md)
* [ADR 0002: Multimodal AI and Structured Output for Receipt Processing](adrs/adr-0002-multimodal-receipt-extraction.md)
* [ADR 0003: Agent Tool Calling and Confirmation Gate for Financial Operations](adrs/adr-0003-agent-tool-calling-and-confirmation-gate.md)

---

## 8. Detailed AI Execution Flows & Data Architecture

Comprehensive, source-traceable implementation-level documentation with exact file paths, line ranges, prompt files, tool declarations, guardrails, and tests is maintained in `docs/academic/ai-data-flows/`:

* **[AI Architecture & Flow Overview](ai-data-flows/README.md)**: System-level architecture diagram, flow map, capability classification, and source traceability standard.
* **[Flow 01: Multimodal Receipt Scanning & Structured Extraction](ai-data-flows/01-receipt-multimodal.md)**: End-to-end receipt pipeline from file picker to database write, prompt resolution, Zod normalization, subtotal guardrails, and Nginx reverse-proxy configuration.
* **[Flow 02: Tool-Using Expense Agent](ai-data-flows/02-tool-using-agent.md)**: Conversational assistant, tool declaration inventory (`search_transactions`, `get_spending_summary`, `create_transaction`), proposal lifecycle, and two-phase confirmation security gate.
* **[Flow 03: RAG & Knowledge Base](ai-data-flows/03-rag-flow.md)**: Document chunking, Qdrant vector indexing, similarity threshold gate (`0.65`), policy amendment overrides, and grounding prompt construction.
* **[Flow 04: Admin AI Analytics](ai-data-flows/04-admin-analytics.md)**: Asynchronous telemetry lifecycle, bounded queue writer, metric provenance table, full-dataset search/sort, and token estimation.
* **[Flow 05: Prompts, Guardrails & Telemetry Catalogue](ai-data-flows/05-prompts-guardrails-and-telemetry.md)**: Single source of truth for all 8 prompt files, 16 deterministic guardrails, and platform external dependencies.
