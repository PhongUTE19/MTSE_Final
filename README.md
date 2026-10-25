# SpendWise — AI Personal Finance & Knowledge Base Assistant

An intelligent personal finance and expense management platform with Retrieval-Augmented Generation (RAG) powered by Google Gemini, Qdrant Cloud vector database, Supabase analytics, an Express.js backend, and a React frontend.

---

## Project Overview

SpendWise helps users track personal expenses, scan and review receipts with multimodal AI OCR, compute spending summaries, manage transactions, and query platform documentation.

### Key Capabilities

1. **Grounded Question Answering**: Retrieves authoritative section chunks and generates factually grounded responses citing specific documentation sections.
2. **Relevance Guardrail Gate**: Applies a cosine similarity cutoff (`SIMILARITY_THRESHOLD = 0.60`). Queries failing the threshold receive a safe refusal without calling generative LLMs, saving latency and API cost.
3. **Real-time SSE Streaming**: Emits Server-Sent Events (`metadata`, `delta`, `done`, `error`) with smooth client-side token reveal and fade-in animations.
4. **Interactive Retrieval Diagnostics**: In-UI transparency allowing inspection of candidate pools, similarity scores, ranks, and threshold pass/filter decisions.
5. **Admin Knowledge Management**:
   - Section-aware Markdown parsing and chunk inspection with search, sorting, and pagination.
   - Document CRUD operations stored in `data/knowledge/`.
   - One-click cloud re-indexing into Qdrant Cloud (`spendwise` collection).
   - System prompt customization with instant restore to default template (`data/prompts/`).
6. **AI Provider Abstraction Layer**: Lightweight, provider-independent interface (`embedText`, `generateAnswer`, `generateAnswerStream`) supporting pluggable AI backends with Google Gemini as the reference implementation.
7. **AI Usage Analytics & Telemetry**: Automatically tracks request counts, token usage (prompt, completion, total), latencies (P50, P95), and estimated costs with dual-mode persistence (Supabase PostgreSQL with in-memory buffer fallback).

---

## Technology Stack

* **Frontend**: React 18, Vite 6, Vanilla CSS modular design system.
* **Backend**: Node.js (v20+ / v22), Express.js 4/5 (Feature-first modular architecture).
* **AI Provider Abstraction**: Provider-independent registry in `server/src/shared/integrations/ai/`.
* **Default LLM Provider & Model**: Google Gemini via official `@google/genai` SDK, model **`gemini-3.5-flash-lite`**.
* **Embedding Model & Vector Dimension**: Google Gemini **`gemini-embedding-001`** (**3072** dimensions, `Cosine` metric).
* **Vector Database**: **Qdrant Cloud** (managed cluster over HTTPS, collection: `spendwise`).
* **Database & Telemetry**: **Supabase** (`@supabase/supabase-js`) for analytics persistence + in-memory circular fallback.
* **Validation & Error Handling**: Zod runtime schema validation (`validateRequest.js`), centralized operational error pipeline (`AppError.js`, `errorHandler.js`).

---

## Knowledge-Base Processing

### Source Document & Format
* **Location**: `data/knowledge/spendwise_user_guide.md`
* **Supported Format**: Markdown (`.md`) formatted with Level-2 headings (`## `) and Markdown tables.

### Chunking Strategy
* **Implementation**: `server/src/features/knowledge/chunker.js`.
* **Strategy**: Section-based chunking on Markdown Level-2 headings (`## `).
* **Guarantees**: Chunking preserves entire logical sections without mid-table or mid-rule splits. Complex structured sections—such as the Section 2 Platform Features table—remain intact within single coherent chunks.
* **Extracted Chunk Metadata**:
  - `id`: Unique identifier formatted as `${baseId}_sec${sectionNumber}` (e.g., `spendwise_user_guide_sec2`).
  - `sectionNumber`: Integer extracted from the header (1 to 12).
  - `sectionTitle`: Clean title string (e.g., `"Platform Features at a Glance"`).
  - `title`: Full heading string (e.g., `"2. Platform Features at a Glance"`).
  - `source`: Source filename (`spendwise_user_guide.md`).
  - `content`: Complete Markdown section body text.

### Embedding Generation & Indexing
* **Embeddings**: Generated via `embedText()` in `server/src/shared/integrations/ai/` using `gemini-embedding-001`.
* **Resilience**: Embedded with exponential backoff retry logic handling transient HTTP 503 or 429 errors.
* **Idempotent Cloud Indexing**: Executed via `server/src/features/knowledge/indexer.js` (`npm run index`). Recreates and populates the Qdrant Cloud collection to prevent stale points.

---

## Setup and Environment Configuration

