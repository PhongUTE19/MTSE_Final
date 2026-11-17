# 01 — System Scope & User Roles

> **Package:** SpendWise Academic Software Requirements Specification (SRS)  
> **Related Documents:** [`02-business-rules.md`](./02-business-rules.md), [`03-use-case-diagram.md`](./03-use-case-diagram.md), [`04-use-case-specifications.md`](./04-use-case-specifications.md)

---

## 1. System Overview & Purpose

SpendWise is a web-based personal expense tracking, multimodal receipt digitization, and conversational AI financial assistant application. It enables individual users to record and analyze personal income and expenses in Vietnamese Dong (VND), extract structured transaction candidates from receipt images, and query both their personal ledger and SpendWise documentation through a unified, guardrail-enforced AI assistant.

---

## 2. Project Scope

### 2.1 In-Scope Functionality (Implemented)

1. **Authentication & Role-Based Workspace Routing:** Email/password and Supabase GoTrue session authentication, password reset, and strict role-based separation between `user` and `admin` workspaces (`app_metadata.role`).
2. **Personal Expense & Income Ledger:** Full transaction CRUD (`GET`, `POST`, `PUT`, `DELETE /api/transaction`), server-side pagination/filtering/sorting, category breakdowns, and single-currency VND validation.
3. **Stateless Receipt OCR & Browser-Local Draft Staging:** Receipt image upload (`POST /api/receipt/upload`) for Gemini multimodal extraction, browser-local IndexedDB `TransactionDraft` staging (`userId`-scoped), interactive user review/editing, and atomic confirmation (`POST /api/receipt/confirm`) or safe rejection.
4. **Unified Conversational AI Assistant (REST & SSE):** Multi-step tool-calling orchestrator combining personal finance tools (`search_transactions`, `get_spending_summary`, draft-only `propose_transaction`) and Knowledge Base RAG (`search_knowledge_base`) with SSE streaming, client cancellation, citation validation, and server-authoritative Chat History.
5. **Administrative Observability & Knowledge Base Operations:** Read-only AI usage analytics (`/admin/ai-usage`), read-only inspection of Git-managed canonical documents and system prompts, and zero-downtime Qdrant shadow-collection reindexing.

### 2.2 Out-of-Scope Functionality (Not Implemented)

- Direct banking APIs, open-banking sync, or automated bank statement imports.
- Payment execution, money transfers, or multi-currency accounting/FX conversion inside the ledger.
- Autonomous AI database writes (AI proposals always require explicit human confirmation).
- Runtime editing of system prompts or canonical Knowledge Base documents through the admin UI.
- Cross-device synchronization of unconfirmed IndexedDB `TransactionDraft`s.

---

## 3. Stakeholders & Actor Definitions

| Actor | Role Identifier | Description |
| :--- | :--- | :--- |
| **Guest** | Unauthenticated | Visitor without a valid Supabase JWT session. |
| **Authenticated User** | `app_metadata.role = 'user'` (default) | Individual tracking personal finances, scanning receipts, and using the AI assistant. |
| **Administrator** | `app_metadata.role = 'admin'` | System operator monitoring AI usage telemetry and inspecting/reindexing the Knowledge Base. |
| **Google Gemini API** | External Supporting Actor | Provides multimodal receipt OCR, tool-calling chat completions, and text embeddings (`gemini-embedding-001`). |
| **Supabase Platform** | External Supporting Actor | Provides GoTrue JWT authentication, PostgreSQL 15 with RLS, and private Storage (`receipts`). |
| **Qdrant Vector Store** | External Supporting Actor (Optional) | Stores derived 3072-dim document embeddings behind the `spendwise_active` alias; system degrades gracefully if unavailable. |

---

## 4. Role & Permission Matrix

| Capability | Guest | Authenticated User | Administrator |
| :--- | :---: | :---: | :---: |
| Sign in / Sign up / Reset password | Yes | Yes | Yes |
| Access `/home` workspace shell | No | Yes | Yes |
| Manage personal transactions (`/expense/transactions`, `/expense/categories`) | No | Yes | **No (`403`)** |
| Upload/confirm receipts & stage IndexedDB drafts (`/expense/receipts`) | No | Yes | **No (`403`)** |
| Use Chat / Expense Assistant & Chat History | No | Yes | **No (`403`)** |
| View AI Usage Analytics (`/admin/ai-usage`) | No | **No (`403`)** | Yes |
| Inspect Git-managed docs & system prompt (read-only) | No | **No (`403`)** | Yes |
| Trigger Knowledge Base Qdrant reindex | No | **No (`403`)** | Yes |

---

## 5. System Boundaries & Constraints

1. **Strict Role Separation:** Administrators do **not** inherit Authenticated User finance capabilities (`authorize('user')` rejects `'admin'` on finance/chat routes, and `RoleRouteGuard` enforces `/expense/*` for `'user'` only).
2. **Single-Currency VND Ledger:** All committed `expense_transactions` amounts are stored in VND; non-VND receipts require explicit user review and conversion before saving.
3. **Optional Qdrant Degraded Mode:** Express starts and serves `/api/health/live` (`200 OK`) and personal finance features even when Qdrant is unconfigured or unavailable; only Knowledge Base RAG/indexing is affected.
