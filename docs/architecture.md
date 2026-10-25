# Architecture: Student Handbook Assistant (RAG)

## 1. Goal & Context
* **Project**: A containerized Student Handbook Assistant using Retrieval-Augmented Generation (RAG).
* **Stack**: React (Vite / Nginx) + Node.js (Express) + Qdrant Cloud + Google Gemini API + Supabase Analytics.
* **Core Philosophy**: Feature-first modularization, provider-independent AI abstraction, robust validation, containerization via Docker Compose, and zero-loss telemetry persistence.

---

## 2. Multi-Service Cloud Architecture

The system consists of two containerized application services managed by Docker Compose, communicating externally with **Qdrant Cloud**, **Google Gemini API**, and **Supabase**:

```
+-----------------------------------------------------------------------------------------+
|                                    Docker Host Network                                  |
|                                                                                         |
|        Host Port 5173                          Host Port 3000                           |
|              │                                       │                                  |
+--------------┼───────────────────────────────────────┼──────────────────────────────────+
|              ▼                                       ▼                                  |
|  +─────────────────────────+          +─────────────────────────+                       |
|  | student-handbook-client |          | student-handbook-server |                       |
|  |   (Nginx / Vite)        |          |   (Express :3000)       |                       |
|  |                         |          |                         |                       |
|  | - Student Chat View     |  proxy   | - Feature Routes        |                       |
|  | - Admin Knowledge Mgt   |─────────►| - RAG Orchestration     |                       |
|  | - AI Analytics Dashboard|          | - AI Provider Registry  |                       |
|  | - Streaming Text Reveal |          | - Usage Tracking / Queue|                       |
|  +─────────────────────────+          +───┬─────────┬─────────┬─+                       |
+-------------------------------------------┼─────────┼─────────┼─────────────────────────+
                                            │         │         │
                         HTTPS (REST)       │         │         │ HTTPS (REST)
                        ┌───────────────────┘         │         └───────────────────┐
                        ▼                             ▼                             ▼
           +─────────────────────────+   +─────────────────────────+   +─────────────────────────+
           |      Qdrant Cloud       |   |    Google Gemini API    |   |     Supabase Cloud      |
           | (Managed Cluster :6333) |   | (Official @google/genai)|   | (PostgreSQL Analytics)  |
           |                         |   |                         |   |                         |
           | - 3072-dim Cosine Index |   | - gemini-3.5-flash-lite |   | - ai_usage_analytics    |
           | - Student_Handbook Coll |   | - gemini-embedding-001  |   | - Token & Cost Metrics  |
           | - High-Performance HNSW |   | - Streaming SSE deltas  |   | - Latency Percentiles   |
           +─────────────────────────+   +─────────────────────────+   +─────────────────────────+
```

---

## 3. Core Feature Workflows

### 3.1. User Chat & Streaming Workflow
1. **User Submits Query**: Student asks a handbook question in `UserChatView.jsx`.
2. **HTTP Dispatch**: `client/src/services/userApi.js` sends `POST /api/user/chat` (synchronous) or `POST /api/user/chat/stream` (SSE).
3. **Request Validation**: Express route invokes `validateRequest({ body: chatRequestSchema })`. Invalid payloads immediately return `400 Bad Request` JSON before SSE headers are sent.
4. **Chat Orchestration (`server/src/features/chat/chat.service.js`)**:
   - Delegates retrieval to `server/src/features/knowledge/ragService.js`.
   - Embeds query using active AI provider (`embedText()`).
   - Retrieves top-$K$ candidates ($K=4$) from Qdrant Cloud via `retriever.js`.
   - Checks relevance threshold ($0.60$) and Section 11 Amendment boost ($0.55$).
5. **Guardrail Decision**:
   - **Below Cutoff (< 0.60)**: Returns early refusal text without calling generative LLM, passing empty sources and retrieval diagnostics.
   - **Accepted (>= 0.60)**: Injects active system prompt (`prompts.service.js`) and retrieved chunks into `promptBuilder.js`.
6. **Generation & Telemetry**:
   - Passes grounded prompt to `generateAnswer()` or `generateAnswerStream()` in `geminiProvider.js`.
   - Automatically tracks usage metrics (prompt tokens, completion tokens, latency, cost) via `usageTracker.js`.
   - Streaming deltas emit SSE events: `metadata` $\rightarrow$ `delta`* $\rightarrow$ `done` (or `error`).
7. **Client Rendering**: `AnswerContent.jsx` renders incremental chunks with an opacity fade-in animation (`streaming-text-fade`), transitioning to clean text upon completion.

