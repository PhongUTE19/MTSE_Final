# P3-T06 — RAG & Prompt Hardening Report

**Phase:** Phase 3 — AI Architecture  
**Task:** P3-T06 — RAG & Prompt Hardening  
**Branch:** `provider-adapter` (post P3-T05)  
**Date:** `2026-11-18`  
**Final Recommendation:** **ACCEPT**

---

## 1. Initial Baseline

- **Pre-Task Test Baseline:** `751` passed, `0` failed, `0` skipped across `221` suites (`npm test`).
- **Pre-Task Build Baseline:** `npm --prefix client run build` passed (`269` modules transformed).

---

## 2. Retrieval Execution Trace

1. `evaluateRequestPolicy` classifies scope/capability (`unknown` $\rightarrow$ `SEARCH_KNOWLEDGE_BASE` only, `out_of_scope` $\rightarrow$ tool-free refusal, `kb_docs` / `hybrid` $\rightarrow$ `requiresKbEvidence: true`).
2. `executeSearchKnowledgeBase` (`assistantTools.js`) validates `query` (1–300 chars) via Zod and invokes `retrieveRelevantChunks(query, topK)` (`retriever.js`).
3. `retrieveRelevantChunks` embeds `query` via `embedText`, queries Qdrant alias `spendwise_active` (`candidateLimit = max(topK, 6)`), slices `topK` (`4`), and appends an amendment chunk if `score >= 0.55`.
4. `executeSearchKnowledgeBase` evaluates `bestScore`, filters chunks, scans for prompt injection, strips XML delimiter tags, assigns deduplicated `S1..Sn` IDs, and returns `{ status, trust: 'untrusted_reference', chunks }`.
5. `finalizeAssistantResponse` (`assistantResponse.js`) and `createStreamingTextFilter` validate `[S#]` citations against `state.sourcesMap`, stripping unknown markers (`[S99]`) and separating `sources` (cited) from `consultedSources` (retrieved).

---

## 3. Similarity Filtering Assessment

- **Before P3-T06:** `executeSearchKnowledgeBase` checked `chunks[0]?.score >= similarityThreshold` (`0.60`), then passed *all* returned chunks to the model regardless of individual chunk scores.
- **After P3-T06:**
  - `bestScore` is computed via `Math.max(...)` across all retrieved chunks.
  - `NO_RESULTS` (`chunks.length === 0`), `INSUFFICIENT_EVIDENCE` (`bestScore < similarityThreshold`), and `RETRIEVAL_UNAVAILABLE` (retriever error) remain cleanly separated.
  - When `bestScore >= similarityThreshold`, individual chunks are filtered to retain `score >= similarityThreshold` or amendment chunks with `score >= RETRIEVAL_CONFIG.AMENDMENT_SCORE_THRESHOLD` (`0.55`), preventing weak trailing chunks (e.g., `0.22`) from polluting model context or `consultedSources`.

---

## 4. Citation & Source Integrity Assessment

- Fixed duplicate `sourceId` allocation when `search_knowledge_base` is called twice in one turn (`MAX_KB_SEARCHES = 2`): `findExistingSourceEntry(state.sourcesMap, chunk.id)` reuses the existing `S#` ID instead of minting a duplicate `S#` and pushing a duplicate `consultedSources` entry.
- `sources` continues to emit only sources cited in the final validated answer; `consultedSources` remains distinct.

---

## 5. Prompt-Template Assessment

- Inspected `server/prompts/agents/unified-v1.md`, `server/prompts/knowledgeBase/system-v1.md`, and `server/prompts/knowledgeBase/grounded-v1.md`.
- `unified-v1.md` accurately describes the unified assistant, `[S1]`/`[S2]` citation rules, missing-documentation non-prohibition rule, and untrusted-data handling.
- `grounded-v1.md` retains `<student_question>` only for the legacy `rag` strategy and is explicitly asserted by `tests/unit/promptRegistry.test.js:297`, `guardrails.test.js:69`, and `aiCapabilitiesGuardrails.test.js:350`. Per P3-T06 Section 3.C, this harmless legacy wording was **retained** to preserve compatibility.

---

## 6. Retrieved-Content Trust-Boundary Assessment

- **Hardening Added (`assistantTools.js`):**
  - Marked all `search_knowledge_base` tool envelopes with `trust: 'untrusted_reference'`.
  - Scanned every retrieved chunk's `content` with `detectPromptInjection`: poisoned chunks are dropped; if all chunks are poisoned, `executeSearchKnowledgeBase` sets `state.kbStatus = 'INSUFFICIENT_EVIDENCE'` and returns `chunks: []` (blocking policy-dependent `propose_transaction` calls).
  - Stripped simulated XML/control delimiter tags (`DELIMITER_TAG_PATTERN`) from `chunk.content`.

---

## 7. Evidence Sufficiency & Policy Behavior

- Preserved all P2-T11/P2-T12 capability rules: `unknown` remains KB-only, `out_of_scope` remains tool-free, and `canExecuteTool` continues to block `propose_transaction` when `policy.requiresKbEvidence && state.kbStatus !== 'SUFFICIENT'`.

---

## 8. Implementation Details

- **[server/src/features/chatAssistant/assistantTools.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/server/src/features/chatAssistant/assistantTools.js):** Added `isAmendmentChunk`, `findExistingSourceEntry`, `DELIMITER_TAG_PATTERN`, per-chunk threshold + amendment filtering, `detectPromptInjection` chunk filtering, `trust: 'untrusted_reference'` envelope field, and `sourceId` deduplication.

---

## 9. Regression Tests

Added [tests/unit/p3T06RagPromptHardening.test.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/tests/unit/p3T06RagPromptHardening.test.js) (7 tests across 4 suites) covering:
1. Per-chunk threshold (`0.60`) + amendment (`0.55`) retention and weak trailing chunk (`0.22`) removal.
2. `NO_RESULTS` vs. `INSUFFICIENT_EVIDENCE` vs. `RETRIEVAL_UNAVAILABLE` distinction.
3. Duplicate `chunk.id` `sourceId` deduplication across 2 KB calls and `sources` vs. `consultedSources` separation.
4. Prompt-injected chunk dropping + delimiter tag stripping.
5. Blocking `propose_transaction` when all retrieved chunks are poisoned.
6. `unified-v1.md` rendering and `unknown` / `out_of_scope` / `finance_read` policy invariants.

---

## 10. Verification Results

- **Focused P3-T06 Tests (`node --test tests/unit/p3T06RagPromptHardening.test.js`):** **7 passed, 0 failed, 0 skipped** across **5 suites** (`966.38 ms`).
- **Frontend Production Build (`npm --prefix client run build`):** **Passed** (`exit code 0`, `vite v6.4.4`, `269` modules transformed in `24.73s`).
- **Full Test Suite (`npm test`):** **758 passed, 0 failed, 0 skipped** across **226 suites** (`16749.52 ms`).

---

## 11. Git Diff Summary

P3-T06 Modified:
- `server/src/features/chatAssistant/assistantTools.js`

P3-T06 Added:
- `tests/unit/p3T06RagPromptHardening.test.js`
- `docs/reports/phase-3/P3-T06-rag-and-prompt-hardening.md`

---

## 12. Known Limitations

- Prompt injection detection on retrieved chunks relies on `detectPromptInjection` regexes; structural `trust: 'untrusted_reference'` and tool/write boundaries remain the primary defense.

---

## 13. Final Recommendation

**ACCEPT**
