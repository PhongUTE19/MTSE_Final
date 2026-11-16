import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EVAL_CATEGORIES,
  EVAL_CATEGORY_LIST,
  validateEvalCases,
} from '../../evals/ai/schema.js';
import { AI_EVAL_CASES } from '../../evals/ai/cases.js';
import {
  formatEvaluationJson,
  formatEvaluationReport,
  runDeterministicEvaluation,
} from '../../evals/ai/runner.js';
import { generateToolTurnStream } from '../../server/src/shared/integrations/ai/providers/geminiProvider.js';
import { orchestrateUnifiedChatStream } from '../../server/src/features/chatAssistant/assistantOrchestrator.js';

describe('P3-T07 AI Evaluation & Observability Suite', () => {
  describe('1. Evaluation Case Schema & Validation', () => {
    it('validates canonical AI_EVAL_CASES and covers all 6 required categories', () => {
      const validated = validateEvalCases(AI_EVAL_CASES);
      assert.equal(validated.length, AI_EVAL_CASES.length);
      for (const cat of EVAL_CATEGORY_LIST) {
        assert.ok(
          validated.some((c) => c.category === cat),
          `Missing evaluation cases for category "${cat}"`
        );
      }
    });

    it('rejects malformed evaluation cases and duplicate case IDs', () => {
      assert.throws(() => validateEvalCases('not-an-array'), /must be an array/i);
      assert.throws(
        () => validateEvalCases([{ id: '', category: 'invalid_cat', description: 'bad', input: {}, expected: {} }]),
        /Invalid evaluation case/i
      );
      assert.throws(
        () =>
          validateEvalCases([
            { id: 'DUP-1', category: EVAL_CATEGORIES.SCOPE_POLICY, description: 'a', input: {}, expected: {} },
            { id: 'DUP-1', category: EVAL_CATEGORIES.SCOPE_POLICY, description: 'b', input: {}, expected: {} },
          ]),
        /Duplicate evaluation case ID/i
      );
    });
  });

  describe('2. Deterministic Evaluation Execution & Metrics', () => {
    it('executes all canonical evaluation cases deterministically with 100% pass rate and stable ordering', async () => {
      const r1 = await runDeterministicEvaluation(AI_EVAL_CASES);
      const r2 = await runDeterministicEvaluation(AI_EVAL_CASES);

      assert.equal(r1.summary.total, AI_EVAL_CASES.length);
      assert.equal(r1.summary.failed, 0);
      assert.equal(r1.summary.mandatoryFailed, 0);
      assert.equal(r1.summary.criticalFailures, 0);
      assert.equal(r1.summary.passRate, 1);
      assert.deepEqual(
        r1.results.map((r) => r.id),
        AI_EVAL_CASES.map((c) => c.id)
      );
      assert.deepEqual(
        r1.results.map((r) => ({ id: r.id, passed: r.passed })),
        r2.results.map((r) => ({ id: r.id, passed: r.passed }))
      );

      for (const cat of EVAL_CATEGORY_LIST) {
        assert.equal(r1.byCategory[cat].failed, 0);
        assert.equal(r1.byCategory[cat].passRate, 1);
      }
    });

    it('detects and reports violated expectations and mandatory failures accurately', async () => {
      const failingReport = await runDeterministicEvaluation([
        {
          id: 'FAIL-01',
          category: EVAL_CATEGORIES.SCOPE_POLICY,
          description: 'Intentionally mismatched expectation to verify failure detection',
          severity: 'P1',
          mandatory: true,
          input: { message: 'Write a python script to sort numbers' },
          expected: { allowed: true }, // Actual is false
        },
      ]);

      assert.equal(failingReport.summary.total, 1);
      assert.equal(failingReport.summary.passed, 0);
      assert.equal(failingReport.summary.failed, 1);
      assert.equal(failingReport.summary.mandatoryFailed, 1);
      assert.equal(failingReport.summary.criticalFailures, 1);
      assert.deepEqual(failingReport.summary.failedCaseIds, ['FAIL-01']);
      assert.match(failingReport.results[0].failures[0], /allowed: expected true, got false/);

      const textReport = formatEvaluationReport(failingReport);
      assert.match(textReport, /FAIL-01/);
      assert.match(textReport, /does not measure live LLM semantic accuracy/i);

      const jsonReport = JSON.parse(formatEvaluationJson(failingReport));
      assert.equal(jsonReport.summary.mandatoryFailed, 1);
    });
  });

  describe('3. Streaming TTFT Observability (timeToFirstTokenMs)', () => {
    it('captures timeToFirstTokenMs in generateToolTurnStream and forwards it to orchestrator telemetry', async () => {
      const mockAi = {
        models: {
          generateContentStream: async () => (async function* () {
            yield { text: 'Hello ' };
            yield { text: 'world' };
          })(),
        },
      };

      const stream = await generateToolTurnStream({ prompt: 'Hi', ai: mockAi });
      let complete = null;
      for await (const item of stream) {
        if (item.type === 'turn_complete') complete = item;
      }
      assert.equal(typeof complete.timeToFirstTokenMs, 'number');
      assert.ok(complete.timeToFirstTokenMs >= 0);

      const recorded = [];
      await orchestrateUnifiedChatStream(
        { id: 'u1', token: 't1' },
        'How much did I spend?',
        () => {},
        {
          enablePersistence: false,
          usageRecorder: (rec) => recorded.push(rec),
          toolTurnStreamRunner: async () => (async function* () {
            yield { type: 'text', text: 'You spent 50,000 VND.' };
            yield {
              type: 'turn_complete',
              provider: 'google-genai',
              model: 'test-model',
              text: 'You spent 50,000 VND.',
              functionCalls: [],
              tokenUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
            };
          })(),
        }
      );

      assert.equal(recorded.length, 1);
      assert.equal(typeof recorded[0].timeToFirstTokenMs, 'number');
      assert.ok(recorded[0].timeToFirstTokenMs >= 0);
      assert.equal(recorded[0].tokenUsage.usageSource, 'provider_reported');
    });
  });
});
