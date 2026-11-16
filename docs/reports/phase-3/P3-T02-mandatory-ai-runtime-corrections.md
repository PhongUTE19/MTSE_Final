# P3-T02 — Mandatory AI Runtime Corrections Report

**Phase:** Phase 3 — AI Architecture  
**Task:** P3-T02 — Mandatory AI Runtime Corrections  
**Branch / HEAD:** `provider-adapter` @ `405e203 telemetry cleanup`  
**Date:** `2026-11-17`  
**Final Recommendation:** **ACCEPT**

---

## 1. Initial Baseline

- **Branch & HEAD:** `provider-adapter` at `405e203 telemetry cleanup`.
- **Pre-Edit Working Tree:** Clean except for `docs/reports/phase-3/P3-T01-ai-architecture-gap-audit.md` from P3-T01.
- **Pre-Edit Test Baseline:** `719` passed, `0` failed, `0` skipped across `209` suites (`npm test`).
- **Pre-Edit Build Baseline:** `npm --prefix client run build` passed (`269` modules transformed).

---

## 2. Findings Addressed

Resolved the three P3-T01 runtime defects scoped to P3-T02:

1. **F-01 (P1) — Default `CHAT_STRATEGY`:** `SERVER_CONFIG_DEFAULTS.CHAT_STRATEGY` was `'agent'`, causing `/api/chat-assistant` and `/api/chat-assistant/stream` to route to the legacy `agent` path by default when `CHAT_STRATEGY` was unset or empty.
2. **F-03 (P1) — `AbortError` Retry Classification:** `executeWithRetry` in `geminiProvider.js` classified `AbortError` as `isTimeout` $\rightarrow$ `isTransient`, retrying client-cancelled requests with exponential backoff.
3. **F-04 Partial (P1) — Response Sanitization & Citation Fallback:** `finalizeAssistantResponse` in `assistantResponse.js` collapsed `\s{2,}` (destroying Markdown paragraph breaks and list formatting) and fell back to `validated.answer` when citation stripping produced an empty string (restoring fabricated `[S99]` markers).

---

## 3. Implementation Details

### 3.1 P3-T02-A — Correct Default Chat Strategy
- [server/src/constants/config.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/server/src/constants/config.js#L66): Updated `SERVER_CONFIG_DEFAULTS.CHAT_STRATEGY` from `'agent'` to `'unified'`.
- [server/src/config.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/server/src/config.js#L32): Trimmed `process.env.CHAT_STRATEGY?.trim()` with `'unified'` fallback so missing or whitespace-only env values resolve safely to `'unified'`.
- [server/src/features/chatAssistant/chatAssistant.service.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/server/src/features/chatAssistant/chatAssistant.service.js#L38-L55): Updated both `orchestrateChat` and `orchestrateChatStream` to trim `process.env.CHAT_STRATEGY` and explicitly route `strategy === 'agent' || options.agentRunner` to `orchestrateAgentChat` / `orchestrateAgentChatStream`, preserving explicit `agent` and `rag` overrides while defaulting to `unified`.

### 3.2 P3-T02-B — Fix `AbortError` Retry Classification
- [server/src/shared/integrations/ai/providers/geminiProvider.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/server/src/shared/integrations/ai/providers/geminiProvider.js#L75-L155):
  - Added optional `signal = null` parameter to `executeWithRetry`.
  - Added pre-attempt `if (signal?.aborted)` guard throwing an `AbortError` immediately with `executionMetadata` (`totalAttempts: attempts.length`).
  - Excluded `AbortError` and `signal?.aborted` from `isTimeout` and `isTransient`, preserving existing retry behavior for `AIResponseTimeoutError`, `429`, `503`, and network timeouts.
  - Passed `options.signal` / `signal` from `generateAnswerStream` and `generateToolTurnStream` into `executeWithRetry`.

### 3.3 P3-T02-C — Correct Response Sanitization
- [server/src/features/chatAssistant/assistantResponse.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/server/src/features/chatAssistant/assistantResponse.js#L21-L43):
  - Replaced `.replace(/\s{2,}/g, ' ')` with `.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+\n/g, '\n')` to normalize horizontal whitespace without collapsing Markdown newlines or list formatting.
  - Replaced `sanitizedAnswer || validated.answer` with `sanitizedAnswer || validateChatResponse('').answer`, preventing stripped invalid citations from ever being restored.

---

## 4. Regression Tests Added

- [tests/unit/aiProvider.test.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/tests/unit/aiProvider.test.js#L246-L315): Added 3 tests verifying `executeWithRetry` halts immediately on `AbortError`, skips execution when `AbortSignal` is already aborted, and does not retry when `AbortSignal` aborts mid-execution.
- [tests/unit/p3T02RuntimeCorrections.test.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/tests/unit/p3T02RuntimeCorrections.test.js): Added 11 tests across two suites:
  - `P3-T02-A`: Isolated-process `config.js` resolution with unset/empty `CHAT_STRATEGY`, explicit `agent`/`rag`/`unified` overrides, and `orchestrateChat` / `orchestrateChatStream` default `unified` routing.
  - `P3-T02-C`: Multi-paragraph Markdown, bulleted/numbered lists, consecutive newlines, horizontal whitespace normalization, valid `[S1]` preservation, invalid `[S99]` stripping, citation-only `[S99]` fallback without restoration, and empty/whitespace-only fallback.

---

## 5. Verification Results

- **Focused Unit Tests (`node --test tests/unit/aiProvider.test.js tests/unit/p3T02RuntimeCorrections.test.js tests/unit/unifiedAssistant.test.js tests/unit/chatOrchestrator.test.js`):** **42 passed, 0 failed, 0 skipped** across **15 suites** (`1662.30 ms`).
- **Full Test Suite (`npm test`):** **733 passed, 0 failed, 0 skipped** across **212 suites** (`13619.18 ms`).
- **Frontend Production Build (`npm --prefix client run build`):** **Passed** (`exit code 0`, `vite v6.4.4`, `269` modules transformed in `11.25s`).

---

## 6. Git Diff Summary

Modified:
- `server/src/constants/config.js` (`+1 / -1`)
- `server/src/config.js` (`+1 / -1`)
- `server/src/features/chatAssistant/chatAssistant.service.js` (`+4 / -4`)
- `server/src/shared/integrations/ai/providers/geminiProvider.js` (`+45 / -22`)
- `server/src/features/chatAssistant/assistantResponse.js` (`+18 / -11`)
- `tests/unit/aiProvider.test.js` (`+75 / -0`)

Added:
- `tests/unit/p3T02RuntimeCorrections.test.js`
- `docs/reports/phase-3/P3-T02-mandatory-ai-runtime-corrections.md`

Preserved Untouched:
- Historical migrations, database schemas, canonical prompts (`server/prompts/`), and all P3-T03/P3-T04+ scoped files.

---

## 7. Known Limitations

- Remaining P3-T01 defects (`F-02` server-authoritative history vs 8-turn sanitizer, `F-04` streaming `rawAssistantContent` accumulation & delta sanitization, `F-05`–`F-11`) were intentionally excluded per P3-T02 scope boundaries and remain scheduled for `P3-T03`–`P3-T07`.

---

## 8. Final Recommendation

**ACCEPT**