### 3.2. Document Management CRUD Workflow
* **Storage**: Authoritative markdown files residing in `data/knowledge/` (default: `KB-A_Lumen-Institute-Student-Handbook.md`).
* **Route**: Mounted under `/api/admin/documents` in `server/src/routes/adminRoute.js` $\rightarrow$ `server/src/features/documents/documents.routes.js`.
* **Validation**: File names validated against path traversal (`sanitizeFilename`), contents validated for non-empty Level-2 Markdown headers.
* **Service**: `documents.service.js` reads, writes, updates, or deletes files on disk and recalculates section counts.

### 3.3. Knowledge Status, Chunk Review & Cloud Indexing Workflow
* **Status**: `GET /api/admin/status` verifies active filesystem documents vs indexed vector points in Qdrant Cloud.
* **Chunk Review**: `GET /api/admin/chunks` parses markdown sections in memory using `chunker.js`, supports server-side search (`q`), limit (1–50), and offset pagination.
* **Idempotent Cloud Indexing**: `POST /api/admin/index` runs `indexer.js`:
  1. Reads all `.md` files in `data/knowledge/`.
  2. Generates section chunks (splitting by Level-2 `## ` headers while preserving full tables).
  3. Reinitializes Qdrant Cloud collection `Student_Handbook` (`initVectorStore({ reset: true })`).
  4. Generates 3072-dim embeddings with exponential backoff retry.
  5. Upserts points into Qdrant Cloud with full metadata payload.

### 3.4. System Prompt Management Workflow
* **Storage**: Persistent storage in `data/systemPrompt/system_prompt.txt`, with factory default in `data/systemPrompt/system_prompt_default.txt`.
* **Endpoints**:
  - `GET /api/admin/prompt`: Reads active prompt from file. If file is missing, seeds it from default.
  - `PUT /api/admin/prompt`: Validates length (20–10,000 characters) and updates active prompt.
  - `POST /api/admin/prompt/reset`: Restores active prompt back to the default configuration template.

