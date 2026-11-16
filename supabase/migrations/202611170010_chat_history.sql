-- LOCAL ONLY: never apply remotely without approval.
-- Database-backed Chat History: conversations and messages with strict RLS ownership.
begin;

-- ============================================================================
-- 1. CHAT CONVERSATIONS
-- ============================================================================
create table public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New conversation' check (char_length(trim(title)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index chat_conversations_user_updated_idx
  on public.chat_conversations (user_id, updated_at desc);

alter table public.chat_conversations enable row level security;

create policy chat_conversations_select_own
  on public.chat_conversations
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy chat_conversations_insert_own
  on public.chat_conversations
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy chat_conversations_update_own
  on public.chat_conversations
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy chat_conversations_delete_own
  on public.chat_conversations
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- ============================================================================
-- 2. CHAT MESSAGES
-- ============================================================================
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(trim(content)) >= 1),
  tool_name text,
  tool_result jsonb,
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index chat_messages_conversation_created_idx
  on public.chat_messages (conversation_id, created_at asc, id asc);

create index chat_messages_user_id_idx
  on public.chat_messages (user_id);

-- Prevent a message from ever being attached to another user's conversation.
create or replace function public.chat_messages_verify_owner()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1
    from public.chat_conversations c
    where c.id = new.conversation_id
      and c.user_id = new.user_id
  ) then
    raise exception 'chat message conversation ownership mismatch';
  end if;
  return new;
end;
$$;

create trigger chat_messages_verify_owner_trg
  before insert or update of conversation_id, user_id
  on public.chat_messages
  for each row
  execute function public.chat_messages_verify_owner();

-- Keep parent conversation updated_at current when messages are appended.
create or replace function public.chat_messages_touch_conversation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  update public.chat_conversations
  set updated_at = now()
  where id = new.conversation_id
    and user_id = new.user_id;
  return new;
end;
$$;

create trigger chat_messages_touch_conversation_trg
  after insert
  on public.chat_messages
  for each row
  execute function public.chat_messages_touch_conversation();

alter table public.chat_messages enable row level security;

create policy chat_messages_select_own
  on public.chat_messages
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy chat_messages_insert_own
  on public.chat_messages
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.chat_conversations c
      where c.id = conversation_id
        and c.user_id = auth.uid()
    )
  );

create policy chat_messages_delete_own
  on public.chat_messages
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- ============================================================================
-- 3. GRANTS
-- ============================================================================
revoke all on public.chat_conversations, public.chat_messages from public, anon;
grant select, insert, update, delete on public.chat_conversations to authenticated;
grant select, insert, delete on public.chat_messages to authenticated;

commit;
