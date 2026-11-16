import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TOOL_NAMES,
  canExecuteTool,
  evaluateRequestPolicy,
} from '../../server/src/features/chatAssistant/assistantPolicy.js';
import { executeRegisteredTool } from '../../server/src/features/chatAssistant/assistantTools.js';
import { finalizeAssistantResponse } from '../../server/src/features/chatAssistant/assistantResponse.js';
import { orchestrateUnifiedChat } from '../../server/src/features/chatAssistant/assistantOrchestrator.js';
import { normalizeUsageMetadata } from '../../server/src/shared/integrations/ai/providers/geminiProvider.js';
import { createUsageTracker } from '../../server/src/features/aiUsage/usageTracker.js';
import { formatDbToRecord } from '../../server/src/features/aiUsage/aiUsage.repository.js';
import { AI_EVAL_CASES } from './cases.js';
import { EVAL_CATEGORIES, EVAL_CATEGORY_LIST, EVAL_SEVERITIES, validateEvalCases } from './schema.js';

const EVAL_USER = Object.freeze({ id: 'eval-user-1', token: 'eval-token-1' });

function makeState() {
  return {
    totalCalls: 0,
    kbCalls: 0,
    proposalCalls: 0,
    kbStatus: null,
    sourcesMap: new Map(),
    consultedSources: [],
    toolsExecuted: [],
    lastPrimaryTool: null,
    proposal: null,
    retrieval: null,
  };
}

function compareArraysEqual(actual, expected, label, failures) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

