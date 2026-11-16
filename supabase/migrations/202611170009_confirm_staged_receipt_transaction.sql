-- LOCAL ONLY: never apply remotely without approval.
-- Atomic confirmation RPC for stateless receipt OCR + client-staged drafts.
begin;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'receipt_lifecycle_owner') then
    raise exception 'receipt_lifecycle_owner is missing; apply 202610230002_secure_receipts.sql first';
  end if;
end $$;

grant receipt_lifecycle_owner to postgres;
grant usage, create on schema public to receipt_lifecycle_owner;

create or replace function public.confirm_staged_receipt_transaction(
  p_draft_id text,
  p_storage_path text,
  p_filename text,
  p_mime_type text,
  p_file_size integer,
  p_sha256 text,
  p_final_transaction jsonb,
  p_extraction jsonb default '{}'::jsonb,
  p_warnings jsonb default '[]'::jsonb,
  p_ai_model text default null,
  p_prompt_version text default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := public.receipt_auth_uid();
  v_draft_id text := trim(coalesce(p_draft_id, ''));
  v_expected_path text;
  v_amount numeric;
  v_type text;
  v_date text;
  v_category text;
  v_merchant text;
  v_note text;
  v_items jsonb;
  r public.receipts;
  tx public.expense_transactions;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  if v_draft_id = '' or v_draft_id ~ '[/\\]' or v_draft_id like '%..%' then
    raise exception 'invalid draft id';
  end if;

  v_expected_path := v_uid::text || '/' || v_draft_id || '/original';
  if coalesce(p_storage_path, '') <> v_expected_path then
    raise exception 'storage path does not match authenticated user and draft';
  end if;

  if coalesce(p_mime_type, '') not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'unsupported receipt mime type';
  end if;

  if coalesce(p_file_size, 0) < 1 or p_file_size > 5242880 then
    raise exception 'invalid receipt file size';
  end if;

  if coalesce(p_sha256, '') !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid receipt checksum';
  end if;

  v_type := coalesce(p_final_transaction->>'type', '');
  v_amount := coalesce((p_final_transaction->>'amount')::numeric, 0);
  v_date := coalesce(p_final_transaction->>'date', '');
  v_category := trim(coalesce(p_final_transaction->>'category', ''));
  v_merchant := trim(coalesce(p_final_transaction->>'merchant', ''));
  v_note := coalesce(p_final_transaction->>'note', '');
  v_items := coalesce(p_final_transaction->'items', '[]'::jsonb);

  if v_amount <= 0
     or v_merchant = ''
     or v_category = ''
     or v_date !~ '^\d{4}-\d{2}-\d{2}$'
     or v_type not in ('income', 'expense') then
    raise exception 'invalid transaction';
  end if;

  -- Serialize concurrent confirmation attempts for the same (user_id, draft_id).
  perform pg_advisory_xact_lock(hashtext(v_uid::text || ':' || v_draft_id));

  select * into r
  from public.receipts
  where storage_path = v_expected_path
  for update;

  if found then
    if r.user_id <> v_uid then
      raise exception 'receipt ownership mismatch';
    end if;

    select * into tx
    from public.expense_transactions
    where id = r.transaction_id and user_id = v_uid;

    if not found or r.status <> 'confirmed' then
      raise exception 'conflicting draft confirmation';
    end if;

    if r.sha256 <> p_sha256
       or tx.type <> v_type
       or tx.amount <> v_amount
       or tx.transaction_date <> v_date::date
       or tx.category <> v_category
       or tx.merchant <> v_merchant
       or coalesce(tx.note, '') <> v_note
       or coalesce(tx.items, '[]'::jsonb) <> v_items then
      raise exception 'conflicting draft confirmation';
    end if;

    return jsonb_build_object(
      'receipt', to_jsonb(r),
      'transaction', to_jsonb(tx),
      'idempotent', true
    );
  end if;

  insert into public.expense_transactions (
    user_id, type, amount, transaction_date, category, merchant, note, items
  ) values (
    v_uid, v_type, v_amount, v_date::date, v_category, v_merchant, v_note, v_items
  )
  returning * into tx;

  insert into public.receipts (
    user_id,
    storage_path,
    original_filename,
    mime_type,
    file_size,
    sha256,
    status,
    extraction,
    warnings,
    ai_model,
    prompt_version,
    transaction_id,
    confirmed_at
  ) values (
    v_uid,
    v_expected_path,
    left(coalesce(nullif(trim(p_filename), ''), 'receipt'), 150),
    p_mime_type,
    p_file_size,
    p_sha256,
    'confirmed',
    coalesce(p_extraction, '{}'::jsonb),
    coalesce(p_warnings, '[]'::jsonb),
    p_ai_model,
    p_prompt_version,
    tx.id,
    now()
  )
  returning * into r;

  return jsonb_build_object(
    'receipt', to_jsonb(r),
    'transaction', to_jsonb(tx),
    'idempotent', false
  );
end;
$$;

alter function public.confirm_staged_receipt_transaction(
  text, text, text, text, integer, text, jsonb, jsonb, jsonb, text, text
) owner to receipt_lifecycle_owner;

revoke all on function public.confirm_staged_receipt_transaction(
  text, text, text, text, integer, text, jsonb, jsonb, jsonb, text, text
) from public, anon, service_role;

grant execute on function public.confirm_staged_receipt_transaction(
  text, text, text, text, integer, text, jsonb, jsonb, jsonb, text, text
) to authenticated;

revoke create on schema public from receipt_lifecycle_owner;
revoke receipt_lifecycle_owner from postgres;

commit;
