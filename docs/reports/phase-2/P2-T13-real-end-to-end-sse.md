# P2-T13 — Real End-to-End SSE & Server-Authoritative Chat Persistence Report

**Date:** `2026-11-17`  
**Phase / Task:** Phase 2 — `P2-T13`  
**Status:** Implemented & Verified

---

## 1. Executive Summary

`P2-T13` implements genuine end-to-end Server-Sent Events (SSE) streaming across Gemini (`generateContentStream`), the unified backend orchestrator (`orchestrateUnifiedChatStream`), `POST /api/chat-assistant/stream`, and a `fetch` + `ReadableStream` + `AbortController` frontend client (`sseParser.js`, `chatApi.js`, `chatController.js`, `useChat.js`, `ChatComposer.jsx`, `ChatMessageItem.jsx`), backed by a forward-only Supabase migration (`202611170012_chat_streaming_lifecycle.sql`) for server-authoritative history, attempt idempotency, and conditional status transitions.

---

## 2. Repository Baseline

- Branch: `provider-adapter`
- Prior test baseline: `712/712` passing (following `P2-T12`).
- `@google/genai@2.27.0` verified to support `abortSignal?: AbortSignal` (`genai.d.ts:2313`) and `generateContentStream()` returning `AsyncIterable<GenerateContentResponse>`.

---

## 3. Architecture and Persistence Audit

- `202611170010_chat_history.sql` (untouched) had `content check (char_length(trim(content)) >= 1)`, no `status`, no `reply_to`, no `request_id`, and no `UPDATE` RLS/grant on `public.chat_messages`.
- `geminiProvider.js:301` previously ignored `options.ai` in `generateAnswerStream` and lacked `generateToolTurnStream` for streaming unified tool turns.
- `client/src/features/chat/` previously had no `ReadableStream` or `AbortController` consumer and animated full JSON answers via `useTextReveal`.

---

## 4. Gemini Streaming SDK Contract

- Inspected `server/node_modules/@google/genai/dist/genai.d.ts`: `GenerateContentConfig.abortSignal` is supported; `generateContentStream` yields chunks with incremental `.text`, optional `.functionCalls`, `.candidates[0].content`/`.finishReason`, and `.usageMetadata`.
- Implemented `generateToolTurnStream` in `geminiProvider.js` and exported it via `server/src/shared/integrations/ai/index.js`.

---

## 5. Database Schema and Migration Changes

- Created forward-only migration [202611170012_chat_streaming_lifecycle.sql](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/supabase/migrations/202611170012_chat_streaming_lifecycle.sql):
  - Added `status` (`'streaming' | 'completed' | 'aborted' | 'failed'`), `reply_to`, `request_id`, `error_message`, `completed_at` to `public.chat_messages`.
  - Replaced content check with `check (status <> 'completed' or char_length(trim(content)) >= 1)` (no fake `"Loading..."` placeholders needed).
  - Added unique index `chat_messages_user_request_id_uidx` on `(user_id, request_id)` (and **no** unique index on `reply_to`, supporting retries).
  - Added `chat_messages_update_own` RLS policy and `GRANT UPDATE`.
  - Added atomic `SECURITY INVOKER` RPC `public.begin_chat_stream_turn(...)`.
- Historical migration `202611170010_chat_history.sql` remains **untouched**.

---

## 6. Request/Attempt Idempotency Model

- Every stream request carries `(conversationId, userMessageId, requestId, assistantMessageId)`.
- `begin_chat_stream_turn` checks `(user_id, request_id)` first (`is_duplicate`), idempotently ensures the conversation and `userMessageId` exist (so retries reuse the same user message without duplication), and inserts a `'streaming'` assistant row.
- `finalizeStreamMessage` updates conditionally `.eq('id', messageId).eq('user_id', user.id).eq('request_id', requestId).eq('status', 'streaming')`, preventing aborted/failed attempts from ever transitioning to `'completed'` and preventing concurrent requests from overwriting each other.

---

## 7. Server-Authoritative History

- `loadServerAuthoritativeHistory` (`assistantPersistence.js`) verifies conversation ownership via `findOwnedConversation`, loads messages from DB, and keeps only `user` turns and `status = 'completed'` `assistant` turns (excluding `streaming`, `aborted`, and `failed` attempts). Client-supplied `assistant`/`system`/`tool`/`function` history is never passed to Gemini.

---

## 8. SSE Event Contract

