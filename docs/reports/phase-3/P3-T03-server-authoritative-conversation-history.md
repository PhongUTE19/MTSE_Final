# P3-T03 — Server-Authoritative Conversation History Report

**Phase:** Phase 3 — AI Architecture  
**Task:** P3-T03 — Server-Authoritative Conversation History  
**Branch / HEAD:** `provider-adapter` (post P3-T02)  
**Date:** `2026-11-17`  
**Final Recommendation:** **ACCEPT**

---

## 1. Initial Baseline

- **Branch:** `provider-adapter` (after `P3-T02`)
- **Pre-Task Test Baseline:** `733` passed, `0` failed, `0` skipped across `212` suites (`npm test`).
- **Pre-Task Build Baseline:** `npm --prefix client run build` passed (`269` modules transformed).

---

## 2. Root Cause and Affected Execution Paths

1. **Trusted vs. Untrusted Conflation:** `loadServerAuthoritativeHistory` (`server/src/features/chatAssistant/assistantPersistence.js`) loaded up to `16` `user` and `completed` `assistant` rows from `chat_messages`, and `orchestrateUnifiedChatStream` (`assistantOrchestrator.js`) passed them directly into `evaluateRequestPolicy({ message, history })` (`assistantPolicy.js`).
2. **Self-Denial & Assistant Stripping:** `evaluateRequestPolicy` unconditionally ran `sanitizeClientHistory(history)`, which (a) rejected any array with `> 8` items (`statusCode: 400`) and (b) dropped all `role !== 'user'` turns.
3. **Post-Header Validation Timing:** `chatAssistant.controller.js:chatStream` flushed SSE headers (`200 OK`, `text/event-stream`) before `orchestrateUnifiedChatStream` loaded and validated history, causing 400/DB errors to occur after SSE headers were already committed.
4. **Sync vs. Stream Inconsistency:** `orchestrateUnifiedChat` did not load server-authoritative history when persistence/DB seams were active, and `buildUnifiedUserPrompt` (`assistantPrompt.js`) labeled every history turn as `Prior user message N`.

---

## 3. Implementation Details

- **[assistantPersistence.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/server/src/features/chatAssistant/assistantPersistence.js):**
  - Added and exported `formatAuthoritativeHistory(rows)` and `MAX_AUTHORITATIVE_HISTORY_TURNS = 16`.
  - Validates DB rows deterministically (rejects non-arrays, malformed objects, unsupported roles such as `'system'`/`'tool'`, and non-string content on completed messages with `AppError(..., 400)` without coercing invalid roles into `'user'`).
  - Skips non-completed assistant attempts (`streaming`, `aborted`, `failed`), preserves chronological order, and retains the 16-turn DB limit.
- **[assistantPolicy.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/server/src/features/chatAssistant/assistantPolicy.js):**
  - Kept `sanitizeClientHistory` strictly unchanged for untrusted client-supplied history (`max 8`, `user`-only).
  - Added `validateTrustedHistory(rawTrustedHistory)` for already-formatted server-authoritative turns (`user` and `assistant`).
  - Updated `evaluateRequestPolicy({ message, history, trustedHistory })` to route `trustedHistory` through `validateTrustedHistory` (never `sanitizeClientHistory`) and check `user` turns for prompt injection.
- **[assistantPrompt.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/server/src/features/chatAssistant/assistantPrompt.js):**
  - Updated `buildUnifiedUserPrompt` to render `<conversation_history>` with chronological `User:` / `Assistant:` turns when assistant turns are present, while preserving `<untrusted_prior_user_messages>` for client-supplied user-only history.
- **[assistantOrchestrator.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/server/src/features/chatAssistant/assistantOrchestrator.js):**
  - Updated `orchestrateUnifiedChat` and `orchestrateUnifiedChatStream` to load and pass `trustedHistory` consistently when authoritative persistence/DB seams are active.
  - Added `prepareUnifiedChatStream` to load `trustedHistory` and evaluate `400`-level policy validation before SSE headers are committed.