async function evaluateSingleCase(evalCase) {
  const startedAt = Date.now();
  const failures = [];
  const actual = {};
  const { input, expected } = evalCase;

  try {
    // 1. Policy evaluation when message is provided without tool/answer-only mocking
    if (typeof input.message === 'string' && (expected.allowed !== undefined || expected.scopeState !== undefined || expected.capability !== undefined || expected.allowedTools !== undefined || expected.blockedTools !== undefined)) {
      const policy = evaluateRequestPolicy({
        message: input.message,
        history: input.history,
        trustedHistory: input.trustedHistory,
      });
      actual.allowed = policy.allowed;
      actual.scopeState = policy.scopeState;
      actual.capability = policy.capability;
      actual.allowedTools = policy.allowedTools;
      actual.requiresKbEvidence = policy.requiresKbEvidence;

      if (expected.allowed !== undefined && policy.allowed !== expected.allowed) {
        failures.push(`allowed: expected ${expected.allowed}, got ${policy.allowed}`);
      }
      if (expected.scopeState !== undefined && policy.scopeState !== expected.scopeState) {
        failures.push(`scopeState: expected "${expected.scopeState}", got "${policy.scopeState}"`);
      }
      if (expected.capability !== undefined && policy.capability !== expected.capability) {
        failures.push(`capability: expected "${expected.capability}", got "${policy.capability}"`);
      }
      if (expected.requiresKbEvidence !== undefined && policy.requiresKbEvidence !== expected.requiresKbEvidence) {
        failures.push(`requiresKbEvidence: expected ${expected.requiresKbEvidence}, got ${policy.requiresKbEvidence}`);
      }
      if (expected.allowedTools !== undefined) {
        compareArraysEqual([...policy.allowedTools].sort(), [...expected.allowedTools].sort(), 'allowedTools', failures);
      }
      if (expected.blockedTools !== undefined) {
        const state = makeState();
        for (const blocked of expected.blockedTools) {
          const gate = canExecuteTool({ policy, toolName: blocked, state });
          if (gate.allowed) {
            failures.push(`blockedTools: tool "${blocked}" was unexpectedly allowed`);
          }
        }
      }
    }

    // 2. KB retrieval & trust-boundary evaluation
    const state = makeState();
    let lastKbOutput = null;
    if (typeof input.kbQuery === 'string') {
      const retrieverFn = input.mockRetrievalError
        ? async () => { throw new Error(input.mockRetrievalError); }
        : async () => input.mockChunks || [];

      lastKbOutput = await executeRegisteredTool({
        toolName: TOOL_NAMES.SEARCH_KNOWLEDGE_BASE,
        rawArgs: { query: input.kbQuery },
        user: EVAL_USER,
        state,
        options: {
          retrieverFn,
          similarityThreshold: input.similarityThreshold ?? 0.6,
        },
      });

      if (typeof input.secondKbQuery === 'string') {
        lastKbOutput = await executeRegisteredTool({
          toolName: TOOL_NAMES.SEARCH_KNOWLEDGE_BASE,
          rawArgs: { query: input.secondKbQuery },
          user: EVAL_USER,
          state,
          options: {
            retrieverFn: async () => input.secondMockChunks || [],
            similarityThreshold: input.similarityThreshold ?? 0.6,
          },
        });
      }

      actual.kbStatus = lastKbOutput.status;
      actual.trust = lastKbOutput.trust;
      actual.chunkCount = lastKbOutput.chunks.length;
      actual.chunkIds = lastKbOutput.chunks.map((c) => c.sourceId);

      if (expected.kbStatus !== undefined && lastKbOutput.status !== expected.kbStatus) {
        failures.push(`kbStatus: expected "${expected.kbStatus}", got "${lastKbOutput.status}"`);
      }
      if (expected.trust !== undefined && lastKbOutput.trust !== expected.trust) {
        failures.push(`trust: expected "${expected.trust}", got "${lastKbOutput.trust}"`);
      }
      if (expected.chunkCount !== undefined && lastKbOutput.chunks.length !== expected.chunkCount) {
        failures.push(`chunkCount: expected ${expected.chunkCount}, got ${lastKbOutput.chunks.length}`);
      }
      if (expected.expectedChunkIds !== undefined) {
        compareArraysEqual(actual.chunkIds, expected.expectedChunkIds, 'expectedChunkIds', failures);
      }
      if (expected.answerExcludes && lastKbOutput.chunks.length > 0) {
        const joinedContent = lastKbOutput.chunks.map((c) => c.content).join('\n');
        for (const forbidden of expected.answerExcludes) {
          if (joinedContent.includes(forbidden)) {
            failures.push(`chunkContent unexpectedly includes "${forbidden}"`);
          }
        }
      }
    }

    // 3. Direct tool / orchestrator proposal evaluation
    if (Array.isArray(input.mockToolCalls) && input.mockToolCalls.length > 0) {
      if (typeof input.message === 'string') {
        let roundIdx = 0;
        const result = await orchestrateUnifiedChat(EVAL_USER, input.message, {
          usageRecorder: () => {},
          retrieverFn: async () => input.mockChunks || [],
          similarityThreshold: input.similarityThreshold ?? 0.6,
          toolTurnRunner: async () => {
            if (roundIdx < input.mockToolCalls.length) {
              const tc = input.mockToolCalls[roundIdx++];
              return {
                provider: 'google-genai',
                model: 'eval-model',
                text: '',
                functionCalls: [{ id: `c-${roundIdx}`, name: tc.name, args: tc.args || {} }],
                tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
              };
            }
            return {
              provider: 'google-genai',
              model: 'eval-model',
              text: input.mockModelAnswer || 'Done.',
              functionCalls: [],
              tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            };
          },
        });
        actual.hasProposal = Boolean(result.proposal);
        actual.proposalAmount = result.proposal?.amount ?? null;
      } else {
        let caughtErr = false;
        let propRes = null;
        try {
          propRes = await executeRegisteredTool({
            toolName: input.mockToolCalls[0].name,
            rawArgs: input.mockToolCalls[0].args || {},
            user: EVAL_USER,
            state,
          });
        } catch {
          caughtErr = true;
        }
        actual.toolError = caughtErr;
        actual.hasProposal = Boolean(propRes?.proposal);
      }

      if (expected.hasProposal !== undefined && actual.hasProposal !== expected.hasProposal) {
        failures.push(`hasProposal: expected ${expected.hasProposal}, got ${actual.hasProposal}`);
      }
      if (expected.proposalAmount !== undefined && actual.proposalAmount !== expected.proposalAmount) {
        failures.push(`proposalAmount: expected ${expected.proposalAmount}, got ${actual.proposalAmount}`);
      }
      if (expected.toolError !== undefined && actual.toolError !== expected.toolError) {
        failures.push(`toolError: expected ${expected.toolError}, got ${actual.toolError}`);
      }
      if (expected.proposalBlocked && actual.hasProposal) {
        failures.push('proposalBlocked: proposal was unexpectedly created');
      }
    }

    // 4. Citation and response finalization evaluation
    if (typeof input.mockModelAnswer === 'string' && !Array.isArray(input.mockToolCalls)) {
      const finalized = finalizeAssistantResponse({
        rawAnswer: input.mockModelAnswer,
        policy: {},
        state,
      });
      actual.answer = finalized.answer;
      actual.sourceIds = finalized.sources.map((s) => s.sourceId);
      actual.consultedCount = finalized.consultedSources.length;

      if (expected.expectedSourceIds !== undefined) {
        compareArraysEqual(actual.sourceIds, expected.expectedSourceIds, 'expectedSourceIds', failures);
      }
      if (expected.consultedCount !== undefined && actual.consultedCount !== expected.consultedCount) {
        failures.push(`consultedCount: expected ${expected.consultedCount}, got ${actual.consultedCount}`);
      }
      if (expected.answerEquals !== undefined && finalized.answer !== expected.answerEquals) {
        failures.push(`answerEquals: expected "${expected.answerEquals}", got "${finalized.answer}"`);
      }
      if (expected.answerIncludes) {
        for (const reqStr of expected.answerIncludes) {
          if (!finalized.answer.includes(reqStr)) {
            failures.push(`answerIncludes: missing "${reqStr}"`);
          }
        }
      }
      if (expected.answerExcludes) {
        for (const forbidden of expected.answerExcludes) {
          if (finalized.answer.includes(forbidden)) {
            failures.push(`answerExcludes: unexpectedly contains "${forbidden}"`);
          }
        }
      }
    }

    // 5. Usage telemetry & provenance evaluation
    if (evalCase.category === EVAL_CATEGORIES.USAGE_TELEMETRY) {
      if (input.dbUsageRow) {
        const rec = formatDbToRecord(input.dbUsageRow);
        actual.usageSource = rec.tokenUsage.usageSource;
        actual.tokenCountsAvailable = rec.tokenUsage.tokenCountsAvailable;
      } else if (input.trackerInput) {
        const tracker = createUsageTracker();
        const rec = tracker.trackUsage(input.trackerInput);
        actual.usageSource = rec.tokenUsage.usageSource;
        actual.tokenCountsAvailable = rec.tokenUsage.tokenCountsAvailable;
        actual.costStatus = rec.costStatus;
      } else {
        const normalized = normalizeUsageMetadata(input.rawUsageMetadata);
        actual.usageSource = normalized.usageSource;
        actual.tokenCountsAvailable = normalized.tokenCountsAvailable;
      }

      if (expected.usageSource !== undefined && actual.usageSource !== expected.usageSource) {
        failures.push(`usageSource: expected "${expected.usageSource}", got "${actual.usageSource}"`);
      }
      if (expected.tokenCountsAvailable !== undefined && actual.tokenCountsAvailable !== expected.tokenCountsAvailable) {
        failures.push(`tokenCountsAvailable: expected ${expected.tokenCountsAvailable}, got ${actual.tokenCountsAvailable}`);
      }
      if (expected.costStatus !== undefined && actual.costStatus !== expected.costStatus) {
        failures.push(`costStatus: expected "${expected.costStatus}", got "${actual.costStatus}"`);
      }
    }
  } catch (err) {
    failures.push(`Unhandled evaluation error: ${err.message}`);
  }

  return {
    id: evalCase.id,
    category: evalCase.category,
    severity: evalCase.severity,
    mandatory: evalCase.mandatory,
    passed: failures.length === 0,
    expected,
    actual,
    failures,
    durationMs: Date.now() - startedAt,
  };
}

