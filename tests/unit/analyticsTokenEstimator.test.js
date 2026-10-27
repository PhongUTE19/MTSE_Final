import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getDeterministicRandom,
  deterministicIntInRange,
  resolveEstimationProfile,
  estimateTokensForRequest,
  calculateEstimatedBackfillCost,
  ESTIMATION_PROFILES,
} from '../../server/src/features/analytics/tokenEstimator.js';
import {
  formatDbToRecord,
  formatRecordForDb,
} from '../../server/src/features/analytics/analytics.repository.js';
import { calculateOverviewMetrics } from '../../server/src/features/analytics/analytics.utils.js';

describe('Deterministic Token & Cost Estimation Suite', () => {
  describe('1. Deterministic Pseudo-Random Generator & Repeatability', () => {
    it('produces identical random numbers for the same seed and salt on repeated calls', () => {
      const seed = 'req-fixed-id-12345';
      const rand1 = getDeterministicRandom(seed, 'input');
      const rand2 = getDeterministicRandom(seed, 'input');
      const rand3 = getDeterministicRandom(seed, 'input');

      assert.equal(rand1, rand2);
      assert.equal(rand2, rand3);
      assert.ok(rand1 >= 0 && rand1 < 1, 'Value must be in [0, 1)');
    });

    it('produces different values for different salts on the same seed', () => {
      const seed = 'req-fixed-id-12345';
      const randIn = getDeterministicRandom(seed, 'input');
      const randOut = getDeterministicRandom(seed, 'output');

      assert.notEqual(randIn, randOut);
    });

    it('generates consistent integers within the specified [min, max] range', () => {
      const seed = 'req-range-test-67890';
      const val1 = deterministicIntInRange(seed, 100, 200, 'in');
      const val2 = deterministicIntInRange(seed, 100, 200, 'in');

      assert.equal(val1, val2);
      assert.ok(val1 >= 100 && val1 <= 200);
    });
  });

  describe('2. Sensible Task Profiles & Range Calibration', () => {
    it('selects RECEIPT_EXTRACTION profile and generates plausible ranges', () => {
      const req = {
        id: 'rec-receipt-1',
        feature: 'receipt_extraction',
        operation: 'extractReceiptImage',
        model: 'gemini-3.5-flash-lite',
        outcome: 'success',
      };

      const profile = resolveEstimationProfile(req);
      assert.equal(profile, ESTIMATION_PROFILES.RECEIPT_EXTRACTION);

      const estimate = estimateTokensForRequest(req);
      assert.equal(estimate.isEstimated, true);
      assert.ok(estimate.estimatedInputTokens >= 1100 && estimate.estimatedInputTokens <= 1300);
      assert.ok(estimate.estimatedOutputTokens >= 140 && estimate.estimatedOutputTokens <= 280);
      assert.equal(estimate.estimatedTotalTokens, estimate.estimatedInputTokens + estimate.estimatedOutputTokens);
    });

    it('reduces output token estimation on failed receipt extractions', () => {
      const failedReq = {
        id: 'rec-receipt-failed-1',
        feature: 'receipt_extraction',
        operation: 'extractReceiptImage',
        model: 'gemini-3.5-flash-lite',
        outcome: 'failure',
      };

      const estimate = estimateTokensForRequest(failedReq);
      assert.ok(estimate.estimatedOutputTokens <= 10, 'Failed extraction should estimate minimal output tokens');
      assert.ok(estimate.estimatedInputTokens >= 1100, 'Input prompt was still transmitted');
    });

    it('selects AGENT_TOOL_SELECTION profile for tool call operations', () => {
      const req = {
        id: 'rec-tool-1',
        feature: 'expense_agent',
        operation: 'expenseAgent.toolSelection',
        model: 'gemini-3.5-flash-lite',
        outcome: 'success',
      };

      const estimate = estimateTokensForRequest(req);
      assert.ok(estimate.estimatedInputTokens >= 750 && estimate.estimatedInputTokens <= 950);
      assert.ok(estimate.estimatedOutputTokens >= 20 && estimate.estimatedOutputTokens <= 80);
      assert.equal(estimate.estimatedTotalTokens, estimate.effectiveInputTokens + estimate.effectiveOutputTokens);
    });

    it('selects KNOWLEDGE_EMBEDDING profile with zero output tokens for text embeddings', () => {
      const req = {
        id: 'rec-embed-1',
        feature: 'knowledge',
        operation: 'embedText',
        model: 'gemini-embedding-001',
        outcome: 'success',
      };

      const estimate = estimateTokensForRequest(req);
      assert.ok(estimate.estimatedInputTokens >= 120 && estimate.estimatedInputTokens <= 320);
      assert.equal(estimate.estimatedOutputTokens, 0, 'Embedding models must have 0 output tokens');
      assert.equal(estimate.estimatedTotalTokens, estimate.estimatedInputTokens);
    });
  });

  describe('3. Partial / Missing Tokens Preservation & Total Derivation', () => {
    it('preserves existing actual output tokens when only input is missing', () => {
      const req = {
        id: 'rec-partial-out',
        feature: 'knowledge',
        operation: 'embedText',
        model: 'gemini-embedding-001',
        input_tokens: null,
        output_tokens: 0, // Recorded actual output
        total_tokens: null,
      };

      const estimate = estimateTokensForRequest(req);
      assert.equal(estimate.isEstimated, true);
      assert.ok(typeof estimate.estimatedInputTokens === 'number');
      assert.equal(estimate.estimatedOutputTokens, null, 'Must NOT estimate output when actual output exists');
      assert.equal(estimate.effectiveOutputTokens, 0);
      assert.equal(estimate.effectiveTotalTokens, estimate.effectiveInputTokens);
    });

    it('preserves existing actual input tokens when only output is missing', () => {
      const req = {
        id: 'rec-partial-in',
        feature: 'expense_agent',
        operation: 'expenseAgent.summary',
        model: 'gemini-3.5-flash-lite',
        input_tokens: 500, // Recorded actual input
        output_tokens: null,
        total_tokens: null,
      };

      const estimate = estimateTokensForRequest(req);
      assert.equal(estimate.isEstimated, true);
      assert.equal(estimate.estimatedInputTokens, null, 'Must NOT estimate input when actual input exists');
      assert.equal(estimate.effectiveInputTokens, 500);
      assert.ok(typeof estimate.estimatedOutputTokens === 'number');
      assert.equal(estimate.effectiveTotalTokens, 500 + estimate.estimatedOutputTokens);
    });

    it('returns isEstimated = false and null estimates when provider tokens are fully complete', () => {
      const completeReq = {
        id: 'rec-complete-1',
        input_tokens: 600,
        output_tokens: 120,
        total_tokens: 720,
      };

      const estimate = estimateTokensForRequest(completeReq);
      assert.equal(estimate.isEstimated, false);
      assert.equal(estimate.estimatedInputTokens, null);
      assert.equal(estimate.estimatedOutputTokens, null);
      assert.equal(estimate.estimatedTotalTokens, null);
      assert.equal(estimate.effectiveTotalTokens, 720);
    });
  });

  describe('4. Pricing Lookup & Estimated Backfill Cost Calculation', () => {
    it('calculates cost from estimated tokens using verified official rates for gemini-3.5-flash-lite', () => {
      const tokens = {
        effectiveInputTokens: 1000,
        effectiveOutputTokens: 500,
      };

      // gemini-3.5-flash-lite: input $0.075 / 1M, output $0.30 / 1M
      // 1000 / 1M * 0.075 = 0.000075
      // 500 / 1M * 0.30 = 0.000150
      // total = 0.000225 USD
      const result = calculateEstimatedBackfillCost('gemini-3.5-flash-lite', tokens, '2026-10-25T10:00:00Z');
      assert.equal(result.costStatus, 'estimated_backfill');
      assert.equal(result.estimatedCostUsd, 0.000225);
      assert.equal(result.pricingModel, 'gemini-3.5-flash-lite');
    });

    it('calculates cost for gemini-embedding-001 with zero output cost', () => {
      const tokens = {
        effectiveInputTokens: 200,
        effectiveOutputTokens: 0,
      };

      // 200 / 1M * 0.02 = 0.000004 USD
      const result = calculateEstimatedBackfillCost('gemini-embedding-001', tokens, '2026-10-25T10:00:00Z');
      assert.equal(result.costStatus, 'estimated_backfill');
      assert.equal(result.estimatedCostUsd, 0.000004);
    });

    it('returns unknown_pricing and null cost for unrecognized models without fabricating prices', () => {
      const tokens = {
        effectiveInputTokens: 1000,
        effectiveOutputTokens: 500,
      };

      const result = calculateEstimatedBackfillCost('unrecognized-custom-model', tokens, '2026-10-25T10:00:00Z');
      assert.equal(result.costStatus, 'unknown_pricing');
      assert.equal(result.estimatedCostUsd, null);
      assert.equal(result.pricingModel, null);
    });
  });

  describe('5. Database Mapping & Status Preservation', () => {
    it('persists estimated token fields cleanly in formatRecordForDb', () => {
      const record = {
        id: 'rec-db-1',
        timestamp: '2026-10-25T10:00:00Z',
        feature: 'chat',
        operation: 'message',
        model: 'gemini-3.5-flash-lite',
        outcome: 'success',
        tokenUsage: { inputTokens: null, outputTokens: null, totalTokens: null, tokenCountsAvailable: false },
        estimatedTokens: {
          inputTokens: 500,
          outputTokens: 100,
          totalTokens: 600,
        },
        estimatedCost: 0.0000675,
        costStatus: 'estimated_backfill',
      };

      const dbRow = formatRecordForDb(record);
      assert.equal(dbRow.estimated_input_tokens, 500);
      assert.equal(dbRow.estimated_output_tokens, 100);
      assert.equal(dbRow.estimated_total_tokens, 600);
      assert.equal(dbRow.cost_status, 'estimated_backfill');
      assert.equal(dbRow.estimated_cost, 0.0000675);
    });

    it('decodes stored estimated token fields and marks estimated_backfill status in formatDbToRecord', () => {
      const row = {
        id: 'rec-db-2',
        timestamp: '2026-10-25T10:00:00Z',
        feature: 'receipt_extraction',
        operation: 'extractReceiptImage',
        model: 'gemini-3.5-flash-lite',
        outcome: 'success',
        input_tokens: null,
        output_tokens: null,
        total_tokens: null,
        estimated_input_tokens: 1200,
        estimated_output_tokens: 160,
        estimated_total_tokens: 1360,
        estimated_cost: 0.000138,
        cost_status: 'estimated_backfill',
      };

      const record = formatDbToRecord(row);
      assert.equal(record.estimatedTokens.isEstimated, true);
      assert.equal(record.estimatedTokens.inputTokens, 1200);
      assert.equal(record.estimatedTokens.outputTokens, 160);
      assert.equal(record.estimatedTokens.totalTokens, 1360);
      assert.equal(record.costStatus, 'estimated_backfill');
      assert.equal(record.estimatedCost, 0.000138);
    });
  });

  describe('6. Overview Metrics: Verified vs Estimated Separation', () => {
    it('preserves verified actual average cost without mixing synthetic estimates', () => {
      const records = [
        // Verified actual usage records
        {
          outcome: 'success',
          durationMs: 100,
          estimatedCost: 0.0002,
          costStatus: 'calculated',
          tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, tokenCountsAvailable: true },
        },
        {
          outcome: 'success',
          durationMs: 200,
          estimatedCost: 0.0004,
          costStatus: 'calculated',
          tokenUsage: { inputTokens: 200, outputTokens: 100, totalTokens: 300, tokenCountsAvailable: true },
        },
        // Estimated backfill usage records
        {
          outcome: 'success',
          durationMs: 300,
          estimatedCost: 0.0001,
          costStatus: 'estimated_backfill',
          tokenUsage: { tokenCountsAvailable: false },
          estimatedTokens: { effectiveTotalTokens: 100, isEstimated: true },
        },
        // Unpriced record
        {
          outcome: 'failure',
          durationMs: 50,
          estimatedCost: null,
          costStatus: 'unknown_pricing',
        },
      ];

      const metrics = calculateOverviewMetrics(records);

      assert.equal(metrics.totalRequests, 4);

      // Verified actual metrics (MUST NOT include the $0.0001 from estimated_backfill)
      assert.equal(metrics.verifiedPricedCount, 2);
      assert.equal(metrics.pricedRequestCount, 2);
      assert.equal(metrics.verifiedCostUsd, 0.0006);
      assert.equal(metrics.totalCostUsd, 0.0006);
      assert.equal(metrics.verifiedAvgCostPerRequestUsd, 0.0003);
      assert.equal(metrics.avgCostPerRequestUsd, 0.0003);

      // Estimated metrics (explicitly isolated and labeled)
      assert.equal(metrics.estimatedPricedCount, 1);
      assert.equal(metrics.estimatedCostUsd, 0.0001);
      assert.equal(metrics.estimatedAvgCostPerRequestUsd, 0.0001);

      // Combined totals
      assert.equal(metrics.totalPricedCount, 3);
      assert.equal(metrics.combinedTotalCostUsd, 0.0007);
      // Combined avg = 0.0007 / 3 = 0.000233
      assert.equal(metrics.combinedAvgCostPerRequestUsd, 0.000233);
      // Coverage rate = 3 / 4 * 100 = 75.0%
      assert.equal(metrics.costCoverageRate, 75.0);
      assert.equal(metrics.unpricedRequestCount, 1);
    });
  });
});
