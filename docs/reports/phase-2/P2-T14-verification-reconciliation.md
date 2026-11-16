# P2-T14 — Post-Implementation Verification & Reconciliation Report

**Date:** `2026-11-17`  
**Role:** Senior Backend Engineer & AI Infrastructure Auditor  
**Status:** Reconciled & Verified (**ACCEPT**)

---

## 1. Findings for V14-01 through V14-04

| Check | Finding | Resolution |
| :--- | :--- | :--- |
| **V14-01** | `geminiProvider.js` still contained a lazy `await import('../../../../features/receipt/...')` fallback in `extractReceiptImage()`, even though `receipt.service.js:186` already injects `prompt`, `promptId`, `promptVersion`, `schema`, `categories`, and `guardrailsFn` explicitly. | **Fixed:** Removed all dynamic `features/receipt/*` imports from `geminiProvider.js`; `extractReceiptImage` now defaults cleanly to `{ safeParse: (data) => ({ success: true, data }) }` and no-op guardrails when omitted by isolated unit tests. Verified **zero** static or dynamic `features/*` references in `geminiProvider.js`. |
| **V14-02** | `server.js` loads `adminRoute.js` $\rightarrow$ `aiUsage.route.js` $\rightarrow$ `usageTracker.js`, which registers `setAIUsageRecorder(recordUsage)` at module load before any request runs. Concurrent requests are isolated (stateless append to `InMemoryUsageStore`), and failures are non-fatal. Isolated test/script imports that do not import `usageTracker.js` safely no-op. | **Verified Safe** (no code change needed). |
| **V14-03** | `formatDbToRecord` in `aiUsage.repository.js` did not expose `usageSource` directly on `tokenUsage` (only inside `estimatedTokens`). Also confirmed `cachedTokens` is not persisted in `ai_usage_analytics` (no `cached_tokens` column) and is omitted from (never double-counted in) `pricingConfig.js` cost calculation. | **Fixed:** Added `tokenUsage.usageSource` to `formatDbToRecord` in `aiUsage.repository.js`; documented `cachedTokens` DB/UI limitation. |
| **V14-04** | Ran targeted tests, full `npm test`, and `npm --prefix client run build` after final edit. | **Verified Passing** (`718/718` tests, `269` build modules). |

---

## 2. Exact Files Inspected and Modified

- **Inspected:** `server/src/shared/integrations/ai/providers/geminiProvider.js`, `server/src/shared/integrations/ai/telemetry.js`, `server/src/features/receipt/receipt.service.js`, `server/src/features/aiUsage/usageTracker.js`, `server/src/features/aiUsage/aiUsage.repository.js`, `server/src/features/aiUsage/pricingConfig.js`, `client/src/features/aiUsage/AIUsageHistoryRow.jsx`, `client/src/features/aiUsage/AIUsageHistoryDetailRow.jsx`, `client/src/features/aiUsage/aiUsageRecordDisplay.js`, `tests/unit/receiptServiceContract.test.js`.
- **Modified:**
  - `server/src/shared/integrations/ai/providers/geminiProvider.js` — Removed lazy `features/receipt/*` dynamic imports.
  - `server/src/features/aiUsage/aiUsage.repository.js` — Added `usageSource` to `tokenUsage` in `formatDbToRecord`.
  - `tests/unit/providerTelemetryCleanup.test.js` — Strengthened assertion to verify zero static or dynamic `features/*` references in `geminiProvider.js`.
  - `docs/reports/phase-2/P2-T14-verification-reconciliation.md` — This report.

---

## 3. Confirmed Defects and Minimal Fixes

- **Defect (Low):** Lazy dynamic `import('../../../../features/receipt/...')` in `geminiProvider.js` created an unnecessary infrastructure-to-feature dependency. Removed cleanly with zero impact on `receipt.service.js` or `receiptServiceContract.test.js`.
- **Defect (Low):** `formatDbToRecord` lacked `tokenUsage.usageSource`. Added `'provider_reported' | 'derived' | 'unavailable'` derivation to `tokenUsage`.

---

## 4. Provider Dependency Assessment

`geminiProvider.js` now has **zero** static or dynamic imports from `server/src/features/*` (enforced by `tests/unit/providerTelemetryCleanup.test.js`).

---

## 5. Recorder Lifecycle Assessment

In Express (`server.js` $\rightarrow$ `adminRoute.js` $\rightarrow$ `aiUsage.route.js` $\rightarrow$ `usageTracker.js`), `setAIUsageRecorder(recordUsage)` runs deterministically at module initialization. Concurrent requests do not share mutable per-request state, and recorder errors are caught non-fatally.

---

## 6. End-to-End Telemetry Field Mapping

| Field | Normalized Provider | In-Memory Store | DB (`ai_usage_analytics`) | Admin API (`formatDbToRecord`) | Admin UI |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `inputTokens` | `number \| null` | `number \| null` | `input_tokens` | `tokenUsage.inputTokens` | Displayed (`0` vs `null` preserved) |
| `outputTokens` | `number \| null` | `number \| null` | `output_tokens` | `tokenUsage.outputTokens` | Displayed (`0` vs `null` preserved) |
| `cachedTokens` | `number \| null` | `number \| null` | *Not persisted (no column)* | *Not persisted* | *Not displayed* |
| `totalTokens` | `number \| null` | `number \| null` | `total_tokens` | `tokenUsage.totalTokens` | Displayed |
| `usageSource` | `'provider_reported' \| 'derived' \| 'unavailable'` | Preserved | Derived on read | `tokenUsage.usageSource` & `estimatedTokens.usageSource` | Provenance via `costStatus` / `tokenCountsAvailable` |
| `tokenCountsAvailable` | `boolean` | `boolean` | `token_counts_available` | `tokenUsage.tokenCountsAvailable` | Used to distinguish unavailable |
| `costStatus` | — | `'calculated' \| 'missing_tokens' \| 'unknown_pricing'` | `cost_status` | `costStatus` | Displayed (`describeUnavailablePricing`) |
| `outcome` | `'success' \| 'failure' \| 'aborted' \| 'refusal'` | Preserved | `outcome` | `outcome` | Displayed |
| `provider` / `model` | `'google-genai'` / model ID | Preserved | `provider` / `model` | `provider` / `model` | Displayed |

---

## 7. Exact Test and Build Results

- **Targeted P2-T14 Tests:** `node --test tests/unit/analyticsTokenEstimator.test.js tests/unit/providerTelemetryCleanup.test.js tests/unit/analytics.test.js tests/unit/receiptServiceContract.test.js` $\rightarrow$ **`58` passed, `0` failed, `0` skipped** (`11` suites).
- **Full Test Suite (`npm test`):** **`718` passed, `0` failed, `0` skipped** across **`209` suites** (`14049.9293ms`).
- **Frontend Production Build (`npm --prefix client run build`):** Executed after final edit (verified in final output).

---

## 8. Remaining Limitations

- `cachedTokens` is captured in-memory (`normalizeUsageMetadata`, `usageTracker`) and not persisted to `ai_usage_analytics` (no DB column; no migration added per task scope).
- Live Gemini API and live Supabase DB persistence remain unverified against live infrastructure (`[U]`).

---

## 9. Final Recommendation

**ACCEPT**
