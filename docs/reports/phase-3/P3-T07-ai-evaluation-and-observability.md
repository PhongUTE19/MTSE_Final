# P3-T07 — AI Evaluation & Observability Report

**Phase:** Phase 3 — AI Architecture  
**Task:** P3-T07 — AI Evaluation & Observability  
**Branch:** `provider-adapter` (post P3-T06)  
**Date:** `2026-11-18`  
**Final Recommendation:** **ACCEPT**

---

## 1. Initial Baseline

- **Pre-Task Test Baseline:** `758` passed, `0` failed, `0` skipped across `226` suites (`npm test`).
- **Pre-Task Build Baseline:** `npm --prefix client run build` passed (`269` modules transformed).

---

## 2. Existing Evaluation & Telemetry Architecture

- **Existing Evals:** `evals/rag/runner.js` (`npm run eval:rag`) and `evals/receipts/` require live Gemini API and Qdrant Cloud calls. No deterministic offline AI evaluation harness existed for the unified assistant.
- **Existing Telemetry:** `usageTracker.js` + `aiUsage.repository.js` + `202611170014_add_usage_source_to_ai_usage.sql` accurately distinguish `provider_reported`, `derived`, `unavailable`, and legacy `unknown` provenance, `outcome` (`success`, `failure`, `refusal`, `aborted`), `toolsExecuted`, and `timeToFirstTokenMs`.

---

## 3. Evaluation Framework Design

Implemented a zero-external-dependency deterministic evaluation harness under `evals/ai/`:
- **[evals/ai/schema.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/evals/ai/schema.js):** Defines `EVAL_CATEGORIES`, `EVAL_SEVERITIES`, `validateEvalCase`, and `validateEvalCases` (strict schema validation and duplicate-ID protection).
- **[evals/ai/cases.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/evals/ai/cases.js):** Defines 26 structured evaluation cases (`AI_EVAL_CASES`) across all 6 required categories.
- **[evals/ai/runner.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/evals/ai/runner.js):** Executes cases offline directly against SpendWise's production modules (`evaluateRequestPolicy`, `canExecuteTool`, `executeRegisteredTool`, `finalizeAssistantResponse`, `orchestrateUnifiedChat`, `normalizeUsageMetadata`, `createUsageTracker`, `formatDbToRecord`), computes per-category and overall metrics, supports human-readable and `--json` output, and sets `process.exitCode = 1` when any mandatory case fails.
- **[package.json](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/package.json):** Added `"eval:ai": "node evals/ai/runner.js"` and updated `"test:all"` to `"npm test && npm run eval:ai"`.

---

## 4. Evaluation Case Categories & Coverage

| Category | Cases | Coverage |
| :--- | :---: | :--- |
| `scope_policy` | 6 | `out_of_scope` tool-free refusal, `unknown` KB-only restriction, `kb_docs`, `finance_read`, `transaction_proposal`, `hybrid` KB precondition |
| `rag_evidence` | 5 | Above-threshold retention, weak trailing chunk filtering, amendment threshold (`0.55`), `NO_RESULTS`, `INSUFFICIENT_EVIDENCE`, `RETRIEVAL_UNAVAILABLE` |
| `citation_integrity` | 3 | Valid `[S1]`, fabricated `[S99]` removal, `[S1]` deduplication, cross-call `chunk.id` reuse, `sources` vs `consultedSources`, cross-request isolation |
| `prompt_trust_boundary` | 4 | Indirect prompt-injected chunk drop, XML delimiter stripping, direct user injection refusal, benign instruction-like docs preserved |
| `response_proposal` | 4 | Valid VND proposal, invalid proposal rejection, hybrid policy-dependent proposal blocking, `[S99]`-only fallback safety |
| `usage_telemetry` | 4 | `provider_reported`, `derived`, `unavailable` + `missing_tokens`, legacy `unknown` DB readback |

---

## 5. Metrics & Sample Evaluation Results

Executed `npm run eval:ai`:
- **Total:** `26` | **Passed:** `26` | **Failed:** `0` | **Mandatory Failed:** `0` | **Critical (P0/P1) Failures:** `0`
- **Category Breakdown:** `scope_policy: 6/6`, `rag_evidence: 5/5`, `citation_integrity: 3/3`, `prompt_trust_boundary: 4/4`, `response_proposal: 4/4`, `usage_telemetry: 4/4`.

> **Important Distinction:** These deterministic metrics verify policy enforcement, retrieval filtering, citation integrity, trust boundaries, response contracts, and telemetry provenance offline with mocked providers. They do **not** measure live LLM semantic accuracy.

---

## 6. Observability Gaps Found & Implemented Improvements

- **Gap Found:** `generateToolTurnStream` (`geminiProvider.js`) and `orchestrateUnifiedChatStream` (`assistantOrchestrator.js`) did not capture or forward `timeToFirstTokenMs`, even though `usageTracker.js` and `ai_usage_analytics.time_to_first_token_ms` already support it.
- **Implemented:**
  - **[geminiProvider.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/server/src/shared/integrations/ai/providers/geminiProvider.js):** `generateToolTurnStream` now records `timeToFirstTokenMs` on the first non-empty text chunk and includes it in `turn_complete`.
  - **[assistantOrchestrator.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/server/src/features/chatAssistant/assistantOrchestrator.js):** `orchestrateUnifiedChatStream` records `timeToFirstTokenMs` on the first emitted `delta` and forwards it to `recordProviderUsage` (no DB migration or sensitive payload logging added).

---

## 7. Regression Tests & Verification Results

Added [tests/unit/p3T07AiEvaluationAndObservability.test.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/tests/unit/p3T07AiEvaluationAndObservability.test.js) (5 tests across 3 suites).

- **`npm run eval:ai`:** **26/26 passed**, exit code `0`.
- **Focused Tests (`node --test tests/unit/p3T07AiEvaluationAndObservability.test.js tests/unit/analyticsTokenEstimator.test.js tests/unit/providerTelemetryCleanup.test.js`):** **15 passed, 0 failed, 0 skipped** across **6 suites** (`1239.38 ms`).
- **Full Test Suite (`npm test`):** **763 passed, 0 failed, 0 skipped** across **230 suites** (`14542.19 ms`).
- **Frontend Production Build (`npm --prefix client run build`):** **Passed** (`exit code 0`, `vite v6.4.4`, `269` modules transformed in `23.28s`).

---

## 8. Known Limitations & Remaining Recommendations

- Offline deterministic cases use mocked `retrieverFn` and `toolTurnRunner`; live Gemini semantic quality and live Qdrant cosine ranking still require periodic runs of `npm run eval:rag` and `evals/receipts/run-live-gemini.js` when credentials are available.
- `cached_tokens` persistence (`F-12`) and `chat_messages.tool_trace` / `proposals` columns (`F-13`) remain optional future DB migrations if needed later.

---

## 9. Final Recommendation

**ACCEPT**