### 3.5. AI Usage Analytics & Telemetry Pipeline
1. **Instrumented Call**: Every AI operation (chat, streaming, embedding) in `geminiProvider.js` triggers `trackAiUsage()`.
2. **Writer Queue**: `analytics.writer.js` enqueues usage records (model, feature, tokens, latency, timestamp, outcome).
3. **Batch Flushing**: Flushes records every 1,000ms or when batch size reaches 10 items.
4. **Persistence Layer (`analytics.repository.js`)**:
   - **Supabase**: If `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are configured, writes rows to `ai_usage_analytics`.
   - **In-Memory Circular Buffer**: If Supabase is unconfigured or temporarily unreachable, records are buffered in memory (capacity: 1,000 items) so admin dashboards still render live metrics without interrupting chat services.
5. **Analytics Endpoints**:
   - `GET /api/admin/analytics/overview`: Aggregated KPI cards (total requests, total tokens, avg latency, estimated cost).
   - `GET /api/admin/analytics/timeseries`: Grouped time-series buckets (1h, 24h, 7d, 30d).
   - `GET /api/admin/analytics/breakdown`: Grouped distributions by feature or model.
   - `GET /api/admin/analytics/history`: Paginated table of individual query transactions.

---

## 4. Minimal API Contracts

### 4.1. Health Check
* **Endpoint**: `GET /api/health`
* **Response (`200 OK`)**:
```json
{
  "status": "ok",
  "indexedChunks": 12
}
```

### 4.2. User Chat Endpoints
* **Synchronous**: `POST /api/user/chat`
* **Streaming**: `POST /api/user/chat/stream`
* **Request Body**:
```json
{
  "message": "What is the tuition fee for the Standard Program?"
}
```
* **Success Response (`200 OK`)**:
```json
{
  "answer": "The tuition fee for the Standard Program is 42,000,000 VND per semester [2. Programs at a Glance].",
  "sources": [
    {
      "id": "KB-A_Lumen-Institute-Student-Handbook_sec2",
      "title": "2. Programs at a Glance",
      "source": "KB-A_Lumen-Institute-Student-Handbook.md",
      "score": 0.8124
    }
  ],
  "retrieval": {
    "poolSize": 4,
    "topScore": 0.8124,
    "threshold": 0.6,
    "passed": true
  }
}
```

### 4.3. Admin Knowledge & Document Endpoints
* **`GET /api/admin/status`**: Returns `{ documentCount, totalFileChunks, indexedChunks, isIndexing, lastIndexedAt, isSynced }`.
* **`GET /api/admin/chunks`**: Query parameters `limit` (default 10), `offset` (default 0), `q` (optional search query). Returns paginated chunks list with `hasMore`.
* **`POST /api/admin/index`**: Triggers full cloud re-indexing. Returns `{ success: true, message, indexedChunks }`.
* **`GET /api/admin/documents`**: Returns list of markdown documents with metadata.
* **`GET /api/admin/documents/:filename`**: Returns `{ filename, content }`.
* **`POST /api/admin/documents`**: Body `{ filename, content, overwrite? }`. Returns `201 Created`.
* **`PUT /api/admin/documents/:filename`**: Body `{ content }`. Returns `200 OK`.
* **`DELETE /api/admin/documents/:filename`**: Returns `200 OK`.

### 4.4. Admin Prompt Endpoints
* **`GET /api/admin/prompt`**: Returns `{ prompt: string }`.
* **`PUT /api/admin/prompt`**: Body `{ prompt: string }`. Returns `{ success: true, message: string, prompt: string }`.
* **`POST /api/admin/prompt/reset`**: Resets prompt to factory default. Returns `{ prompt: string, message: string }`.

### 4.5. Admin Analytics Endpoints
* **`GET /api/admin/analytics/overview`**: Query parameters `range` (`1h`, `24h`, `7d`, `30d`), `model`, `feature`.
* **`GET /api/admin/analytics/timeseries`**: Returns chronological token and request trends.
* **`GET /api/admin/analytics/breakdown`**: Query parameter `groupBy` (`model` or `feature`).
* **`GET /api/admin/analytics/history`**: Query parameters `page`, `limit`, `model`, `feature`, `outcome`.

---

## 5. AI Provider Abstraction Layer

The application isolates LLM-specific dependencies behind a lightweight, provider-independent interface:

```
                  ┌──────────────────────────────┐
                  │    Core Business Logic       │
                  │ (ragService, chatService)    │
                  └──────────────┬───────────────┘
                                 │
                                 ▼
                  ┌──────────────────────────────┐
                  │  AI Provider Interface       │
                  │ (server/src/shared/          │
                  │   integrations/ai/index.js)  │
                  ├──────────────────────────────┤
                  │ + getAIProvider(name)        │
                  │ + registerAIProvider(name, p)│
                  │ + embedText(text, opts)      │
                  │ + generateAnswer(p, opts)    │
                  │ + generateAnswerStream(p, o) │
                  └──────────────┬───────────────┘
                                 │
                                 ▼
                  ┌──────────────────────────────┐
                  │   AI Provider Registry       │
                  │   Map(['gemini', provider])  │
                  └──────────────┬───────────────┘
                                 │
                    ┌────────────┴────────────┐
                    ▼                         ▼
         +─────────────────────+   +─────────────────────+
         |   geminiProvider    |   | Custom AI Provider  |
         | (Google Gemini SDK) |   | (OpenAI / Anthropic |
         | - gemini-3.5-flash  |   |  or Local Ollama)   |
         | - gemini-embedding  |   +─────────────────────+
         +─────────────────────+