export async function runDeterministicEvaluation(rawCases = AI_EVAL_CASES) {
  const cases = validateEvalCases(rawCases);
  const results = [];
  for (const evalCase of cases) {
    results.push(await evaluateSingleCase(evalCase));
  }

  const byCategory = {};
  for (const cat of EVAL_CATEGORY_LIST) {
    const catResults = results.filter((r) => r.category === cat);
    const catPassed = catResults.filter((r) => r.passed).length;
    byCategory[cat] = {
      total: catResults.length,
      passed: catPassed,
      failed: catResults.length - catPassed,
      passRate: catResults.length > 0 ? Number((catPassed / catResults.length).toFixed(4)) : 1,
    };
  }

  const passed = results.filter((r) => r.passed).length;
  const failedResults = results.filter((r) => !r.passed);
  const criticalFailures = failedResults.filter(
    (r) => r.severity === EVAL_SEVERITIES.P0 || r.severity === EVAL_SEVERITIES.P1
  ).length;
  const mandatoryFailed = failedResults.filter((r) => r.mandatory).length;

  return {
    timestamp: new Date().toISOString(),
    mode: 'deterministic_offline',
    summary: {
      total: results.length,
      passed,
      failed: failedResults.length,
      mandatoryFailed,
      criticalFailures,
      passRate: results.length > 0 ? Number((passed / results.length).toFixed(4)) : 1,
      failedCaseIds: failedResults.map((r) => r.id),
    },
    byCategory,
    results,
  };
}