### Prerequisites
* [Node.js](https://nodejs.org/) v20.x or v22.x
* [npm](https://www.npmjs.com/) v9+
* Google Gemini API key
* Managed Qdrant Cloud cluster and API key
* Supabase project URL and service role key (optional, for persistent AI analytics)

### Environment Variables
Configure environment variables in a single `.env` file at the project root (see `.env.example`):

| Variable Name | Description | Default / Example Value |
|---|---|---|
| `PORT` | Express backend port | `3000` |
| `AI_PROVIDER` | AI provider implementation key | `gemini` |
| `GEMINI_API_KEY` | Google Gemini API key (Required for Gemini) | `your_gemini_api_key_here` |
| `GEMINI_MODEL` | Generative LLM model ID | `gemini-3.5-flash-lite` |
| `EMBEDDING_MODEL` | Text embedding model ID | `gemini-embedding-001` |
| `TOP_K` | Number of chunks to retrieve | `4` |
| `SIMILARITY_THRESHOLD` | Cosine similarity cutoff for RAG generation | `0.60` |
| `QDRANT_URL` | Qdrant Cloud cluster endpoint | `https://<cluster-id>.<region>.cloud.qdrant.io:6333` |
| `QDRANT_API_KEY` | Qdrant Cloud secret API key | `your_qdrant_cloud_api_key_here` |
| `QDRANT_COLLECTION_NAME` | Vector collection name | `spendwise` |
| `PROMPT_FILE` | Persistent system prompt file path | `data/prompts/system_prompt.txt` |
| `PROMPT_FILE_DEFAULT` | Default system prompt template path | `data/prompts/system_prompt_default.txt` |
| `KNOWLEDGE_DIR` | Knowledge base directory path | `data/knowledge` |
| `SUPABASE_URL` | Supabase project URL (Analytics) | `https://your-project.supabase.co` |
| `SUPABASE_SECRET_KEY` | Supabase service role key (or `SUPABASE_KEY`) | `your_supabase_service_role_key` |

> [!NOTE]
> All credentials remain strictly on the backend. No API keys or internal database URLs are exposed to the client.

---

## Run Instructions

### 1. Install Dependencies
```bash
npm run install:all
```
*(Installs dependencies for root, `server/`, and `client/`).*

### 2. Index the Knowledge Base
```bash
npm run index
```
*(Embeds all documentation sections and upserts them into Qdrant Cloud).*

### 3. Start the Development Servers
```bash
npm start
# or
npm run dev
```
*(Concurrently launches the Express server on port 3000 and the Vite frontend on port 5173).*

### 4. Application Access URLs
* **User Chat & Assistant UI**: [http://localhost:5173](http://localhost:5173)
* **Backend API Base**: [http://localhost:3000](http://localhost:3000)
* **Health Check**: [http://localhost:3000/api/health](http://localhost:3000/api/health)

### 5. Docker Deployment (Optional)
```bash
# Build and run containers
npm run docker:up

# Run indexing inside container
npm run docker:index

# Tear down containers
npm run docker:down
```

---

## Testing & Quality Assurance

The project separates tests into offline unit tests, mock/ephemeral integration tests, and live RAG acceptance evaluations:

### 1. Automated Test Suites (Offline, Zero API Costs)
```bash
# Run all automated unit and integration tests
npm test

# Run unit tests only (tests/unit/)
npm run test:unit

# Run integration tests only (tests/integration/)
npm run test:integration
```

### 2. Dedicated Feature Unit Tests
```bash
node --test tests/unit/aiProvider.test.js
node --test tests/unit/analytics.test.js
node --test tests/unit/knowledgeBase.test.js
node --test tests/unit/collectionUtils.test.js
node --test tests/unit/clientValidation.test.js
node --test tests/unit/backendValidation.test.js
node --test tests/unit/documents.test.js
node --test tests/unit/systemPrompt.test.js
node --test tests/unit/guardrails.test.js
node --test tests/unit/middleware.test.js
node --test tests/unit/errors.test.js
node --test tests/unit/textReveal.test.js
```

### 3. Dedicated Integration Tests (Mocked/Ephemeral Server)
```bash
node --test tests/integration/apiRoutes.test.js
node --test tests/integration/chatOrchestration.test.js
node --test tests/integration/chatStreaming.test.js
node --test tests/integration/indexingWorkflow.test.js
```

### 4. Live RAG Acceptance Evaluations (Requires Cloud Credentials)
```bash
npm run eval:rag
```
Runs 11 end-to-end acceptance evaluations against live Qdrant and Gemini models via `evals/rag/runner.js`, evaluating platform features, receipt OCR specs, spending categories, out-of-scope refusals, and diagnostic metadata. Results are written to `test-results.json`.

### 5. Run All Tests and Evaluations
```bash
npm run test:all
```

---

## Retrieval Diagnostics & Inspection

Every answer returned by the assistant includes real-time diagnostics:
* **Candidate Pool**: Inspect candidate chunk count and top similarity score.
* **Threshold Status**: Green badge (`Passed to LLM`) for chunks meeting $\ge 0.60$; Red badge (`Filtered out (< 0.6)`) for withheld chunks.
* **Chunk Cards**: Display rank, cosine score, source file, section title, and expandable body text for complete transparency.

---

## Common Troubleshooting

* **Server Port in Use**: If port 3000 is occupied, set `PORT=3001` in `.env` and restart.
* **Transient LLM 503 / 429 Errors**: The backend automatically retries up to 3 times with exponential backoff.
* **Qdrant Connection Issues**: Verify `QDRANT_URL` and `QDRANT_API_KEY` in `.env`. Ensure your cloud cluster status is active.
* **Missing Analytics Data**: If `SUPABASE_URL` or `SUPABASE_SECRET_KEY` is not provided, the application automatically switches to in-memory buffering without crashing or interrupting chat requests.
* **Unsynced Chunks**: If markdown files in `data/knowledge/` are modified, run `npm run index` to synchronize Qdrant Cloud.
