# P3-T04 — Streaming Lifecycle & Response Integrity Report

**Phase:** Phase 3 — AI Architecture  
**Task:** P3-T04 — Streaming Lifecycle & Response Integrity  
**Branch / HEAD:** `provider-adapter` (post P3-T03)  
**Date:** `2026-11-17`  
**Final Recommendation:** **ACCEPT**

---

## 1. Initial Baseline

- **Branch:** `provider-adapter` (after `P3-T03`)
- **Pre-Task Test Baseline:** `742` passed, `0` failed, `0` skipped across `216` suites (`npm test`).
- **Pre-Task Build Baseline:** `npm --prefix client run build` passed (`269` modules transformed).

---

## 2. Root Cause and Complete Streaming Execution Trace

1. **Multi-Chunk `rawAssistantContent` Overwrite (`geminiProvider.js`):** `generateToolTurnStream` assigned `rawAssistantContent = candidate.content` on each chunk, discarding earlier `parts` (e.g., `functionCall` or `text` parts) in multi-chunk responses, and did not extract `candidate.content.parts` text when `chunk.text` was absent.
2. **Raw Unsanitized `delta` Emissions (`assistantOrchestrator.js`):** `orchestrateUnifiedChatStream` emitted `chunk.text` directly via `emit('delta', { text: chunk.text })` before citation stripping or prompt-leakage sanitization, allowing split `[S99]` markers or simulated XML delimiters to reach the client before `finalizeAssistantResponse` ran at `done`.
3. **Terminal Event Guard:** `orchestrateUnifiedChatStream` lacked a `terminalEmitted` guard preventing duplicate terminal events or post-terminal emissions.
4. **Checkpoint Assessment (`F-08`):** `checkpointStreamAttempt` runs once every `STREAM_CHECKPOINT_CHARS = 400` characters (not per token), updates conditionally with `.eq('status', 'streaming')` (`chatHistory.repository.js:164`), and is contractually required by `tests/unit/sseStreaming.test.js:255-270` to fail loudly if DB checkpointing throws. Therefore, the awaited 400-char checkpoint was **retained** rather than converted to fire-and-forget.

---

## 3. Existing SSE Protocol and Final Event Lifecycle

Existing SSE event names (`meta`, `delta`, `proposal`, `sources`, `done`, `error`) and payload contracts were preserved without breaking frontend compatibility (`client/src/features/chat/chatController.js`):

1. **Text-only:** `meta` $\rightarrow$ `delta*` (filtered) $\rightarrow$ `done` (`status: 'completed'`, authoritative `answer`).
2. **RAG with citations:** `meta` $\rightarrow$ (tool rounds, non-user-facing) $\rightarrow$ `delta*` (buffered/filtered against `state.sourcesMap`) $\rightarrow$ `sources` (`sources` = cited only, `consultedSources` = all retrieved) $\rightarrow$ `done`.
3. **Tool-call rounds + final response:** `meta` $\rightarrow$ `proposal` (if `propose_transaction` succeeded) $\rightarrow$ `delta*` $\rightarrow$ `sources` (if KB used) $\rightarrow$ `done`.
4. **Provider / Persistence failure:** `meta` $\rightarrow$ (`delta*` if partial) $\rightarrow$ `error` (at most one terminal event; DB row finalized as `'failed'`).
5. **Client cancellation:** `AbortSignal` aborts provider stream; no retry (`P3-T02`); no further `delta`/`done`; DB row finalized as `'aborted'` with partial `accumulatedText`.

---

## 4. Implementation Details for Accumulation & Sanitization

- **[geminiProvider.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/server/src/shared/integrations/ai/providers/geminiProvider.js):**
  - `generateToolTurnStream` now extracts text from `chunk.text` or `candidate.content.parts` (excluding `thought` parts), collects `functionCalls` from `chunk.functionCalls` or `candidate.content.parts`, and accumulates all `candidate.content.parts` into `rawAssistantContent = { role: assistantRole, parts: accumulatedParts }`.
- **[assistantResponse.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/server/src/features/chatAssistant/assistantResponse.js):**
  - Added `createStreamingTextFilter({ sourcesMap })`:
    - Buffers trailing incomplete citation markers (`[S...`), XML tags (`<...`), and trailing horizontal whitespace before potential `[S...` / `\n`.
    - Checks cumulative text via `sanitizeGeneratedOutput` to suppress prompt-leakage signatures split across chunks.
    - Strips unknown `[S#]` markers, normalizes horizontal whitespace (`[ \t]{2,}` and `[ \t]+\n`), and preserves Markdown `\n` / `\n\n` and lists.