export function formatEvaluationReport(report) {
  const lines = [
    '================================================================',
    '   SPENDWISE DETERMINISTIC AI EVALUATION REPORT (OFFLINE)       ',
    '================================================================',
    `Timestamp: ${report.timestamp}`,
    `Total: ${report.summary.total} | Passed: ${report.summary.passed} | Failed: ${report.summary.failed} | Mandatory Failed: ${report.summary.mandatoryFailed} | Critical (P0/P1) Failures: ${report.summary.criticalFailures}`,
    '',
    'Category Breakdown:',
  ];

  for (const [cat, stats] of Object.entries(report.byCategory)) {
    lines.push(`  - ${cat}: ${stats.passed}/${stats.total} (${(stats.passRate * 100).toFixed(1)}%)`);
  }

  if (report.summary.failedCaseIds.length > 0) {
    lines.push('', 'Failed Cases:');
    for (const r of report.results.filter((x) => !x.passed)) {
      lines.push(`  - [${r.severity}] ${r.id} (${r.category}): ${r.failures.join(' | ')}`);
    }
  }

  lines.push(
    '',
    'Note: This deterministic suite verifies policy, retrieval filtering, citation integrity,',
    'trust boundaries, response contracts, and telemetry provenance offline with mocked providers.',
    'It does not measure live LLM semantic accuracy.',
    '================================================================'
  );
  return lines.join('\n');
}

export function formatEvaluationJson(report) {
  return JSON.stringify(report, null, 2);
}

const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMainModule) {
  const wantJson = process.argv.includes('--json');
  runDeterministicEvaluation()
    .then((report) => {
      console.log(wantJson ? formatEvaluationJson(report) : formatEvaluationReport(report));
      if (report.summary.mandatoryFailed > 0) {
        process.exitCode = 1;
      }
    })
    .catch((err) => {
      console.error('[EvalAI] Fatal evaluation error:', err.message);
      process.exitCode = 1;
    });
}
