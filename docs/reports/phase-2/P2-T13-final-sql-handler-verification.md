# P2-T13 — Final SQL Concurrency Handler Verification

**Date:** `2026-11-17`  
**Mode:** Read-Only Verification  
**Target File:** `supabase/migrations/202611170013_chat_stream_concurrency_hardening.sql`

---

## 1. SQL Code Path Inspected

Inspected the complete `public.begin_chat_stream_turn(...)` PL/pgSQL function (`SECURITY INVOKER`, `search_path = pg_catalog, public`) in `supabase/migrations/202611170013_chat_stream_concurrency_hardening.sql` (lines `1–113`), specifically:
- Pre-check for duplicate `(v_uid, p_request_id)` (`lines 36–50`).
- Conversation resolution/creation (`lines 53–63`).
- User message idempotency check/insert (`lines 66–75`).
- Inner `BEGIN ... EXCEPTION WHEN unique_violation` subtransaction (`lines 78–102`).

---

## 2. Exact Exception-Handling Behavior

Inside the inner subblock (`lines 78–102`), **only one SQL statement** executes:
```sql
insert into public.chat_messages (
  id, conversation_id, user_id, role, content, status, reply_to, request_id
)
values (
  p_assistant_message_id, p_conversation_id, v_uid, 'assistant', '', 'streaming', p_user_message_id, p_request_id
);
```

When `unique_violation` (`SQLSTATE 23505`) is raised inside lines `78–84`:
1. PL/pgSQL rolls back **only** the inner subblock (`lines 78–84`), leaving the outer transaction intact.
2. The `EXCEPTION WHEN unique_violation` handler (`lines 85–102`) executes:
   ```sql
   select m.id, m.conversation_id, m.reply_to, m.status
   into v_existing_assistant
   from public.chat_messages m
   where m.user_id = v_uid
     and m.request_id = p_request_id;
   ```
3. If `found` is true, it returns `(v_existing_assistant.conversation_id, v_existing_assistant.reply_to, v_existing_assistant.id, v_existing_assistant.status, true)`.
4. If `found` is false, `raise;` (`line 101`) re-raises the original `unique_violation`.

---

## 3. Can Unrelated Unique Violations Be Misclassified?

**No.**
- Inside lines `78–84`, the only unique constraints on `public.chat_messages` are:
  1. `chat_messages_user_request_id_uidx` on `(user_id, request_id) where request_id is not null` (`202611170012`).
  2. `chat_messages_pkey` on `(id)` (`202611170010`).
- If `unique_violation` is raised by `chat_messages_pkey` (an unrelated `p_assistant_message_id` collision with a different `request_id` or different owner) or when `p_request_id IS NULL`, the `SELECT ... WHERE m.user_id = v_uid AND m.request_id = p_request_id` query finds **zero** rows (`found = false`), and `raise;` (`line 101`) re-raises the original exception.
- Ownership/trigger mismatches (`chat_messages_verify_owner_trg`) raise `P0001` (`raise_exception`), not `unique_violation`, and are never caught by this handler.

---

## 4. Duplicate-Recovery Correctness

- In PostgreSQL `READ COMMITTED`, if concurrent Request B collides with winning Request A on `chat_messages_user_request_id_uidx`, Request B waits for Request A to commit, catches `unique_violation`, and its subsequent `SELECT` (`lines 86–90`) sees Request A's committed row.
- The handler returns Request A's committed `conversation_id`, `reply_to` (existing `user_message_id`), `id` (existing `assistant_message_id`), `status`, and `is_duplicate = true`, without creating or modifying any records.
- **Note (Informational):** Because the `'user'` message insert at `lines 66–75` sits outside the inner `EXCEPTION` block and uses `IF NOT EXISTS ... INSERT` without `ON CONFLICT (id) DO NOTHING`, a simultaneous race on a brand-new `p_user_message_id` fails loudly with `23505` rather than misclassifying or duplicating rows.
- **Live DB Verification:** Not executed against a live PostgreSQL instance in this read-only audit (`[U]`).

---

## 5. Confirmed Defect or No Defect

**No defect** in the `EXCEPTION WHEN unique_violation` handler's classification or recovery logic.

---

## 6. Minimal Correction Proposal

None required for the `EXCEPTION WHEN unique_violation` handler.

---

## 7. Final Recommendation

**PASS**
