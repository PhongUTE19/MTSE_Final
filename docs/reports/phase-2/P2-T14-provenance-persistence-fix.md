# P2-T14 — Usage Provenance Persistence Fix Report

**Task:** P2-T14 — Usage Provenance Persistence Fix  
**Status:** Complete  
**Recommendation:** **ACCEPT**

---

## 1. Confirmed Defect & Root Cause

`usageTracker.js` computes derived `totalTokens` (`input + output`) when the provider omits `totalTokens`, setting `tokenUsage.usageSource = 'derived'`. Previously, `public.ai_usage_analytics` had no `usage_source` column, so `formatDbToRecord()` reconstructed any persisted row with numeric token counts as `provider_reported`. This broke the P2-T14 requirement that `provider_reported` and `derived` usage remain distinguishable after persistence.

---

## 2. Implemented Changes

### 2.1 Forward-Only Schema Migration
- **File:** [202611170014_add_usage_source_to_ai_usage.sql](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/supabase/migrations/202611170014_add_usage_source_to_ai_usage.sql)
- Added nullable `usage_source text check (usage_source in ('provider_reported', 'derived', 'unavailable', 'unknown'))` to `public.ai_usage_analytics`.
- Historical migrations (`20261020000000`–`202611170013`) were left untouched.

### 2.2 Repository Serialization & Historical Compatibility
- **File:** [aiUsage.repository.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/server/src/features/aiUsage/aiUsage.repository.js)
- `formatRecordForDb()` now persists `usage_source: record.tokenUsage?.usageSource ?? null`.
- `formatDbToRecord()` preserves `row.usage_source` when valid, and classifies historical rows where `usage_source` is `NULL`:
  - `'unavailable'` when no token counts exist.
  - `'unknown'` when token counts exist (preventing false classification as `'provider_reported'`).
- Both `tokenUsage.usageSource` and `estimatedTokens.usageSource` are kept identical.

### 2.3 Token Estimator Alignment
- **File:** [tokenEstimator.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/server/src/features/aiUsage/tokenEstimator.js)
- `estimateTokensForRequest()` respects explicit `usage_source` / `usageSource` when provided.

### 2.4 Regression Tests
- **File:** [analyticsTokenEstimator.test.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/tests/unit/analyticsTokenEstimator.test.js)
- Added DB round-trip provenance regression coverage for:
  - `provider_reported`, `derived`, and `unavailable`
  - Explicit `0` token counts
  - Legacy `NULL usage_source` rows with token counts mapping to `'unknown'`
  - `estimatedTokens.usageSource` consistency and cost calculation

---

## 3. Known Limitations & Deployment Notes

- **`cachedTokens` persistence:** `cachedTokens` continues to be captured in-memory (`normalizeUsageMetadata`, `usageTracker`) and is not persisted to `ai_usage_analytics` (no additional column added in this minimal fix).
- **Migration rollout:** Until `202611170014_add_usage_source_to_ai_usage.sql` is applied to the target Supabase database, live inserts against a remote instance without the column will log a schema-cache warning (`Could not find the 'usage_source' column of 'ai_usage_analytics' in the schema cache`).

---

## 4. Verification Results

| Check | Command | Result |
| :--- | :--- | :--- |
| **Targeted unit tests** | `node --test tests/unit/analyticsTokenEstimator.test.js tests/unit/providerTelemetryCleanup.test.js tests/unit/analytics.test.js` | **52 passed, 0 failed, 0 skipped** (`11` suites, `3313.911ms`) |
| **Full test suite** | `npm test` | **719 passed, 0 failed, 0 skipped** (`209` suites, `13811.2865ms`) |
| **Frontend production build** | `npm --prefix client run build` | **Passed** (`vite v6.4.4`, `269 modules transformed`, `built in 22.18s`, exit code `0`) |