```

### Provider Contract
Each registered provider object must implement:
1. `name`: String identifier (e.g., `'gemini'`).
2. `embedText(text, options)`: Returns `Promise<number[]>`.
3. `generateAnswer(prompt, options)`: Returns `Promise<string>`.
4. `generateAnswerStream(prompt, options)`: Returns `Promise<AsyncIterable<{ text: string }>>`.

---

## 6. Actual Folder Structure

```
Student_Handbook/
├── client/                               # React + Vite frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── admin/                    # Admin management modules
│   │   │   │   ├── analytics/            # Analytics dashboard components
│   │   │   │   │   ├── AdminAnalyticsDashboard.jsx
│   │   │   │   │   ├── AnalyticsCharts.jsx
│   │   │   │   │   ├── AnalyticsFilters.jsx
│   │   │   │   │   ├── AnalyticsHistoryTable.jsx
│   │   │   │   │   └── AnalyticsKpiCards.jsx
│   │   │   │   ├── AdminDashboard.jsx    # Admin tabs and coordination
│   │   │   │   ├── AdminStats.jsx        # Admin status cards
│   │   │   │   ├── ChunkCard.jsx         # Chunk display card
│   │   │   │   ├── ChunkReview.jsx       # Paginated chunk list
│   │   │   │   ├── DocumentEditor.jsx    # Markdown document editor
│   │   │   │   ├── DocumentTable.jsx     # Document table with sorting & search
│   │   │   │   └── SystemPromptEditor.jsx# Prompt editor & reset control
│   │   │   ├── common/                   # Shared UI components
│   │   │   │   ├── Pagination.jsx        # Standardized pagination bar
│   │   │   │   ├── SearchInput.jsx       # Debounced search bar
│   │   │   │   ├── SortableHeader.jsx    # Bi-directional sort table header
│   │   │   │   └── index.js
│   │   │   ├── toast/                    # Toast notification components
│   │   │   ├── user/                     # Student chat UI modules
│   │   │   │   ├── AnswerContent.jsx     # Streaming text reveal & fade-in
│   │   │   │   ├── AssistantMessage.jsx  # Assistant message card
│   │   │   │   ├── ChatForm.jsx          # Input form with submit / abort
│   │   │   │   ├── ConversationList.jsx  # Message history list
│   │   │   │   ├── UserChatView.jsx      # Chat container
│   │   │   │   ├── UserMessage.jsx       # Student query bubble
│   │   │   │   └── debug/                # Diagnostics & inspection cards
│   │   │   └── HealthBadge.jsx           # Global system health indicator
│   │   ├── constants/                    # UI messages, labels, and config
│   │   ├── context/                      # ToastContext for alert toasts
│   │   ├── hooks/                        # Custom hooks for state & logic
│   │   │   ├── useAdminDashboard.js
│   │   │   ├── useAnalytics.js
│   │   │   ├── useChat.js
│   │   │   ├── useChunks.js
│   │   │   ├── useDocuments.js
│   │   │   ├── useDrawer.js
│   │   │   ├── useHealth.js
│   │   │   ├── useKnowledgeBase.js
│   │   │   ├── usePagination.js
│   │   │   ├── useSearch.js
│   │   │   ├── useSort.js
│   │   │   ├── useSystemPrompt.js
│   │   │   └── useTextReveal.js          # Streaming token reveal & fragment animation
│   │   ├── services/                     # API fetch abstractions
│   │   │   ├── adminApi.js
│   │   │   ├── analyticsApi.js
│   │   │   ├── apiClient.js
│   │   │   └── userApi.js
│   │   ├── styles/                       # Modular CSS design system
│   │   │   ├── components/               # alerts, analytics, badges, buttons, chat, forms, stats, tables
│   │   │   ├── layout.css
│   │   │   └── index.css
│   │   ├── utils/                        # Pure client utilities
│   │   │   ├── collectionUtils.js        # Pagination, filtering, sorting math
│   │   │   ├── formatters.js             # Date, token, and currency formatters
│   │   │   ├── tableUtils.js
│   │   │   └── validation.js             # Form input validation rules
│   │   ├── App.jsx                       # Top navigation & view switcher
│   │   └── main.jsx
│   ├── Dockerfile                        # Multi-stage Nginx build
│   ├── nginx.conf
│   ├── package.json
│   └── vite.config.js
├── server/                               # Node.js Express backend
│   ├── src/
│   │   ├── config.js                     # Centralized configuration & environment loader
│   │   ├── constants/                    # HTTP status, messages, chunking limits, defaults
│   │   ├── features/                     # Feature-first domain modules
│   │   │   ├── analytics/                # Telemetry, aggregation, Supabase repo, writer queue
│   │   │   │   ├── analytics.constants.js
│   │   │   │   ├── analytics.controller.js
│   │   │   │   ├── analytics.repository.js
│   │   │   │   ├── analytics.routes.js
│   │   │   │   ├── analytics.schemas.js
│   │   │   │   ├── analytics.service.js
│   │   │   │   ├── analytics.utils.js
│   │   │   │   ├── analytics.writer.js
│   │   │   │   └── usageTracker.js
│   │   │   ├── chat/                     # User chat orchestration & routes
│   │   │   │   ├── chat.controller.js
│   │   │   │   ├── chat.routes.js
│   │   │   │   ├── chat.schemas.js
│   │   │   │   └── chat.service.js
│   │   │   ├── documents/                # Markdown document CRUD
│   │   │   │   ├── documents.controller.js
│   │   │   │   ├── documents.routes.js
│   │   │   │   ├── documents.schemas.js
│   │   │   │   └── documents.service.js
│   │   │   ├── knowledge/                # Chunking, indexing, retriever, Qdrant store
│   │   │   │   ├── chunker.js
│   │   │   │   ├── indexer.js
│   │   │   │   ├── knowledge.controller.js
│   │   │   │   ├── knowledge.routes.js
│   │   │   │   ├── knowledge.schemas.js
│   │   │   │   ├── knowledge.service.js
│   │   │   │   ├── promptBuilder.js
│   │   │   │   ├── ragService.js
│   │   │   │   ├── retriever.js
│   │   │   │   └── vectorStore.js
│   │   │   └── systemPrompt/                  # System prompt persistence & reset
│   │   │       ├── prompts.controller.js
│   │   │       ├── prompts.routes.js
│   │   │       ├── prompts.schemas.js
│   │   │       └── prompts.service.js
│   │   ├── routes/
│   │   │   └── adminRoute.js             # Root admin route orchestrator
│   │   ├── shared/                       # Cross-cutting shared infrastructure
│   │   │   ├── errors/                   # AppError and domain error subclasses
│   │   │   ├── integrations/             # AI provider abstraction & Supabase client
│   │   │   │   ├── ai/
│   │   │   │   │   ├── providers/
│   │   │   │   │   │   └── geminiProvider.js
│   │   │   │   │   └── index.js
│   │   │   │   └── supabase.js           # Supabase singleton client
│   │   │   └── middleware/               # validateRequest.js, errorHandler.js
│   │   └── server.js                     # Express app setup, mounting, and startup
│   ├── Dockerfile
│   └── package.json
├── data/
│   ├── knowledge/                        # Markdown knowledge base files
│   │   └── KB-A_Lumen-Institute-Student-Handbook.md
│   └── systemPrompt/                          # System prompt files
│       ├── system_prompt.txt             # Active persisted prompt
│       └── system_prompt_default.txt     # Factory default prompt template
├── docs/
│   ├── architecture.md                   # Detailed architecture documentation
│   └── READING_GUIDE.md                  # Quick-reference feature navigation guide
├── tests/                                # Automated offline test suites
│   ├── unit/                             # Focused unit tests (zero external dependencies)
│   │   ├── aiProvider.test.js
│   │   ├── analytics.test.js
│   │   ├── backendValidation.test.js
│   │   ├── clientValidation.test.js
│   │   ├── collectionUtils.test.js
│   │   ├── documents.test.js
│   │   ├── errors.test.js
│   │   ├── guardrails.test.js
│   │   ├── knowledgeBase.test.js
│   │   ├── middleware.test.js
│   │   ├── systemPrompt.test.js
│   │   └── textReveal.test.js
│   └── integration/                      # Mock & ephemeral server integration tests
│       ├── apiRoutes.test.js
│       ├── chatOrchestration.test.js
│       ├── chatStreaming.test.js
│       └── indexingWorkflow.test.js
├── evals/                                # RAG evaluation datasets and runners
│   └── rag/
│       ├── cases.js                      # Curated acceptance evaluation dataset
│       └── runner.js                     # Live model evaluation harness & reporter
├── docker-compose.yml                    # Container orchestrator
├── .env.example                          # Environment template
├── package.json                          # Root orchestration scripts
└── README.md                             # Project overview & run guide
```

---

## 7. Key Architectural Decisions & Rationale

| Decision | Choice | Rationale |
|---|---|---|
| **Backend Organization** | Feature-first (`features/` + `shared/`) | Co-locates controllers, routes, schemas, and services by domain feature instead of grouping by technical type. Prevents sprawling generic directories. |
| **Vector Storage** | Qdrant Cloud | Eliminates local vector database containers and persistent volume overhead on developer machines. High availability and consistent deployment across dev and CI/CD. |
| **AI Provider Abstraction** | Pluggable interface (`shared/integrations/ai`) | Decouples generative AI and embedding operations from Gemini-specific code, making it simple to test or switch providers without changing domain logic. |
| **Similarity Guardrail** | 0.60 Cosine cutoff gate | Filters out irrelevant queries before invoking generative models, avoiding hallucination and minimizing LLM latency and cost. |
| **Telemetry Persistence** | Dual-mode Supabase + in-memory fallback | Provides production-ready PostgreSQL persistence for AI analytics while allowing the application to operate smoothly in offline or development environments without Supabase credentials. |
| **Chunking Strategy** | Section-based Header Chunking (`## `) | Keeps complex tables (Tuition, Programs) and regulatory provisions (Amendments) unified in single chunks, avoiding fragmented retrieval. |
| **Streaming Text Reveal** | Token-level opacity fade-in | Replaced the harsh blinking cursor with a subtle materialization animation without re-rendering or flickering existing text. |
