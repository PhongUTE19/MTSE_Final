# 07 — Sequence Diagrams

> **Package:** SpendWise Academic Software Requirements Specification (SRS)  
> **Related Documents:** [`04-use-case-specifications.md`](./04-use-case-specifications.md), [`05-system-architecture.md`](./05-system-architecture.md)

---

## 1. Stateless Receipt Upload, Draft Review & Atomic Confirmation

Separates stateless OCR (`POST /api/receipt/upload`), browser-local IndexedDB staging, and atomic confirmation (`POST /api/receipt/confirm`).

```mermaid
sequenceDiagram
    actor User
    participant Client as React SPA + IndexedDB
    participant API as Express API
    participant Gemini as Google Gemini Vision
    participant Storage as Supabase Storage
    participant DB as PostgreSQL (RPC + RLS)

    User->>Client: Select receipt image & Upload
    Client->>API: POST /api/receipt/upload (multipart)
    API->>Gemini: Extract structured JSON (responseJsonSchema)
    Gemini-->>API: Extracted fields + currency warnings
    API-->>Client: 201 { receipt } (stateless; no DB/Storage write)
    Client->>Client: Stage TransactionDraft + Blob in IndexedDB (userId-scoped)

    User->>Client: Review/edit draft & Confirm
    Client->>API: POST /api/receipt/confirm (draftId + Blob + fields)
    API->>Storage: Upload image to private receipts/<uid>/<draftId>/original
    API->>DB: RPC confirm_staged_receipt_transaction(...)
    DB-->>API: Atomic { receipt, transaction }
    API-->>Client: 201 Created (or 200 on idempotent replay)
    Client->>Client: Mark/remove local IndexedDB draft
```

---

## 2. Unified AI Assistant SSE Streaming, Tool/RAG Loop & Chat History

Illustrates pre-stream validation, server-authoritative history loading, untrusted RAG wrapping, citation validation, and optional `propose_transaction` staging.

```mermaid
sequenceDiagram
    actor User
    participant Client as ExpenseAssistant (SPA)
    participant API as Express Chat Controller
    participant DB as PostgreSQL (Chat History)
    participant Orch as Assistant Orchestrator
    participant Qdrant as Qdrant (Optional)
    participant Gemini as Google Gemini API

    User->>Client: Submit message
    Client->>API: POST /api/chat-assistant/stream (Bearer JWT)
    API->>API: Validate JWT, role ('user'), Zod schema, injection scan
    API->>DB: RPC begin_chat_stream_turn(...)
    DB-->>API: conversation_id, user_message_id, assistant_message_id
    API-->>Client: SSE headers + event: meta
    API->>DB: Load trusted server history
    API->>Orch: orchestrateChatStream(message, trustedHistory, signal)

    loop Bounded Tool/RAG Rounds
        Orch->>Gemini: Generate turn with tool declarations
        alt Tool: search_knowledge_base
            Orch->>Qdrant: Vector search (spendwise_active)
            Qdrant-->>Orch: Chunks (wrapped as untrusted data)
        else Tool: search_transactions / get_spending_summary
            Orch->>DB: RLS-scoped transaction query
            DB-->>Orch: Ledger rows / aggregates
        else Tool: propose_transaction
            Orch-->>Client: event: proposal (UI stages IndexedDB draft)
        end
        Orch-->>Client: event: delta (streamed text)
    end

    Orch->>Orch: Validate [S#] citations & response integrity
    Orch->>DB: Persist final assistant message + sources
    Orch-->>Client: event: sources + event: done
```

---

## 3. Knowledge Base Inspection & Zero-Downtime Reindexing (Admin)

```mermaid
sequenceDiagram
    actor Admin as Administrator
    participant Client as Admin Knowledge Base UI
    participant API as Express Admin Router
    participant GitFS as Git Docs (data/knowledge/)
    participant Gemini as Gemini Embeddings
    participant Qdrant as Qdrant Cloud

    Admin->>Client: Open /admin/knowledge-base
    Client->>API: GET /api/admin/document & /api/admin/knowledge-base/status
    API->>GitFS: Read canonical markdown files (read-only)
    API->>Qdrant: Query spendwise_active status
    API-->>Client: 200 Documents + Index status

    Admin->>Client: Click Reindex Knowledge Base
    Client->>API: POST /api/admin/knowledge-base/index
    API->>GitFS: Chunk canonical markdown files
    API->>Gemini: Embed chunks (gemini-embedding-001)
    API->>Qdrant: Create & populate spendwise_shadow_<ts>
    API->>Qdrant: Verify point count, then switch spendwise_active alias
    Qdrant-->>API: Alias switched (zero downtime)
    API-->>Client: 200 Reindex summary
```
