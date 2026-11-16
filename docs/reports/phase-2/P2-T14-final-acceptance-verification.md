# P2-T14 — Final Regression Count & Usage Provenance Audit

**Date:** `2026-11-17`  
**Mode:** Read-Only Verification  
**Target Commits Inspected:** `6a4fbb5` (`P2-T13`) $\rightarrow$ `73c97b5` (`HEAD`, `P2-T14`)

---

## 1. Exact Explanation of the 7-Test / 5-Suite Difference

Comparing `git diff --stat 6a4fbb5..HEAD -- tests/` shows **only two test files** changed between `P2-T13` (`725 tests / 214 suites`) and `P2-T14` (`718 tests / 209 suites`):

| File | P2-T13 (`6a4fbb5`) | P2-T14 (`HEAD`) | Net Delta | Classification |
| :--- | :--- | :--- | :--- | :--- |
| `tests/unit/analyticsTokenEstimator.test.js` | `7` suites, `16` tests | `1` suite, `4` tests | **`-6` suites, `-12` tests** | **Legitimate test removal / replacement:** Removed 16 tests that asserted removed PRNG fabrication (`getDeterministicRandom`, `deterministicIntInRange`, `ESTIMATION_PROFILES`, `resolveEstimationProfile`) and replaced with 4 tests verifying honest non-fabricated provenance (`unavailable`, explicit `0`, `derived`, `missing_tokens`). |
| `tests/unit/providerTelemetryCleanup.test.js` | *(not present)* | `1` suite, `5` tests | **`+1` suite, `+5` tests** | **Intentional addition:** Verifies zero `features/*` imports in `geminiProvider.js`, `normalizeUsageMetadata`, non-fatal telemetry bridge, multi-round aggregation without double-counting, and distinct `'aborted'` outcome. |
| **Total Delta** | **`214` suites, `725` tests** | **`209` suites, `718` tests** | **`-5` suites, `-7` tests** | **Exact match (`214 - 6 + 1 = 209`; `725 - 12 + 5 = 718`).** |

- **No accidental regression or undiscovered tests:** `git diff` confirms no other test files were altered, skipped, or excluded, and `npm test` (`node --test "tests/**/*.test.js"`) discovery is unchanged.

---

## 2. Test Coverage Impact

- The 12 net removed cases tested only pseudo-random token fabrication that was intentionally eliminated in `P2-T14`.
- All legitimate non-PRNG telemetry behaviors (missing metadata $\rightarrow$ `null` / `'unavailable'`, explicit `0` preservation, derived `input + output` totals, `missing_tokens` cost status, and non-fatal tracking) remain covered by `analyticsTokenEstimator.test.js`, `analytics.test.js`, and `providerTelemetryCleanup.test.js`.

---

## 3. Usage Provenance Reconstruction & Limitations (`formatDbToRecord`)

Inspected `formatDbToRecord` in `server/src/features/aiUsage/aiUsage.repository.js` (`lines 57–187`) and `formatRecordForDb` (`lines 19–49`):

1. **Reconstruction:** `tokenUsage.usageSource` is derived from `(row.input_tokens, row.output_tokens, row.total_tokens)`:
   - `hasInput && hasOutput && hasTotal` $\rightarrow$ `'provider_reported'`
   - `hasInput && hasOutput && !hasTotal` $\rightarrow$ `'derived'` (`totalTokens = input + output`)
   - `!hasInput && !hasOutput && hasTotal` $\rightarrow$ `'provider_reported'`
   - Otherwise $\rightarrow$ `'unavailable'`
2. **Legacy Records with Missing Metadata:** Classified as `'unavailable'` (`hasInput`, `hasOutput`, `hasTotal` are all `false`).
3. **Explicit Zero vs. Missing:** Uses `typeof row.* === 'number'`, so `0` is preserved as `0` (`'provider_reported'`) while `null` remains `null` (`'unavailable'`).
4. **Consistency Between `tokenUsage.usageSource` and `estimatedTokens.usageSource`:** Both use identical rules (`tokenEstimator.js:29-38` and `aiUsage.repository.js:162-165`), so they do not contradict each other.
5. **Confirmed Persistence Limitation (No Migration Needed Now):**
   - `ai_usage_analytics` has no `usage_source` column (`formatRecordForDb` does not persist `usageSource`). Because `usageTracker.js:273-275` derives `totalTokens = inputTokens + outputTokens` in-memory before `formatRecordForDb` writes `total_tokens`, a pre-insert derived total has a non-null `total_tokens` in DB and reconstructs as `'provider_reported'` on DB readback.
   - `cachedTokens` is captured in-memory (`normalizeUsageMetadata`, `usageTracker`) but not persisted in `ai_usage_analytics` (no `cached_tokens` column).
6. **Admin UI Display:** Admin UI (`AIUsageHistoryRow.jsx`, `AIUsageHistoryDetailRow.jsx`, `aiUsageRecordDisplay.js`) currently displays indirect provenance indicators (`tokenCountsAvailable`, `costStatus`, and legacy `estimated_backfill`), not the explicit `usageSource` string.

---

## 4. Changes Made

None (read-only verification; only this report file was created).

---

## 5. Exact Final Test and Build Results

*(From the latest verified P2-T14 reconciliation run at `HEAD` `73c97b5`, with zero source/test edits since):*
- **`npm test`:** **`718` passed, `0` failed, `0` skipped** across **`209` suites** (`14049.9293ms`).
- **`npm --prefix client run build`:** **Passed** (`269` modules transformed, built in `21.71s`).

---

## 6. Final Recommendation

**ACCEPT**
