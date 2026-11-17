# 02 — Business Rules

> **Package:** SpendWise Academic Software Requirements Specification (SRS)  
> **Related Documents:** [`01-scope-and-user-roles.md`](./01-scope-and-user-roles.md), [`04-use-case-specifications.md`](./04-use-case-specifications.md)

---

## 1. Account, Role & Access Control Rules

| ID | Rule Name | Description | Implementation Evidence |
| :--- | :--- | :--- | :--- |
| **BR-001** | Trusted Role Authority | User roles (`user`, `admin`) are read exclusively from Supabase `app_metadata.role`, never client-editable `user_metadata`. | `client/src/shared/services/supabaseAuth.js`, `server/src/shared/middleware/authorize.js` |
| **BR-002** | Strict Role Isolation | `admin` accounts cannot access `user` finance/chat routes (`/api/transaction`, `/api/receipt`, `/api/chat-assistant`, `/api/chat-history`), and `user` accounts cannot access `/api/admin/*`. | `authorize('user')` / `authorize('admin')`, `RoleRouteGuard.jsx`, `AdminRouteGuard.jsx` |
| **BR-003** | Row-Level Tenant Isolation | Every user-scoped PostgreSQL query executes with the caller's verified JWT so RLS (`auth.uid() = user_id`) enforces tenant isolation at the database layer. | `server/src/shared/integrations/supabase.js`, `supabase/migrations/` |

---

## 2. Transaction, Currency & Receipt Lifecycle Rules

| ID | Rule Name | Description | Implementation Evidence |
| :--- | :--- | :--- | :--- |
| **BR-004** | Confirmed-Only Ledger | Only explicitly confirmed transactions are persisted in `public.expense_transactions`. Unconfirmed OCR extractions and AI proposals exist only as browser-local `TransactionDraft`s. | `client/src/features/transactionDraft/draftStorage.js`, `POST /api/transaction`, `POST /api/receipt/confirm` |
| **BR-005** | User-Scoped Browser IndexedDB Staging | Unconfirmed `TransactionDraft`s and receipt image `Blob`s are stored in browser IndexedDB scoped by `userId` and are not synchronized across devices. | `client/src/features/transactionDraft/draftStorage.js` |
| **BR-006** | Single-Currency VND Ledger | `public.expense_transactions.amount` stores positive integers/numbers in VND. Non-VND receipts must never be silently converted; they trigger an explicit warning for user review. | `server/src/shared/transactions/`, `transaction.schema.js`, `receipt.schema.js` |
| **BR-007** | UTC Calendar Date Integrity | Transaction dates must pass strict UTC round-trip calendar validation so invalid dates (e.g., `2026-02-30`) never silently roll over. | `transaction.schema.js`, shared date validators |
| **BR-008** | Stateless OCR & Atomic Confirmation | `POST /api/receipt/upload` performs stateless OCR without writing to PostgreSQL or Storage. Confirmation (`POST /api/receipt/confirm`) uploads the image to private Storage (`receipts`) and atomically commits `receipts` + `expense_transactions` via `confirm_staged_receipt_transaction` RPC (idempotent per `(user_id, draft_id)`). | `server/src/features/receipt/receipt.service.js`, `202611170009_confirm_staged_receipt_transaction.sql` |
| **BR-009** | Safe Draft Rejection | Rejecting a `TransactionDraft` updates/removes only the browser-local draft and never deletes any previously confirmed `public.receipts` row or Supabase Storage object. | `draftController.js`, `draftStorage.js` |

---

## 3. Unified AI Assistant, RAG & Knowledge Base Rules

| ID | Rule Name | Description | Implementation Evidence |
| :--- | :--- | :--- | :--- |
| **BR-010** | Proposal-Confirmation Safety Gate | AI tools (`search_transactions`, `get_spending_summary`, `search_knowledge_base`, `propose_transaction`) are strictly read-only/proposal-only; no AI tool may mutate `public.expense_transactions`. | `assistantOrchestrator.js`, `expenseAssistant` tool registry |
| **BR-011** | Server-Authoritative Chat History | Chat History (`public.chat_conversations`, `public.chat_messages`) is stored separately from editable `TransactionDraft`s. Historical AI proposals do not automatically become confirmed transactions, and conversation context is loaded from the server database rather than trusting forged client `assistant` turns. | `chatAssistant.service.js`, `202611170010_chat_history.sql`, `202611170012_chat_streaming_lifecycle.sql` |
| **BR-012** | Untrusted RAG Context & Citation Integrity | Retrieved Knowledge Base chunks are wrapped as untrusted reference data (`trust: 'untrusted'`), never concatenated into system instructions. Citations (`[S#]`) are validated against request-scoped retrieved sources before delivery/persistence. | `assistantOrchestrator.js`, `ragService.js`, `responseIntegrity.js` |
| **BR-013** | Git-Managed Prompts & Canonical Docs | System prompts (`server/prompts/`) and Knowledge Base docs (`data/knowledge/`) are Git-managed and read-only at runtime. | `document.route.js`, `systemPrompt.route.js` |
| **BR-014** | Zero-Downtime Qdrant Reindexing | Qdrant is a derived index behind the `spendwise_active` alias. Reindexing builds and verifies a shadow collection (`spendwise_shadow_*`) before switching the active alias, preserving availability if indexing fails. | `qdrantAdapter.js`, `knowledgeBase.route.js` |
