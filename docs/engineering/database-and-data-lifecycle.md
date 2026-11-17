# SpendWise — Canonical Database & Data Lifecycle Reference

> **Status:** Authoritative Local-Schema Reference  
> **Source of Truth:** `supabase/migrations/` (`20261020000000` through `202611170014`) and `client/src/features/transactionDraft/draftStorage.js`  
> **Remote Verification Note:** Migrations `202611170009` through `202611170014` are marked `LOCAL ONLY` in-repo. Remote Supabase migration status is **UNKNOWN / NOT VERIFIED**.

---

## 1. Storage Separation: Authoritative Ledger vs. Browser-Local Staging

SpendWise enforces a strict boundary between unconfirmed candidate data and committed financial records:

| Store | Location | Contents | Sync / Isolation |
| :--- | :--- | :--- | :--- |
| **PostgreSQL (`public.*`)** | Supabase PostgreSQL | Confirmed `expense_transactions`, confirmed `receipts`, `chat_conversations`, `chat_messages`, `ai_usage_analytics` | Protected by Row-Level Security (`auth.uid() = user_id` for user tables; service-role/admin for telemetry). |
| **Supabase Storage** | Private `receipts` bucket | Confirmed receipt images (`<user_id>/<draft_id>/original`) | Uploaded only during `POST /api/receipt/confirm`; accessed via short-lived signed URLs. |
| **Browser IndexedDB** | `client/src/features/transactionDraft/draftStorage.js` | Unconfirmed `TransactionDraft`s (from OCR or AI `propose_transaction`) and unconfirmed receipt image `Blob`s | Scoped by `userId` in browser local storage; not synchronized across devices. |
| **Qdrant Cloud** | Vector Store (`spendwise_active` alias) | Derived 3072-dim cosine embeddings of `data/knowledge/*.md` | Derived index only; canonical documents live in Git. |

---

## 2. Core PostgreSQL Tables (Defined by Local Migrations)

1. **`public.expense_transactions`:** Confirmed single-currency (**VND**) income and expense ledger rows (`id`, `user_id`, `amount`, `type`, `category`, `merchant`, `note`, `transaction_date`, `client_request_id`, `created_at`). RLS enforces `auth.uid() = user_id`.
2. **`public.receipts`:** Confirmed receipt metadata (`id`, `user_id`, `transaction_id`, `draft_id`, `storage_path`, `filename`, `mime_type`, `file_size`, `sha256`, `extraction`, `warnings`, `ai_model`, `prompt_version`, `created_at`). Unique per `(user_id, draft_id)` for idempotent confirmation.
3. **`public.chat_conversations`** (`202611170010`): User-owned conversation headers (`id`, `user_id`, `title`, `created_at`, `updated_at`) with RLS policies (`select`, `insert`, `update`, `delete` where `auth.uid() = user_id`).
4. **`public.chat_messages`** (`202611170010`, extended in `202611170012`): Server-authoritative chat turns (`id`, `conversation_id`, `user_id`, `role`, `content`, `tool_name`, `tool_result`, `sources`, `status` in `streaming|completed|aborted|failed`, `reply_to`, `request_id`, `error_message`, `completed_at`, `created_at`). Unique index on `(user_id, request_id)` enforces stream idempotency.
5. **`public.ai_usage_analytics`** (`20261020000000`, extended in `202610260004`, `202610270007`, `202611170014`): AI telemetry records (`feature`, `model`, `prompt_id`, `input_tokens`, `output_tokens`, `estimated_cost`, `latency_ms`, `usage_source` in `provider_reported|derived|unavailable|unknown`, `created_at`).
6. **Retired Tables (`202611170011`):** `public.transaction_drafts` and `public.receipt_extractions` are dropped by forward-only retirement migration `202611170011_retire_legacy_drafts_and_extractions.sql`.

---

## 3. Active PostgreSQL RPCs

- **`public.confirm_staged_receipt_transaction(...)`** (`202611170009`, `SECURITY DEFINER`, `LOCAL ONLY`): Validates caller identity (`public.receipt_auth_uid()`), storage path ownership (`<uid>/<draft_id>/original`), MIME type, and VND transaction fields, then atomically inserts/replays `public.receipts` + `public.expense_transactions`.
- **`public.begin_chat_stream_turn(...)`** (`202611170012`, hardened in `202611170013`, `SECURITY INVOKER`, `LOCAL ONLY`): Atomically deduplicates `(user_id, request_id)`, resolves/creates an owned conversation, ensures the user message exists, and registers a `streaming` assistant message row.

---

## 4. Migration Inventory & Deployment Safety

- **Baseline (`20261020000000`–`202611160008`):** Telemetry, transaction ownership, receipt security, and legacy draft tables.
- **Pending Remote Verification (`202611170009`–`202611170014`):** Marked `LOCAL ONLY` in-repo. Follow [`docs/engineering/deployment-checklist.md`](./deployment-checklist.md) before applying to any remote Supabase project.