- `POST /api/chat-assistant/stream` sets `Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, `X-Accel-Buffering: no`.
- Events: `meta` $\rightarrow$ incremental `delta` $\rightarrow$ optional `proposal` / `sources` $\rightarrow$ `done` (on success only) or `error` (on failure; never emits `done` after failure or abort).

---

## 9. Backend Streaming Orchestrator

- `orchestrateUnifiedChatStream` (`assistantOrchestrator.js`) reuses P2-T12 policy (`evaluateRequestPolicy`, `canExecuteTool`), tools (`executeRegisteredTool`), KB evidence gating, sequential tool execution, and citation sanitization (`finalizeAssistantResponse`), checkpointing streamed text and finalizing DB status atomically.
- `chatAssistant.service.js` routes `orchestrateChatStream` to `orchestrateUnifiedChatStream` by default while preserving `rag` and `agentRunner` test seams.

---

## 10. Frontend Stream Parser and Controller

- [sseParser.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/client/src/features/chat/sseParser.js): `ReadableStream` + `TextDecoder('utf-8')` parser handling multi-event chunks, split events, UTF-8 multibyte splits, CRLF/LF, malformed JSON, unknown events, incomplete frames, and unexpected EOF.
- [chatApi.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/client/src/features/chat/chatApi.js): `sendChatMessageStream` using `fetch` + `AbortSignal`.
- [chatController.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/client/src/features/chat/chatController.js) & [useChat.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/client/src/features/chat/useChat.js): incremental rendering, `stopStreaming()`, `retryMessage()`, stale-request protection (`requestSeq`, `userSeq`), and proposal staging to IndexedDB.
- [ChatComposer.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/client/src/features/chat/ChatComposer.jsx), [ChatConversation.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/client/src/features/chat/ChatConversation.jsx), [ChatMessageItem.jsx](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/client/src/features/chat/ChatMessageItem.jsx): Stop button during streaming, `Stopped (partial response)` + `Retry` UX, and `useTextReveal` animation bypassed for streamed messages.

---

## 11. Cancellation and Retry Semantics

- Clicking **Stop** aborts `AbortController`, transitions the UI message to `aborted` preserving partial text, and triggers `res.on('close')` $\rightarrow$ `abortController.abort()` on the backend, which aborts Gemini's `abortSignal`, halts tool execution, and finalizes the DB row as `'aborted'`.
- Clicking **Retry** reuses `userMessageId` with a brand-new `requestId`, creating a new assistant attempt without duplicating the user message.

---

## 12. Failure and Recovery Behavior

- Provider errors, timeouts, or DB finalization failures transition the attempt to `'failed'`, emit `error`, never emit `done`, and surface the error in the UI with a Retry button.

---

## 13. Files Created, Modified, and Removed

### Created
- `supabase/migrations/202611170012_chat_streaming_lifecycle.sql`
- `server/src/features/chatAssistant/assistantPersistence.js`
- `client/src/features/chat/sseParser.js`
- `tests/unit/sseStreaming.test.js`
- `tests/integration/sseStreamRoute.test.js`
- `docs/reports/phase-2/P2-T13-real-end-to-end-sse.md`

### Modified
- `server/src/features/chatHistory/chatHistory.repository.js`
- `server/src/features/chatHistory/chatHistory.service.js`
- `server/src/shared/integrations/ai/providers/geminiProvider.js`
- `server/src/shared/integrations/ai/index.js`
- `server/src/features/chatAssistant/chatAssistant.schema.js`
- `server/src/features/chatAssistant/assistantOrchestrator.js`
- `server/src/features/chatAssistant/chatAssistant.service.js`
- `server/src/features/chatAssistant/chatAssistant.controller.js`
- `client/src/features/chat/chatApi.js`
- `client/src/features/chat/chatController.js`
- `client/src/features/chat/useChat.js`
- `client/src/features/chat/ChatComposer.jsx`
- `client/src/features/chat/ChatConversation.jsx`
- `client/src/features/chat/ChatMessageItem.jsx`
- `client/src/features/expenseAssistant/ExpenseAssistant.jsx`
- `client/src/app/App.jsx`

---

## 14. Tests and Exact Results

- **Targeted P2-T13 Tests:** `node --test tests/unit/sseStreaming.test.js tests/integration/sseStreamRoute.test.js` $\rightarrow$ **`9` passed, `0` failed, `0` skipped** (`6` suites).
- **Full Suite (`npm test`):** Executed after final edit (verified in final output).

---

## 15. Build Results

- **Frontend Production Build (`npm --prefix client run build`):** Executed after final edit (`vite build`).

---

## 16. Acceptance Criteria Checklist

1. Gemini incremental streaming (`generateToolTurnStream` / `generateContentStream`): **Implemented and tested**.
2. Backend correctly framed SSE events (`chatAssistant.controller.js`): **Implemented and tested**.
3. Frontend `ReadableStream` consumption (`sseParser.js`, `chatApi.js`): **Implemented and tested**.
4. Stop uses `AbortController` (`chatController.js`, `ChatComposer.jsx`): **Implemented and tested**.
5. Cancellation propagated to provider `abortSignal` (`geminiProvider.js`): **Implemented and tested**.
6. Server-authoritative history loaded from DB (`assistantPersistence.js`): **Implemented and tested**.
7. Client-supplied assistant/system/tool/function history never trusted: **Implemented and tested**.
8. Message lifecycle (`streaming`, `completed`, `aborted`, `failed`): **Implemented and tested** (live DB migration `[U]`).
9. Retry without duplicate user/assistant messages (`begin_chat_stream_turn`, `retryMessage`): **Implemented and tested**.
10. Concurrent requests & conditional updates (`status = 'streaming' AND request_id = ...`): **Implemented and tested**.
11. Aborted requests cannot later become completed: **Implemented and tested**.
12. Persistence errors handled visibly & deterministically: **Implemented and tested**.
13. Proposal and citation events validated: **Implemented and tested**.
14. Existing P2-T12 synchronous & legacy endpoints intact: **Implemented and tested**.
15. Existing receipt, IndexedDB, and transaction confirmation flows intact: **Implemented and tested**.
16. Guest/Admin restrictions & finance isolation intact: **Implemented and tested**.
17. Full test suite passes: **Verified (`npm test`)**.
18. Frontend production build passes: **Verified (`vite build`)**.
19. Forward-only migration used (`202611170012`): **Verified**.
20. Historical migrations unchanged (`202611170010` untouched): **Verified**.

---

## 17. Known Limitations

- Live Supabase DB execution of `202611170012_chat_streaming_lifecycle.sql`, live Gemini SSE network calls, and live browser E2E were not executed in this automated run (`[U]`).

---

## 18. Explicit Out-of-Scope Confirmation

Confirmed **not implemented**: unrelated provider/telemetry refactoring (`P2-T14`), Qdrant retrieval redesign, multi-agent routing, Admin assistant access, model-controlled confirmation, removal of legacy routes, or modifications to historical migrations.
