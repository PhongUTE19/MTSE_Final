# P3-T05 — Feature Dependency Boundary & Architecture Cleanup Report

**Phase:** Phase 3 — AI Architecture  
**Task:** P3-T05 — Feature Dependency Boundary & Architecture Cleanup  
**Branch:** `provider-adapter` (post P3-T04)  
**Date:** `2026-11-18`  
**Final Recommendation:** **ACCEPT**

---

## 1. Initial Baseline

- **Pre-Task Test Baseline:** `748` passed, `0` failed, `0` skipped across `220` suites (`npm test`).
- **Pre-Task Build Baseline:** `npm --prefix client run build` passed (`269` modules transformed).

---

## 2. Original Dependency Graph & Cycle

Before P3-T05, `chatAssistant` and `expenseAssistant` had a bidirectional feature dependency cycle:

1. `chatAssistant/chatAssistant.service.js` $\rightarrow$ `expenseAssistant/expenseAssistant.service.js` (`runExpenseAssistantForUser`)
2. `chatAssistant/assistantPrompt.js` $\rightarrow$ `expenseAssistant/geminiExpenseAssistant.js` (`getVietnamDate`)
3. `chatAssistant/assistantTools.js` $\rightarrow$ `expenseAssistant/expenseAssistant.schema.js` (`searchTransactionsArgsSchema`, `spendingSummaryArgsSchema`, `createTransactionArgsSchema`)
4. `expenseAssistant/expenseAssistant.controller.js` $\rightarrow$ `chatAssistant/assistantOrchestrator.js` (`orchestrateUnifiedChat`)

---

## 3. Target Module Ownership & Dependency Direction

| Capability | Canonical Owner | Rationale |
| :--- | :--- | :--- |
| `getVietnamDate` | `server/src/shared/validation/date.js` | Calendar/timezone date utility alongside `ISO_DATE_PATTERN` and `isValidIsoCalendarDate`; re-exported by `geminiExpenseAssistant.js` for compatibility. |
| `searchTransactionsArgsSchema`, `spendingSummaryArgsSchema`, `createTransactionArgsSchema` | `server/src/features/transaction/transaction.schema.js` | Transaction domain query/summary/proposal Zod schemas extending `transactionSchema`; re-exported by `expenseAssistant.schema.js` for compatibility. |
| Unified AI orchestration | `server/src/features/chatAssistant/` | Owns `orchestrateUnifiedChat`, `orchestrateUnifiedChatStream`, policy, tools, and response sanitization. |
| Legacy `/api/expense-assistant` compatibility | `server/src/features/expenseAssistant/expenseAssistant.service.js` | Exports `runUnifiedExpenseAssistant` (delegating to `orchestrateUnifiedChat` and mapping `propose_transaction` $\rightarrow$ `create_transaction`) and registers `runExpenseAssistantForUser` via `registerLegacyAgentRunner`. |

---

## 4. Implementation Details

- **[server/src/shared/validation/date.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/server/src/shared/validation/date.js):** Added `getVietnamDate`.
- **[server/src/features/transaction/transaction.schema.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/server/src/features/transaction/transaction.schema.js):** Moved `searchTransactionsArgsSchema`, `spendingSummaryArgsSchema`, and `createTransactionArgsSchema` to the canonical transaction schema module.
- **[server/src/features/expenseAssistant/expenseAssistant.schema.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/server/src/features/expenseAssistant/expenseAssistant.schema.js) & [geminiExpenseAssistant.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/server/src/features/expenseAssistant/geminiExpenseAssistant.js):** Re-exported moved schemas and `getVietnamDate` for backwards compatibility.
- **[server/src/features/chatAssistant/assistantPrompt.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/server/src/features/chatAssistant/assistantPrompt.js) & [assistantTools.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/server/src/features/chatAssistant/assistantTools.js):** Updated imports to `shared/validation/date.js` and `transaction/transaction.schema.js`.
- **[server/src/features/chatAssistant/chatAssistant.service.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/server/src/features/chatAssistant/chatAssistant.service.js):** Removed direct `expenseAssistant.service.js` import; added `registerLegacyAgentRunner(runner)` registration hook.
- **[server/src/features/expenseAssistant/expenseAssistant.service.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/server/src/features/expenseAssistant/expenseAssistant.service.js) & [expenseAssistant.controller.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/server/src/features/expenseAssistant/expenseAssistant.controller.js):** Added `runUnifiedExpenseAssistant` and `registerLegacyAgentRunner(runExpenseAssistantForUser)`; removed `assistantOrchestrator.js` import and proposal-mapping logic from `expenseAssistant.controller.js`.

