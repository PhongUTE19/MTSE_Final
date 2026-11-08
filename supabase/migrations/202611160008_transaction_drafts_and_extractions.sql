-- LOCAL ONLY: never apply remotely without approval. Transaction drafts and immutable receipt extraction attempts.
begin;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'receipt_lifecycle_owner') then
    create role receipt_lifecycle_owner nologin noinherit nosuperuser nocreatedb nocreaterole noreplication;
  end if;
exception when insufficient_privilege then
  raise exception 'receipt_lifecycle_owner must be provisioned by a Supabase database administrator before this migration';
end $$;

grant receipt_lifecycle_owner to postgres;
grant usage, create on schema public to receipt_lifecycle_owner;

-- ============================================================================
-- 1. RECEIPT EXTRACTIONS (Append-only immutable audit history per attempt)
-- ============================================================================
create table public.receipt_extractions (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  attempt integer not null check (attempt >= 1),
  status text not null check (status in ('succeeded', 'failed')),
  result jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  error_code text,
  ai_model text,
  prompt_version text,
  created_at timestamptz not null default now(),
  constraint uq_receipt_extractions_receipt_attempt unique (receipt_id, attempt)
);

create index receipt_extractions_receipt_id_idx on public.receipt_extractions(receipt_id);
create index receipt_extractions_user_created_idx on public.receipt_extractions(user_id, created_at desc);

-- Immutability enforcement: extraction attempt history must never be updated
create or replace function public.receipt_extractions_immutable_trigger()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'receipt_extractions records are immutable';
end;
$$;

create trigger receipt_extractions_immutable
before update on public.receipt_extractions
for each row
execute function public.receipt_extractions_immutable_trigger();

alter function public.receipt_extractions_immutable_trigger() owner to receipt_lifecycle_owner;

-- RLS on receipt_extractions: users can select their own; server/owner creates records
alter table public.receipt_extractions enable row level security;

create policy receipt_extractions_select_own on public.receipt_extractions
  for select to authenticated
  using (auth.uid() = user_id);

create policy receipt_extractions_lifecycle_owner_select on public.receipt_extractions
  for select to receipt_lifecycle_owner
  using (user_id = public.receipt_auth_uid() or public.receipt_auth_role() = 'service_role');

create policy receipt_extractions_lifecycle_owner_insert on public.receipt_extractions
  for insert to receipt_lifecycle_owner
  with check (user_id = public.receipt_auth_uid() or public.receipt_auth_role() = 'service_role');

revoke all on table public.receipt_extractions from public, anon, authenticated;
grant select on public.receipt_extractions to authenticated;
grant select, insert on public.receipt_extractions to receipt_lifecycle_owner;
grant select, insert on public.receipt_extractions to service_role;

-- ============================================================================
-- 2. TRANSACTION DRAFTS (Unified staging table for receipt & assistant drafts)
-- ============================================================================
create table public.transaction_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('receipt_extraction', 'assistant_proposal')),
  receipt_id uuid references public.receipts(id) on delete cascade,
  receipt_extraction_id uuid references public.receipt_extractions(id) on delete cascade,
  source_ref text,
  original_data jsonb not null default '{}'::jsonb,
  reviewed_data jsonb,
  status text not null default 'pending_review' check (status in ('pending_review', 'confirmed', 'rejected')),
  transaction_id uuid unique references public.expense_transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  rejected_at timestamptz,
  constraint chk_transaction_drafts_source check (
    (source_type = 'receipt_extraction' and receipt_id is not null) or
    (source_type = 'assistant_proposal')
  ),
  constraint uq_transaction_drafts_extraction unique (receipt_extraction_id)
);

create index transaction_drafts_user_status_idx on public.transaction_drafts(user_id, status);
create index transaction_drafts_receipt_id_idx on public.transaction_drafts(receipt_id);
create index transaction_drafts_extraction_id_idx on public.transaction_drafts(receipt_extraction_id);

create or replace function public.set_transaction_drafts_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger transaction_drafts_set_updated_at
before update on public.transaction_drafts
for each row
execute function public.set_transaction_drafts_updated_at();

alter function public.set_transaction_drafts_updated_at() owner to receipt_lifecycle_owner;

-- RLS on transaction_drafts
alter table public.transaction_drafts enable row level security;

create policy transaction_drafts_select_own on public.transaction_drafts
  for select to authenticated
  using (auth.uid() = user_id);

create policy transaction_drafts_insert_own on public.transaction_drafts
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy transaction_drafts_update_own on public.transaction_drafts
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy transaction_drafts_lifecycle_owner_select on public.transaction_drafts
  for select to receipt_lifecycle_owner
  using (user_id = public.receipt_auth_uid() or public.receipt_auth_role() = 'service_role');

create policy transaction_drafts_lifecycle_owner_insert on public.transaction_drafts
  for insert to receipt_lifecycle_owner
  with check (user_id = public.receipt_auth_uid() or public.receipt_auth_role() = 'service_role');

create policy transaction_drafts_lifecycle_owner_update on public.transaction_drafts
  for update to receipt_lifecycle_owner
  using (user_id = public.receipt_auth_uid() or public.receipt_auth_role() = 'service_role')
  with check (user_id = public.receipt_auth_uid() or public.receipt_auth_role() = 'service_role');

revoke all on table public.transaction_drafts from public, anon, authenticated;
grant select, insert, update on public.transaction_drafts to authenticated;
grant select, insert, update on public.transaction_drafts to receipt_lifecycle_owner;
grant select, insert, update on public.transaction_drafts to service_role;

-- Revoke temporary elevation
revoke create on schema public from receipt_lifecycle_owner;
revoke receipt_lifecycle_owner from postgres;

commit;
