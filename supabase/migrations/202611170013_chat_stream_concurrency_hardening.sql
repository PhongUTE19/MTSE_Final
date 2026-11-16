-- LOCAL ONLY: never apply remotely without approval.
-- Forward-only concurrency hardening for P2-T13 begin_chat_stream_turn RPC.
-- Migration 202611170012_chat_streaming_lifecycle.sql remains untouched.
begin;

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

  -- Concurrency-safe resolve or create owned conversation
  insert into public.chat_conversations (id, user_id, title)
  values (p_conversation_id, v_uid, v_safe_title)
  on conflict (id) do nothing;

  select c.user_id into v_conv_owner
  from public.chat_conversations c
  where c.id = p_conversation_id;

  if not found or v_conv_owner <> v_uid then
    raise exception 'Conversation not found or access denied';
  end if;

  -- Idempotently ensure user message exists (must belong to owner, conversation, and role='user')
  if not exists (
    select 1 from public.chat_messages m
    where m.id = p_user_message_id
      and m.conversation_id = p_conversation_id
      and m.user_id = v_uid
      and m.role = 'user'
  ) then
    insert into public.chat_messages (id, conversation_id, user_id, role, content, status)
    values (p_user_message_id, p_conversation_id, v_uid, 'user', p_user_content, 'completed');
  end if;

  -- Insert streaming assistant attempt row with concurrent duplicate request_id protection
  begin
    insert into public.chat_messages (
      id, conversation_id, user_id, role, content, status, reply_to, request_id
    )
    values (
      p_assistant_message_id, p_conversation_id, v_uid, 'assistant', '', 'streaming', p_user_message_id, p_request_id
    );
  exception when unique_violation then
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
    raise;
  end;

  return query select
    p_conversation_id,
    p_user_message_id,
    p_assistant_message_id,
    'streaming'::text,
    false;
end;
$$;

commit;