---

## 5. Provider Boundary Assessment

- Assessed `geminiProvider.js` (`F-15`). Kept `generateAnswer`'s existing `validateChatResponse` call and `extractReceiptImage`'s `sharp` preprocessing intact to preserve public provider behavior and avoid introducing unnecessary provider-neutral abstractions without a second provider.

---

## 6. Sync / Stream Orchestration Duplication Assessment

- Assessed `assistantOrchestrator.js` (`F-07`). Extracted `createTurnState()`, `buildModelTurnContent(calls, rawAssistantContent)`, and `executeToolCallsRound({ calls, policy, state, user, options, signal, onProposal })`.
- Intentionally retained separate top-level `orchestrateUnifiedChat` and `orchestrateUnifiedChatStream` loops because their cancellation, checkpointing, SSE emission, and terminal-persistence lifecycles differ materially; forcing a single generic state machine would add indirection without benefit.

---

## 7. Regression Tests

Added [tests/unit/p3T05DependencyBoundaries.test.js](file:///d:/HCMUTE/2627S1/New_Technologies_In_Software_Engineering/Final/MTSE_Final/tests/unit/p3T05DependencyBoundaries.test.js) (3 tests):
1. Static AST/regex import-graph DFS cycle check across all files in `chatAssistant/` and `expenseAssistant/`, asserting zero `chatAssistant` $\rightarrow$ `expenseAssistant` imports, zero `expenseAssistant.controller.js` $\rightarrow$ `chatAssistant` imports, and zero cycles.
2. Canonical ownership & legacy re-export identity checks for `getVietnamDate` and the 3 transaction tool schemas.
3. End-to-end `runUnifiedExpenseAssistant` legacy `create_transaction` compatibility check.

---

## 8. Verification Results

- **Focused Tests (`node --test tests/unit/p3T05DependencyBoundaries.test.js ...`):** **46 passed, 0 failed, 0 skipped** across **23 suites** (`2194.65 ms`).
- **Full Test Suite (`npm test`):** **751 passed, 0 failed, 0 skipped** across **221 suites** (`16198.55 ms`).
- **Frontend Production Build (`npm --prefix client run build`):** **Passed** (`exit code 0`, `vite v6.4.4`, `269` modules transformed).
- **Circular Dependency Check:** Regex-based static relative ESM import graph traversal across `chatAssistant/` and `expenseAssistant/` found **0 cycles** (down from 4 cross-feature edges forming a cycle before P3-T05). Limitation: inspects static relative `import`/`export ... from` specifiers only (dynamic `import()` is not used in these modules).

---

## 9. Final Dependency Graph

```text
shared/validation/date.js  <── chatAssistant/assistantPrompt.js
transaction.schema.js      <── chatAssistant/assistantTools.js
transaction.schema.js      <── expenseAssistant/expenseAssistant.schema.js
chatAssistant/*            ──> knowledgeBase/*, transaction/*, chatHistory/*, aiUsage/*, shared/* (0 imports from expenseAssistant)
expenseAssistant.service   ──> chatAssistant.service / assistantOrchestrator (unidirectional legacy facade)
expenseAssistant.controller──> expenseAssistant.service (0 imports from chatAssistant)
```

---

## 10. Git Diff Summary

Modified:
- `server/src/shared/validation/date.js`
- `server/src/features/transaction/transaction.schema.js`
- `server/src/features/expenseAssistant/expenseAssistant.schema.js`
- `server/src/features/expenseAssistant/geminiExpenseAssistant.js`
- `server/src/features/expenseAssistant/expenseAssistant.service.js`
- `server/src/features/expenseAssistant/expenseAssistant.controller.js`
- `server/src/features/chatAssistant/assistantPrompt.js`
- `server/src/features/chatAssistant/assistantTools.js`
- `server/src/features/chatAssistant/chatAssistant.service.js`
- `server/src/features/chatAssistant/assistantOrchestrator.js`

Added:
- `tests/unit/p3T05DependencyBoundaries.test.js`
- `docs/reports/phase-3/P3-T05-feature-dependency-boundaries.md`

---

## 11. Known Limitations

- If a standalone test calls `orchestrateChat(..., { strategy: 'agent' })` without `options.agentRunner` and without ever importing `expenseAssistant.service.js`, `registeredLegacyAgentRunner` will not be registered and will return an explicit 500 `ChatAssistantServiceError`. In production (`server.js`) and all existing test suites, `expenseAssistant` is imported on startup.

---

## 12. Final Recommendation

**ACCEPT**
