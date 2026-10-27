# SpendWise AI Data Flows & Architecture Documentation

**Inspection Revision:** Commit `3634a4e6c61c797a9aed12d81043494c65e5d817` (`refactor-w1`)  
**Inspection Date:** 2026-10-27  
**Scope:** Complete implementation-level, source-traceable AI architecture and data-flow documentation.

---

## 1. System-Level Architecture Diagram

The diagram below reflects the active, verified implementation across Docker containers, the Express application layer, and external cloud services:

```mermaid
flowchart TB
    subgraph ClientContainer ["Docker Host: Client Container (Nginx / Vite :5173)"]
        UI_Expense["Expense Workspace\n(ExpensePage / ReceiptsView)\n[client/src/features/expense/]"]
        UI_Assistant["AI Expense Assistant Drawer\n(ExpenseAssistant / ProposalCard)\n[client/src/features/expense/assistant/]"]
        UI_Admin["Admin Analytics Dashboard\n(AnalyticsPage / HistoryTable)\n[client/src/features/analytics/]"]
        NginxProxy["Production Reverse Proxy (Nginx)\nclient_max_body_size 10M;\n[client/nginx.conf]"]
    end

    subgraph ServerContainer ["Docker Host: Server Container (Express :3000)"]
        Router["Express Router (/api/*)\n[server/src/server.js]"]
        AuthMiddleware["Auth & Scope Guard\n(authenticate / authorize)\n[server/src/shared/middleware/]"]
        
        subgraph FlowA_B ["Receipt OCR & Multimodal Flow"]
            UploadMiddleware["Multer Memory Buffer & Sharp Preprocessing\n[server/src/features/expenses/receiptUpload.middleware.js]"]
            ReceiptService["Receipt Lifecycle & Lease Coordinator\n[server/src/features/expenses/receipt.service.js]"]
            ReceiptSchema["Zod Normalization & Receipt Guardrails\n[server/src/features/expenses/receipt.schemas.js]"]
        end

        subgraph FlowC ["Tool-Using Expense Agent"]
            AgentController["Agent Controller & Chat Orchestrator\n[server/src/features/expenseAgent/]"]
            GeminiAgent["Gemini Function Calling (AUTO)\n[server/src/features/expenseAgent/geminiExpenseAgent.js]"]
            ToolExecutors["Tool Dispatcher & RLS Scoped Queries\n(search, summary, create_proposal)\n[server/src/features/expenseAgent/expenseAgent.service.js]"]
            ProposalStore["In-Memory Pending Proposal Store\n(UUID, TTL 10m, status gate)"]
        end

        subgraph FlowD ["Knowledge Base & RAG (Retained)"]
            RAGService["RAG Pipeline & Scope/Injection Guardrails\n[server/src/features/knowledgeBase/ragService.js]"]
            Retriever["Vector Similarity Retriever\n[server/src/features/knowledgeBase/retriever.js]"]
        end

        subgraph FlowE ["Telemetry & Analytics"]
            UsageTracker["Usage Tracker & Price Estimator\n[server/src/features/analytics/usageTracker.js]"]
            BatchWriter["FIFO Bounded Async Queue (SupabaseUsageWriter)\n[server/src/features/analytics/analytics.writer.js]"]
            AnalyticsRepo["Analytics Dual Repository\n(Supabase SQL + In-Memory Fallback)\n[server/src/features/analytics/analytics.repository.js]"]
        end
    end

    subgraph CloudBackends ["External Managed Cloud Backends"]
        SupabaseAuth["Supabase GoTrue Auth\n(JWT Bearer Tokens)"]
        SupabaseDB["Supabase PostgreSQL 15\n• expense_transactions (RLS)\n• receipts (RLS + RPCs)\n• ai_usage_analytics"]
        SupabaseStorage["Supabase Storage\n(Private 'receipts' Bucket)"]
        GeminiAPI["Google Gemini 3.5 Flash API\n• Vision Multimodal (Receipts)\n• Function Calling Tools (Agent)\n• text-embedding-001 (Docs)"]
        QdrantCloud["Qdrant Cloud Vector DB\n('spendwise' Collection)"]
    end

    UI_Expense -->|HTTP POST Multipart| NginxProxy
    UI_Assistant -->|HTTP REST /api/*| NginxProxy
    UI_Admin -->|HTTP GET /api/admin/*| NginxProxy
    NginxProxy -->|Reverse Proxy /api/| Router

    Router --> AuthMiddleware
    AuthMiddleware -->|Verify Bearer JWT| SupabaseAuth

    AuthMiddleware --> UploadMiddleware
    UploadMiddleware --> ReceiptService
    ReceiptService -->|Upload Image Bytes| SupabaseStorage
    ReceiptService -->|Vision OCR + JSON Schema| GeminiAPI
    ReceiptService -->|Enforce Guardrails| ReceiptSchema
    ReceiptService -->|confirm_receipt_transaction RPC| SupabaseDB

    AuthMiddleware --> AgentController
    AgentController --> GeminiAgent
    GeminiAgent -->|Function Declarations| GeminiAPI
    GeminiAPI -->|Tool Call: search / summary / create| GeminiAgent
    GeminiAgent --> ToolExecutors
    ToolExecutors -->|User Scoped SQL Query| SupabaseDB
    ToolExecutors -->|Store Proposal| ProposalStore
    UI_Assistant -->|User Confirms Proposal| ToolExecutors
    ToolExecutors -->|Save Transaction| SupabaseDB

    AuthMiddleware --> RAGService
    RAGService --> Retriever
    Retriever -->|Cosine Vector Query| QdrantCloud
    RAGService -->|Generate Grounded Answer| GeminiAPI

    GeminiAgent -.->|Record Telemetry| UsageTracker
    ReceiptService -.->|Record Telemetry| UsageTracker
    RAGService -.->|Record Telemetry| UsageTracker
    UsageTracker --> BatchWriter
    BatchWriter -->|Non-blocking Batch Inserts| SupabaseDB
    AuthMiddleware --> AnalyticsRepo
    AnalyticsRepo -->|Query Aggregated Stats| SupabaseDB
```