- **[assistantOrchestrator.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/server/src/features/chatAssistant/assistantOrchestrator.js):**
  - Wired `createStreamingTextFilter({ sourcesMap: state.sourcesMap })` into `orchestrateUnifiedChatStream`.
  - Flushes trailing buffered text at end of final round, emits fallback `delta` if no deltas were emitted and `finalized.answer` is non-empty, and guards all emissions with `safeEmit` (`terminalEmitted` + `!signal?.aborted`).

---

## 5. Citation & Source Handling

- Because tool rounds populate `state.sourcesMap` *before* the final answer round streams, `createStreamingTextFilter` strips fabricated `[S99]` citations in real time while preserving valid `[S1]` citations—even when split character-by-character across chunks.
- `sources` emits only sources actually cited in the final validated answer, while `consultedSources` preserves all retrieved chunks.

---

## 6. Persistence & Checkpoint Guarantees

- Only `finalized.answer` (never raw unvalidated provider text) is persisted with `status: 'completed'`.
- `finalizeStreamAttempt` updates conditionally on `.eq('status', 'streaming')`, preventing delayed updates from overwriting `'aborted'` or `'failed'` rows.
- If `finalizeStreamAttempt` returns `null` (conflict), `orchestrateUnifiedChatStream` throws `409`, marks `failed`, and emits `error` (never `done`).
- Checkpoint behavior remains synchronous every `400` chars so checkpoint failures deterministically fail the stream attempt without race conditions or unhandled rejections.

---

## 7. Cancellation & Failure Semantics

- `signal?.aborted` stops chunk iteration, prevents subsequent tool calls, suppresses `delta`/`done`, and persists `status: 'aborted'` with partial `accumulatedText`.
- `AbortError` is never retried (`P3-T02`).

---

## 8. Regression Tests

Added [tests/unit/p3T04StreamingIntegrity.test.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/tests/unit/p3T04StreamingIntegrity.test.js) (6 tests across 3 suites) covering:
1. Multi-chunk, multi-part `candidate.content.parts`, empty chunks, and `rawAssistantContent` part accumulation.
2. Character-by-character split citation buffering (`[S1]` kept, `[S99]` stripped, Markdown `\n\n` and `- Item` preserved).
3. Split system-prompt signature suppression.
4. End-to-end RAG streaming consistency across `delta`s, `done.answer`, `sources`, and persisted DB content.
5. Invalid-citation-only (`[S99]`) fallback without restoring `[S99]`.
6. Single terminal event guard on finalization failure.

---

## 9. Verification Results

- **Focused Streaming Tests (`node --test tests/unit/p3T04StreamingIntegrity.test.js`):** **6 passed, 0 failed, 0 skipped** across **4 suites** (`901.32 ms`).
- **Full Test Suite (`npm test`):** **748 passed, 0 failed, 0 skipped** across **220 suites** (`13721.33 ms`).
- **Frontend Production Build (`npm --prefix client run build`):** **Passed** (`exit code 0`, `vite v6.4.4`, `269` modules transformed).

---

## 10. Git Diff Summary

P3-T04 Modified:
- `server/src/shared/integrations/ai/providers/geminiProvider.js`
- `server/src/features/chatAssistant/assistantResponse.js`
- `server/src/features/chatAssistant/assistantOrchestrator.js`

P3-T04 Added:
- `tests/unit/p3T04StreamingIntegrity.test.js`
- `docs/reports/phase-3/P3-T04-streaming-lifecycle-and-response-integrity.md`

*(No migrations, prompts, configuration, or unrelated features were modified.)*

---

## 11. Known Limitations

- `sources` continues to be emitted at the end of the final round (just before `done`) rather than before `delta`s, preserving existing `sseStreaming.test.js` event ordering; `createStreamingTextFilter` ensures invalid `[S#]` markers are already stripped from `delta`s.
- Buffering trailing `[S...` / `<...` / horizontal spaces introduces at most a few characters of lookahead latency when those characters appear at chunk boundaries.

---

## 12. Final Recommendation

**ACCEPT**
