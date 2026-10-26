# SpendWise — Personal Expense Tracker & AI Assistant

SpendWise is an intelligent personal finance management application designed for university students and young professionals who want to track daily expenses, understand spending habits, and digitize paper receipts without tedious manual entry.

---

## 1. Implemented AI Capabilities (Milestone 1 Scope)

In accordance with approved Milestone 1 requirements, SpendWise implements three core AI capabilities:

1. **Capability B (Tool-Using Agent)**:
   * Conversational assistant (`server/src/features/expenseAgent/expenseAgent.service.js`) equipped with Google Gemini function-calling tools:
     * `search_transactions`: Queries user transactions by date, merchant, or category.
     * `get_spending_summary`: Computes exact spending totals and category breakdowns in PostgreSQL (zero LLM arithmetic).
     * `create_transaction`: Generates transaction proposals.
   * **Proposal-Confirmation Safety Gate**: Financial write operations require explicit human confirmation via an interactive UI proposal card before any mutation is committed to the database.
2. **Capability C (Structured Output)**:
   * Receipt extraction (`server/src/features/expenses/receipts.service.js`) enforces strict JSON schema adherence through Gemini's `responseJsonSchema`, validated by Zod schemas (`server/src/features/expenses/receipts.schemas.js`). Eliminates syntax errors and guarantees predictable field types (merchant, date, total, items, tax, category).
3. **Capability D (Multimodal Input)**:
   * Direct ingestion of receipt image files (JPEG, PNG, WebP up to 5 MB) into Google Gemini 3.5 Flash vision models. Extracts Vietnamese and English receipts in a single forward pass without brittle local OCR engines.

> [!NOTE]
> Retrieval-Augmented Generation (RAG) vector chunking (`data/knowledge/`) and Qdrant Cloud indexing exist as operational platform infrastructure for querying platform documentation, but RAG is not a committed Milestone 1 User Story deliverable. Autonomous unconfirmed writes and multi-agent coordination are explicitly out of scope for M1.

---

## 2. Technology Stack & System Architecture

* **Frontend**: React 18, Vite 6, React Router 6, Vanilla CSS design tokens.
* **Backend**: Node.js 20+, Express 4/5 (Feature-first modular structure).
* **AI Provider**: Google Gemini API via `@google/genai` SDK (`gemini-3.5-flash-lite`, `gemini-embedding-001`).
* **Vector Store**: Qdrant Cloud (3072-dimension cosine index in `spendwise` collection).
* **Database & Auth**: Supabase Cloud:
  * **Supabase Auth (GoTrue)**: User credential management and JWT issuance.
  * **PostgreSQL 15**: Relational tables with Row-Level Security (`auth.uid() = user_id`).
  * **Supabase Storage**: Private `receipts` bucket for receipt image uploads.
* **Architecture Overview**:
  * The React SPA communicates with the Express backend via REST and Server-Sent Events (SSE).
  * Express validates incoming Bearer JWTs and creates a scoped Supabase client with the caller's token, guaranteeing database-level tenant isolation.
  * AI operations execute through a unified provider abstraction (`server/src/shared/integrations/ai/`), automatically logging token counts, latency, and estimated costs to an asynchronous telemetry queue.

---

## 3. Prerequisites

Ensure the following tools and accounts are available before setup:

* **Node.js**: `v20.x` or `v22.x` (LTS recommended)
* **npm**: `v9.x` or higher
* **Docker & Docker Compose**: Docker Desktop (Windows/macOS) or Docker Engine + Compose v2 (Linux)
* **Google Gemini API Key**: From [Google AI Studio](https://aistudio.google.com/)
* **Qdrant Cloud Cluster**: Endpoint URL and API key from [Qdrant Cloud](https://cloud.qdrant.io/)
* **Supabase Project**: Project URL, Public Anon Key, and Secret (Service-Role) Key from [Supabase](https://supabase.com/)

---

## 4. Environment Configuration

SpendWise separates public browser configuration from protected server credentials.

### Required Variables by Component

| Component | Variable Name | Required | Purpose |
|---|---|---|---|
| **Client** (`client/.env`) | `VITE_SUPABASE_URL` | **Yes** | Supabase project URL for browser auth initialization |
| | `VITE_SUPABASE_ANON_KEY` | **Yes** | Public anonymous key for client session handling |
| **Server** (`server/.env`) | `PORT` | No | Express server port (default: `3000`) |
| | `GEMINI_API_KEY` | **Yes** | API key for Gemini chat, vision OCR, and embeddings |
| | `GEMINI_MODEL` | No | Generative model ID (default: `gemini-3.5-flash-lite`) |
| | `GEMINI_RECEIPT_MODEL` | No | Receipt vision model ID (default: `gemini-3.5-flash-lite`) |
| | `EMBEDDING_MODEL` | No | Embedding model ID (default: `gemini-embedding-001`) |
| | `QDRANT_URL` | **Yes** | Managed Qdrant cluster endpoint URL |
| | `QDRANT_API_KEY` | **Yes** | Secret API key for Qdrant Cloud |
| | `QDRANT_COLLECTION_NAME`| No | Target vector collection name (default: `spendwise`) |
| | `SUPABASE_URL` | **Yes** | Supabase project URL for server verification and client creation |
| | `SUPABASE_ANON_KEY` | **Yes** | Public anon key used to build scoped RLS clients |
| | `SUPABASE_SECRET_KEY` | **Yes** | Service-role key for admin role management and telemetry persistence |
| | `TOP_K` | No | Candidate chunks retrieved for knowledge assistant (default: `3`) |
| | `SIMILARITY_THRESHOLD` | No | Cosine similarity cutoff gate (default: `0.60`) |

### Setting Up Environment Files

From the repository root, copy the provided templates:
```bash
# Server configuration
cp server/.env.example server/.env

# Client configuration (for standalone local development)
cp client/.env.example client/.env
```

Open `server/.env` in your editor and enter your actual Gemini, Qdrant, and Supabase credentials. Never commit `.env` files to version control.

---

## 5. Running Locally (Node.js & Vite)

To run the application directly on your host machine:

```bash
# 1. Install all dependencies across root, server, and client
npm run install:all

# 2. (Optional) Index documentation chunks into Qdrant Cloud
npm run index

# 3. Start Express server (:3000) and Vite frontend (:5173) concurrently
npm run dev
# or: npm start
```

* **Web Application**: [http://localhost:5173](http://localhost:5173)
* **API Health Check**: [http://localhost:3000/api/health](http://localhost:3000/api/health)

---

## 6. Docker Deployment Workflow

To build and run SpendWise in isolated Docker containers from the repository root:

### Step 1: Ensure Environment Files Exist
Confirm that `server/.env` contains your verified API keys. Docker Compose automatically forwards `SUPABASE_URL` and `SUPABASE_ANON_KEY` as build arguments to the client container.

### Step 2: Validate Docker Compose Configuration
```bash
docker compose --env-file server/.env config --quiet
```
*(Exits with code 0 if configuration syntax and variable bindings are valid).*

### Step 3: Build Container Images
```bash
docker compose --env-file server/.env build
```

### Step 4: Start Services in Detached Mode
```bash
docker compose --env-file server/.env up -d
```
*(Or use the project shortcut: `npm run docker:up`).*

### Step 5: Check Status and Inspect Logs
```bash
# Check container health and status
docker compose --env-file server/.env ps

# Inspect recent logs across all services
docker compose --env-file server/.env logs --tail 50

# Follow server logs specifically
docker compose --env-file server/.env logs -f server
```

### Step 6: Stop the Application
```bash
docker compose --env-file server/.env down
```
*(Or use the project shortcut: `npm run docker:down`).*

> [!IMPORTANT]
> `docker compose down` stops and removes the project containers and shared internal network. Normal host-mounted code and persistent external cloud data (Supabase, Qdrant) remain intact. **Do not use `down -v` as the default command**, as removing volumes is unnecessary and can wipe local caches.

### Automated Helper Scripts
* **Windows (PowerShell)**: `.\deploy.ps1`
* **Linux / macOS (Bash)**: `chmod +x deploy.sh && ./deploy.sh`

---

## 7. Test Account Setup & Role Assignment

SpendWise does not include hardcoded credentials in the repository. Follow this workflow to create a test user and assign an administrative role:

### Step 1: Register an Account via the UI
1. Open [http://localhost:5173/auth](http://localhost:5173/auth) in your browser.
2. Select the **Sign Up** tab.
3. Enter an email address (e.g. `evaluator@spendwise.local`) and password (minimum 6 characters).
4. Click **Create Account**. You are immediately logged in as a standard user with the `'user'` role.

### Step 2: Retrieve the User UUID
To promote this account, obtain the user's UUID:
* **Option A (Supabase Dashboard)**: Navigate to `Authentication` > `Users` in your Supabase project dashboard and copy the `User UID` string.
* **Option B (Browser Storage)**: In your browser DevTools (`F12`), check `Application` > `Local Storage` > key `sb-<ref>-auth-token` and copy the `user.id` value.

### Step 3: Assign the Admin Role
The project provides a verified CLI script at `server/scripts/set-user-role.js` to safely update `app_metadata.role` using `SUPABASE_SECRET_KEY`:

* **From the repository root**:
  ```bash
  npm run set-role -- <Supabase-User-UUID> admin
  ```
* **Or from the `server/` directory**:
  ```bash
  npm run set-role -- <Supabase-User-UUID> admin
  # or: node scripts/set-user-role.js <Supabase-User-UUID> admin
  ```

Accepted role values: `'admin'` or `'user'`.

### Step 4: Refresh the Session
Sign out in the web client and sign back in. The new JWT token will contain `app_metadata.role = 'admin'`. The sidebar will now display administrative navigation links:
* **AI Usage Analytics** (`/admin/analytics`)
* **Knowledge Base** (`/admin/knowledge-base`)
* **System Prompt Editor** (`/admin/prompt`)

---

## 8. Deployment Status

* **Local Docker Deployment**: Fully containerized and verified on `http://localhost:5173` (Nginx client) and `http://localhost:3000` (Express server).
* **Public Cloud URL**: No public cloud-hosted demo URL is currently active or maintained. Local Docker Compose is the authoritative deployment environment for defense and evaluation.

---

## 9. Testing & Quality Assurance

SpendWise includes 344 offline unit and integration tests requiring zero third-party cloud API costs:

```bash
# Run all automated tests (344 tests passing)
npm test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration
```

---

## 10. Documentation Index

* [docs/README/userstory.md](docs/README/userstory.md): Milestone 1 User Stories (US-01 through US-14) with Given/When/Then acceptance criteria and source-level traceability matrix.
* [docs/README/architecture.md](docs/README/architecture.md): System architecture, multi-service topology, component responsibilities, directory trees, and sequence flow for tool-using AI requests.
* [docs/README/adr/0001-spendwise-authentication-architecture.md](docs/README/adr/0001-spendwise-authentication-architecture.md): ADR for Supabase Auth, Bearer JWT, and client-side RLS enforcement.
* [docs/README/adr/0002-multimodal-receipt-extraction.md](docs/README/adr/0002-multimodal-receipt-extraction.md): ADR for Native Gemini Multimodal Vision with Zod Structured Output.
* [docs/README/adr/0003-agent-tool-calling-and-confirmation-gate.md](docs/README/adr/0003-agent-tool-calling-and-confirmation-gate.md): ADR for Tool-Using AI Agent with Proposal-Confirmation Gate.
* [AI_USAGE.md](AI_USAGE.md): AI tools disclosure, review workflow, representative prompts, and audit of real AI mistakes and remediation.