---

## 2. Directory Navigation & Flow Map

| Flow | Document | Primary Scope | Actual Entry Point |
|---|---|---|---|
| **Flow A** | [01-receipt-multimodal.md](./01-receipt-multimodal.md) | Main user receipt-image digitization from UI selection to confirmed financial transaction. | `POST /api/receipts/upload` |
| **Flow B** | [01-receipt-multimodal.md#part-2-multimodal-input-and-structured-output](./01-receipt-multimodal.md#part-2-multimodal-input-and-structured-output) | Vision model prompt assembly, strict JSON schema output, Vietnamese date/currency normalization, and guardrails. | [`geminiProvider.js:extractReceiptImage`](../../server/src/shared/integrations/ai/providers/geminiProvider.js#L485-L552) |
| **Flow C** | [02-tool-using-agent.md](./02-tool-using-agent.md) | Natural language expense assistant, Gemini tool declarations, function calling loop, RLS queries, and proposal-confirmation gate. | `POST /api/expense-agent/assistant` |
| **Flow D** | [03-rag-flow.md](./03-rag-flow.md) | Markdown knowledge base chunking, Qdrant indexing, cosine similarity candidate retrieval, and grounded Q&A. | `POST /api/user/chat` & `POST /api/admin/index` |
| **Flow E** | [04-admin-analytics.md](./04-admin-analytics.md) | Request-level telemetry lifecycle, async FIFO batch buffer, pricing calculations, prompt hashing, and admin dashboard queries. | `GET /api/admin/analytics/overview` & `history` |
| **Catalogue** | [05-prompts-guardrails-and-telemetry.md](./05-prompts-guardrails-and-telemetry.md) | Unified reference of all prompts, deterministic guardrails, tools, and external service dependencies. | Cross-cutting reference |

---

## 3. Capability Classification & Milestone 1 Baseline

In accordance with approved Milestone 1 project specifications, capabilities are categorized as follows:

| Capability Tier | Scope & Status | Components Included |
|---|---|---|
| **Committed Milestone 1 AI Capabilities** | Active in default user experience | • **Capability B (Tool-Using Agent):** Conversational assistant with tool calling for transaction search, spending totals, and transaction proposal creation with mandatory user confirmation.<br>• **Capability C (Structured Output):** Receipt OCR constrained to strict schema via Gemini `responseJsonSchema` and Zod normalization.<br>• **Capability D (Multimodal Input):** Direct image processing via Gemini vision models without third-party OCR engines. |
| **Operational Admin & Platform Features** | Active and verified | • **Admin AI Analytics:** Asynchronous telemetry writer, cost calculation, token estimation, and request history table.<br>• **Authentication & Ownership:** Supabase GoTrue authentication, RLS ownership filters, and dedicated database security definer functions. |
| **Optional / Retained Infrastructure** | Implemented, tested, but inactive by default | • **Knowledge Base RAG:** Section chunking (`data/knowledge/`), Qdrant Cloud vector indexing, and cosine retrieval.<br>*Note:* Chat defaults to `strategy: 'agent'` via [`assistant.service.js:L40`](../../server/src/features/assistant/assistant.service.js#L40). RAG remains fully operational when setting `CHAT_STRATEGY=rag`. |

---

## 4. Source-Reference Standard

Every claim in this documentation links directly to the current source code using relative Markdown links:

* Format: `[filepath:L<start>-L<end>](../../filepath#L<start>-L<end>)`
* Example: [`server/src/features/expenses/receipt.service.js:L169-L195`](../../server/src/features/expenses/receipt.service.js#L169-L195)
* Line numbers correspond strictly to commit `3634a4e6c61c797a9aed12d81043494c65e5d817`.