- **[chatAssistant.service.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/server/src/features/chatAssistant/chatAssistant.service.js) & [chatAssistant.controller.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/server/src/features/chatAssistant/chatAssistant.controller.js):**
  - Added `prepareChatStream` and invoked it in `chatStream` *before* `res.setHeader` / `res.flushHeaders()`, passing preloaded `trustedHistory` into `orchestrateChatStream`.

---

## 4. Trust-Boundary Explanation

| History Source | Trust Boundary | Validator / Formatter | Allowed Roles | Turn Limit |
| :--- | :--- | :--- | :--- | :--- |
| `req.body.history` (client-supplied) | **Untrusted** | `sanitizeClientHistory` | `user` only (`assistant`, `system`, `tool`, `functionCall`/`functionResponse` dropped) | `8` turns |
| `chat_messages` (DB-loaded via `findOwnedConversation` + `listConversationMessages` with user-scoped RLS) | **Server-Authoritative** | `formatAuthoritativeHistory` + `validateTrustedHistory` | `user` and `completed` `assistant` only (unsupported roles rejected with 400; `streaming`/`aborted`/`failed` skipped) | `16` turns |

---

## 5. Regression Tests

Added [tests/unit/p3T03ServerAuthoritativeHistory.test.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/tests/unit/p3T03ServerAuthoritativeHistory.test.js) (9 tests across 3 suites) covering:
1. Valid `user` + `completed` `assistant` chronological preservation (skipping `aborted`/`failed`).
2. Conversations with > 8 turns (16–20 rows) preserved without `sanitizeClientHistory` rejection and sliced to `16`.
3. Deterministic 400 rejection for malformed or unsupported DB roles (`system`, `tool`, non-array, `null`) without role coercion.
4. Cross-user conversation isolation (`404` $\rightarrow$ `[]`, `403` $\rightarrow$ rejected).
5. Untrusted client-history security contract (`assistant`, `system`, `tool`, `functionCall`/`functionResponse` dropped; > 8 turns rejected).
6. `buildUnifiedUserPrompt` chronological `User:` / `Assistant:` formatting.
7. Sync (`orchestrateUnifiedChat`) and stream (`orchestrateUnifiedChatStream`) orchestrators receiving full > 8-turn `user` + `assistant` context.
8. Pre-SSE header failure in `chatController.chatStream` when trusted DB history is invalid (`res.setHeader` / `res.flushHeaders` not called; `next(err)` called with `400`).

---

## 6. Verification Results

- **Focused History & Streaming Tests (`node --test tests/integration/chatStreaming.test.js tests/unit/p3T03ServerAuthoritativeHistory.test.js`):** **17 passed, 0 failed, 0 skipped** across **5 suites** (`1026.31 ms`).
- **Full Test Suite (`npm test`):** **742 passed, 0 failed, 0 skipped** across **216 suites** (`14313.50 ms`).
- **Frontend Production Build (`npm --prefix client run build`):** **Passed** (`exit code 0`, `vite v6.4.4`, `269` modules transformed in `22.31s`).

---

## 7. Git Diff Summary

P3-T03 Modified:
- `server/src/features/chatAssistant/assistantPersistence.js`
- `server/src/features/chatAssistant/assistantPolicy.js`
- `server/src/features/chatAssistant/assistantPrompt.js`
- `server/src/features/chatAssistant/assistantOrchestrator.js`
- `server/src/features/chatAssistant/chatAssistant.service.js`
- `server/src/features/chatAssistant/chatAssistant.controller.js`

P3-T03 Added:
- `tests/unit/p3T03ServerAuthoritativeHistory.test.js`
- `docs/reports/phase-3/P3-T03-server-authoritative-conversation-history.md`

*(Prompts, migrations, configuration, and P3-T04 streaming-content/checkpoint logic remain untouched.)*

---

## 8. Known Limitations

- In-stream `delta` sanitization, `rawAssistantContent` multi-chunk accumulation, and non-blocking checkpoints remain out of scope for P3-T03 and are scheduled for `P3-T04`.
- Live Supabase RLS execution against `202611170012`/`0013` was not probed in this offline suite.

---

## 9. Final Recommendation

**ACCEPT**
