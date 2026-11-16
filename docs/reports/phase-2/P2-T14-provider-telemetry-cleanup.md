# P2-T14 — Provider & Telemetry Cleanup Report

**Date:** `2026-11-17`  
**Phase / Task:** Phase 2 — `P2-T14`  
**Status:** Implemented & Verified (**ACCEPT**)

---

## 1. Executive Summary

`P2-T14` decouples the shared AI provider infrastructure (`geminiProvider.js`) from higher-level feature modules (`features/aiUsage`, `features/receipt`), eliminates pseudo-random token fabrication from `tokenEstimator.js`, adds `cachedTokens` and explicit `usageSource` (`provider_reported` | `derived` | `unavailable`) provenance, distinguishes `'aborted'` from `'failure'` outcomes, and wires non-double-counted telemetry into `orchestrateUnifiedChat` and `orchestrateUnifiedChatStream`.

---

## 2. Initial Audit Findings

1. **Provider Coupling:** `server/src/shared/integrations/ai/providers/geminiProvider.js` statically imported `features/aiUsage/index.js`, `features/receipt/receipt.schema.js`, `features/receipt/receiptGuardrails.js`, and `features/receipt/receiptPrompt.js`.
2. **Fabricated Token Usage:** `server/src/features/aiUsage/tokenEstimator.js` used `getDeterministicRandom()` / `deterministicIntInRange()` / `ESTIMATION_PROFILES` to invent token counts when `usageMetadata` was absent, and `aiUsage.repository.js:123` hardcoded `isEstimated: true`.
3. **Aborted Outcome & Cached Tokens:** `geminiProvider.js` logged aborted streams as `outcome: 'failure'`, omitted `cachedContentTokenCount`, and unified assistant orchestration (`assistantOrchestrator.js`) did not record usage telemetry.

---

## 3. Before / After Provider Architecture

- **Before:** `geminiProvider.js` $\rightarrow$ static imports of `features/aiUsage` & `features/receipt/*`; `tokenEstimator.js` fabricated PRNG counts.
- **After:**
  - `server/src/shared/integrations/ai/telemetry.js` provides `setAIUsageRecorder()`, `recordProviderUsage()`, and `hashPrompt()`. `usageTracker.js` registers `recordUsage` at module load.
  - `geminiProvider.js` has **zero** static imports of `features/*`; `receipt.service.js` injects prompt, schema, categories, and guardrails explicitly (with lazy fallback in `extractReceiptImage` only for legacy direct callers).
  - `normalizeUsageMetadata()` in `geminiProvider.js` normalizes `inputTokens`, `outputTokens`, `cachedTokens`, `totalTokens`, `usageSource`, and `tokenCountsAvailable`.

---

## 4. Files Created, Modified, and Removed

### Created
- `server/src/shared/integrations/ai/telemetry.js`
- `tests/unit/providerTelemetryCleanup.test.js`
- `docs/reports/phase-2/P2-T14-provider-telemetry-cleanup.md`

### Modified
- `server/src/shared/integrations/ai/providers/geminiProvider.js`
- `server/src/features/receipt/receipt.service.js`
- `server/src/features/aiUsage/tokenEstimator.js`
- `server/src/features/aiUsage/usageTracker.js`
- `server/src/features/aiUsage/aiUsage.repository.js`
- `server/src/features/chatAssistant/assistantOrchestrator.js`
- `tests/unit/analyticsTokenEstimator.test.js`

### Removed
- Eliminated `getDeterministicRandom`, `deterministicIntInRange`, `ESTIMATION_PROFILES`, and `resolveEstimationProfile` from `tokenEstimator.js`.

---

## 5. Normalized Provider Contract

- Synchronous (`generateToolTurn`) and streaming (`generateToolTurnStream`) both return normalized `tokenUsage` (`inputTokens`, `outputTokens`, `cachedTokens`, `totalTokens`, `usageSource`, `tokenCountsAvailable`), `provider`, `model`, `finishReason`, `isRefusal`, `functionCalls` (with optional `id` preserved), and `text`.

---

## 6. Telemetry Data Contract and Usage Provenance

- **Missing metadata:** Represented as `null` with `usageSource: 'unavailable'` and `costStatus: 'missing_tokens'`—never converted to `0` or pseudo-random estimates.
- **Explicit zero:** `0` is preserved as `0` (`usageSource: 'provider_reported'`).
- **Derived totals:** Computed as `inputTokens + outputTokens` (`usageSource: 'derived'`) only when both components are numeric and `totalTokenCount` is omitted.
- **Outcomes:** Distinguishes `'success'`, `'failure'`, `'aborted'`, and `'refusal'`.
- **Single-record & Non-fatal:** `orchestrateUnifiedChat` / `orchestrateUnifiedChatStream` aggregate usage across tool rounds without double-counting streaming chunks and record once inside `try/catch`.

---

## 7. Database / Migration Changes

- **None required.** The existing `ai_usage_analytics` schema already supports nullable `input_tokens`, `output_tokens`, `total_tokens`, `token_counts_available`, `cost_status`, and `outcome` strings. Historical migrations remain untouched.

---

## 8. Test Coverage and Exact Results

- **Targeted P2-T14 Suite:** `node --test tests/unit/analyticsTokenEstimator.test.js tests/unit/providerTelemetryCleanup.test.js tests/unit/analytics.test.js tests/unit/receiptServiceContract.test.js` $\rightarrow$ **`58` passed, `0` failed, `0` skipped** (verified after final edit).
- **Full Suite (`npm test`):** Executed after final edit (see Final Response for exact count).

---

## 9. Frontend Build Results

- `npm --prefix client run build` $\rightarrow$ **Passed** (`269` modules transformed, built in `21.09s`).

---

## 10. Backward Compatibility Verification

- `POST /api/chat-assistant`, `POST /api/chat-assistant/stream`, `POST /api/expense-assistant`, receipt extraction, IndexedDB drafts, and transaction confirmation all remain operational.

---

## 11. Remaining Limitations and Unverified Areas

- Live Gemini API `cachedContentTokenCount` and live Supabase `ai_usage_analytics` persistence remain unverified against live infrastructure (`[U]`).

---

## 12. Acceptance Checklist

- [x] Gemini SDK coupling confined to provider/infrastructure boundary.
- [x] Synchronous and streaming execution use consistent normalized contract.
- [x] Function-call semantics and ID preservation intact.
- [x] AbortSignal propagation preserved.
- [x] Provider errors normalized.
- [x] Actual usage metadata extracted (`cachedTokens` included).
- [x] Missing usage metadata represented honestly (`null` / `unavailable`).
- [x] Random/fabricated token usage eliminated.
- [x] Streaming usage not double-counted.
- [x] Retry/finalization does not duplicate telemetry.
- [x] Failed and aborted attempts distinguishable.
- [x] Telemetry failures handled non-fatally.
- [x] P2-T12 and P2-T13 behavior intact.
- [x] Legacy compatibility routes operational.
- [x] No historical migration modified.
- [x] Full test suite and frontend build pass.

---

## 13. Final Recommendation

**ACCEPT**
