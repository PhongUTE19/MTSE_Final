-- LOCAL ONLY: never apply remotely without live database audit approval.
-- Forward-only retirement of legacy server-side transaction_drafts and receipt_extractions.
-- Preserves public.receipts, public.expense_transactions, Storage objects,
-- confirm_staged_receipt_transaction, and P2-T08 chat history tables.
begin;

-- 1. Retire public.transaction_drafts (depends on public.receipt_extractions)
drop trigger if exists transaction_drafts_set_updated_at on public.transaction_drafts;
drop table if exists public.transaction_drafts;
drop function if exists public.set_transaction_drafts_updated_at();

-- 2. Retire public.receipt_extractions
drop trigger if exists receipt_extractions_immutable on public.receipt_extractions;
drop table if exists public.receipt_extractions;
drop function if exists public.receipt_extractions_immutable_trigger();

commit;
