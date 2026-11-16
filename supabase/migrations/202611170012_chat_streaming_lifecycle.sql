-- LOCAL ONLY: never apply remotely without approval.
-- Forward-only migration for P2-T13: SSE streaming message lifecycle, request idempotency,
-- conditional status transitions, and atomic turn registration.
begin;

-- 1. Extend public.chat_messages with lifecycle status, reply_to, request_id, error_message, completed_at
alter table public.chat_messages
  add column if not exists status text not null default 'completed'
    check (status in ('streaming', 'completed', 'aborted', 'failed')),
  add column if not exists reply_to uuid references public.chat_messages(id) on delete set null,
  add column if not exists request_id uuid,
  add column if not exists error_message text,
  add column if not exists completed_at timestamptz;

-- Replace legacy non-empty content constraint so streaming/aborted/failed rows may hold empty/partial content,
-- while completed messages still require non-empty trimmed content.
alter table public.chat_messages
  drop constraint if exists chat_messages_content_check;

alter table public.chat_messages
  add constraint chat_messages_completed_content_check
    check (status <> 'completed' or char_length(trim(content)) >= 1);

-- Idempotency per user + request_id (do NOT put a unique index on reply_to so retries are supported).
create unique index if not exists chat_messages_user_request_id_uidx
  on public.chat_messages (user_id, request_id)
  where request_id is not null;

create index if not exists chat_messages_reply_to_idx
  on public.chat_messages (reply_to)
  where reply_to is not null;

-- 2. Allow authenticated users to update their own chat_messages (for streaming checkpoints & finalization)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'chat_messages'
      and policyname = 'chat_messages_update_own'
  ) then
    create policy chat_messages_update_own
      on public.chat_messages
      for update
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

grant update on public.chat_messages to authenticated;

-- 3. Atomic RPC to resolve/create owned conversation, idempotently ensure user message,
-- and register a new streaming assistant attempt without duplicating user messages on retry.
create or replace function public.begin_chat_stream_turn(
  p_conversation_id uuid,
  p_title text,
  p_user_message_id uuid,
  p_user_content text,
  p_assistant_message_id uuid,
  p_request_id uuid
)
returns table (
  conversation_id uuid,
  user_message_id uuid,
  assistant_message_id uuid,
  status text,
  is_duplicate boolean
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_existing_assistant record;
  v_conv_owner uuid;
  v_safe_title text := left(coalesce(nullif(trim(p_title), ''), 'New conversation'), 120);
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  -- Idempotent duplicate request check
  select m.id, m.conversation_id, m.reply_to, m.status
  into v_existing_assistant
  from public.chat_messages m
  where m.user_id = v_uid
    and m.request_id = p_request_id;

  if found then
    return query select
      v_existing_assistant.conversation_id,
      v_existing_assistant.reply_to,
      v_existing_assistant.id,
      v_existing_assistant.status,
      true;
    return;
  end if;

  -- Resolve or create owned conversation
  select c.user_id into v_conv_owner
  from public.chat_conversations c
  where c.id = p_conversation_id;

  if not found then
    insert into public.chat_conversations (id, user_id, title)
    values (p_conversation_id, v_uid, v_safe_title);
  elsif v_conv_owner <> v_uid then
    raise exception 'Conversation not found or access denied';
  end if;

  -- Idempotently ensure user message exists (supports retry against existing user message)
  if not exists (
    select 1 from public.chat_messages m
    where m.id = p_user_message_id
      and m.conversation_id = p_conversation_id
      and m.user_id = v_uid
  ) then
    insert into public.chat_messages (id, conversation_id, user_id, role, content, status)
    values (p_user_message_id, p_conversation_id, v_uid, 'user', p_user_content, 'completed');
  end if;

  -- Insert streaming assistant attempt row
  insert into public.chat_messages (
    id, conversation_id, user_id, role, content, status, reply_to, request_id
  )
  values (
    p_assistant_message_id, p_conversation_id, v_uid, 'assistant', '', 'streaming', p_user_message_id, p_request_id
  );

  return query select
    p_conversation_id,
    p_user_message_id,
    p_assistant_message_id,
    'streaming'::text,
    false;
end;
$$;

revoke all on function public.begin_chat_stream_turn(uuid, text, uuid, text, uuid, uuid) from public, anon;
grant execute on function public.begin_chat_stream_turn(uuid, text, uuid, text, uuid, uuid) to authenticated;

commit;
