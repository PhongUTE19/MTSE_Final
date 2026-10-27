import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatDbToRecord, formatRecordForDb } from '../../server/src/features/analytics/analytics.repository.js';
import {
  calculateRequestCost,
  MODEL_PRICING_REGISTRY,
  normalizeModelName,
} from '../../server/src/features/analytics/pricingConfig.js';
import { calculateOverviewMetrics } from '../../server/src/features/analytics/analytics.utils.js';

describe('Historical AI Telemetry Data & UI Field Mapping Suite', () => {
  describe('1. Legacy Hash Detection & Prompt Version Recovery', () => {
    it('isolates 64-character SHA-256 hex string from prompt_version into prompt_hash without inventing a version', () => {
      const legacyRow = {
        id: 'rec-legacy-hash-1',
        timestamp: '2026-10-25T07:10:00.000Z',
        prompt_id: null,
        prompt_version: '8c9b578b288b9dd0d2ce299b3cd64a2404d188cef9c14db5fc5dd9446699311f',
        prompt_hash: null,
      };

      const record = formatDbToRecord(legacyRow);
      assert.equal(record.promptHash, '8c9b578b288b9dd0d2ce299b3cd64a2404d188cef9c14db5fc5dd9446699311f');
      assert.equal(record.promptVersion, null, 'Must NOT invent an explicit version (e.g. v1) when only a hash is present');
      assert.equal(record.promptId, null);
    });

    it('recovers explicit version and hash from composite <version>:<hash> format', () => {
      const compositeRow = {
        id: 'rec-comp-1',
        timestamp: '2026-10-25T07:12:00.000Z',
        prompt_id: null,
        prompt_version: 'receipt-v3:ddeb76aaa7d49ee52363870faa4951b9bdf1addfecd6208f2466ede81bc09243',
        prompt_hash: null,
      };

      const record = formatDbToRecord(compositeRow);
      assert.equal(record.promptVersion, 'receipt-v3');
      assert.equal(record.promptHash, 'ddeb76aaa7d49ee52363870faa4951b9bdf1addfecd6208f2466ede81bc09243');
    });

    it('recovers prompt_id, explicit version, and hash from composite <id>:<version>:<hash> format', () => {
      const compositeRow = {
        id: 'rec-comp-2',
        timestamp: '2026-10-25T07:15:00.000Z',
        prompt_id: null,
        prompt_version: 'expense_agent_assistant:v2:4dc81826f9882504c128de71e305c47d9cbeeb16daf86a1098e5002bd73196dc',
        prompt_hash: null,
      };

      const record = formatDbToRecord(compositeRow);
      assert.equal(record.promptId, 'expense_agent_assistant');
      assert.equal(record.promptVersion, 'v2');
      assert.equal(record.promptHash, '4dc81826f9882504c128de71e305c47d9cbeeb16daf86a1098e5002bd73196dc');
    });

    it('preserves clean logical versions and existing prompt_hash values', () => {
      const cleanRow = {
        id: 'rec-clean-1',
        timestamp: '2026-10-26T10:00:00.000Z',
        prompt_id: 'receipt_extraction',
        prompt_version: 'receipt-v3',
        prompt_hash: 'ddeb76aaa7d49ee52363870faa4951b9bdf1addfecd6208f2466ede81bc09243',
      };

      const record = formatDbToRecord(cleanRow);
      assert.equal(record.promptId, 'receipt_extraction');
      assert.equal(record.promptVersion, 'receipt-v3');
      assert.equal(record.promptHash, 'ddeb76aaa7d49ee52363870faa4951b9bdf1addfecd6208f2466ede81bc09243');
    });
  });

  describe('2. UI Field Mapping & Truthful Presentation Rules', () => {
    it('formats Prompt Version column logic to never render content hashes', () => {
      // Helper simulating the UI column display decision
      const getPromptVersionDisplay = (rec) => {
        const isPureHash = rec.promptVersion && /^[a-f0-9]{64}$/i.test(rec.promptVersion.trim());
        const hasExplicitVersion = Boolean(rec.promptVersion && !isPureHash);
        return hasExplicitVersion ? rec.promptVersion : 'Legacy / unknown';
      };

      // Case A: Record with explicit version
      assert.equal(getPromptVersionDisplay({ promptVersion: 'v1', promptHash: 'abc...' }), 'v1');
      assert.equal(getPromptVersionDisplay({ promptVersion: 'receipt-v3', promptHash: 'def...' }), 'receipt-v3');

      // Case B: Record with null version (legacy hash separated)
      assert.equal(getPromptVersionDisplay({ promptVersion: null, promptHash: '8c9b578b288b9dd0d2ce299b3cd64a2404d188cef9c14db5fc5dd9446699311f' }), 'Legacy / unknown');

      // Case C: Un-migrated record with 64-hex hash in promptVersion
      assert.equal(getPromptVersionDisplay({ promptVersion: '8c9b578b288b9dd0d2ce299b3cd64a2404d188cef9c14db5fc5dd9446699311f' }), 'Legacy / unknown');
    });

    it('formats Tokens column logic without fabricating zero for missing counts', () => {
      const getTokensDisplay = (tokenUsage) => {
        if (!tokenUsage?.tokenCountsAvailable) {
          return '—';
        }
        const inStr = tokenUsage.inputTokens != null ? tokenUsage.inputTokens : '—';
        const outStr = tokenUsage.outputTokens != null ? tokenUsage.outputTokens : '—';
        const totStr = tokenUsage.totalTokens != null ? tokenUsage.totalTokens : '—';
        return `${inStr} / ${outStr} (${totStr})`;
      };

      // Complete tokens
      assert.equal(getTokensDisplay({ tokenCountsAvailable: true, inputTokens: 100, outputTokens: 50, totalTokens: 150 }), '100 / 50 (150)');

      // Incomplete tokens (input null, output 0)
      assert.equal(getTokensDisplay({ tokenCountsAvailable: true, inputTokens: null, outputTokens: 0, totalTokens: null }), '— / 0 (—)');

      // Unavailable tokens
      assert.equal(getTokensDisplay({ tokenCountsAvailable: false }), '—');
    });
  });

  describe('3. Token Repair & Total Derivation Rules', () => {
    it('safely derives total_tokens when missing and both input and output counts exist', () => {
      const rowMissingTotal = {
        id: 'rec-missing-tot',
        input_tokens: 300,
        output_tokens: 150,
        total_tokens: null,
        token_counts_available: true,
      };

      const record = formatDbToRecord(rowMissingTotal);
      assert.equal(record.tokenUsage.totalTokens, 450);
      assert.equal(record.tokenUsage.tokenCountsComplete, true);
    });

    it('never overwrites an existing provider-reported total_tokens', () => {
      const rowWithReportedTotal = {
        id: 'rec-reported-tot',
        input_tokens: 200,
        output_tokens: 100,
        total_tokens: 310, // e.g. includes system tokens or cached prompt tokens
        token_counts_available: true,
      };

      const record = formatDbToRecord(rowWithReportedTotal);
      assert.equal(record.tokenUsage.totalTokens, 310, 'Provider-reported total must be preserved intact');
    });

    it('preserves null token counts when input or output is missing without fabricating 0', () => {
      const rowMissingTokens = {
        id: 'rec-missing-all',
        input_tokens: null,
        output_tokens: null,
        total_tokens: null,
        token_counts_available: false,
      };

      const record = formatDbToRecord(rowMissingTokens);
      assert.equal(record.tokenUsage.inputTokens, null);
      assert.equal(record.tokenUsage.outputTokens, null);
      assert.equal(record.tokenUsage.totalTokens, null);
      assert.equal(record.tokenUsage.tokenCountsAvailable, false);
      assert.equal(record.tokenUsage.tokenCountsComplete, false);
    });
  });

  describe('4. Historical Pricing Eligibility & Cost Recalculation', () => {
    it('calculates historical cost for gemini-3.5-flash-lite using verified official rates', () => {
      const costResult = calculateRequestCost('gemini-3.5-flash-lite', {
        inputTokens: 1000,
        outputTokens: 500,
        tokenCountsAvailable: true,
      });

      // 1000 / 1M * 0.075 = 0.000075
      // 500 / 1M * 0.30 = 0.000150
      // total = 0.000225 USD
      assert.equal(costResult.costStatus, 'calculated');
      assert.equal(costResult.estimatedCostUsd, 0.000225);
      assert.equal(costResult.currency, 'USD');
      assert.equal(costResult.pricingModel, 'gemini-3.5-flash-lite');
      assert.equal(costResult.effectiveDate, '2026-01-01');
    });

    it('keeps estimatedCost null and sets costStatus to missing_tokens when tokens are missing', () => {
      const costResult = calculateRequestCost('gemini-3.5-flash-lite', {
        inputTokens: null,
        outputTokens: null,
        tokenCountsAvailable: false,
      });

      assert.equal(costResult.estimatedCostUsd, null, 'Never fabricate a $0 cost for missing tokens');
      assert.equal(costResult.costStatus, 'missing_tokens');
    });

    it('keeps estimatedCost null and sets costStatus to unknown_pricing for unverified models', () => {
      const costResult = calculateRequestCost('unrecognized-legacy-model-v0', {
        inputTokens: 1000,
        outputTokens: 500,
        tokenCountsAvailable: true,
      });

      assert.equal(costResult.estimatedCostUsd, null, 'Never invent prices for unknown models');
      assert.equal(costResult.costStatus, 'unknown_pricing');
    });
  });

  describe('5. Cost Status Normalization in Database Mapping', () => {
    it('normalizes legacy "unknown" status to "missing_tokens" when token counts are absent', () => {
      const row = {
        id: 'rec-norm-1',
        estimated_cost: null,
        cost_status: 'unknown',
        input_tokens: null,
        output_tokens: null,
      };

      const record = formatDbToRecord(row);
      assert.equal(record.costStatus, 'missing_tokens');
      assert.equal(record.estimatedCost, null);
    });

    it('normalizes legacy "unknown" status to "calculated" when estimated_cost is present', () => {
      const row = {
        id: 'rec-norm-2',
        estimated_cost: 0.00015,
        cost_status: 'unknown',
        input_tokens: 500,
        output_tokens: 200,
      };

      const record = formatDbToRecord(row);
      assert.equal(record.costStatus, 'calculated');
      assert.equal(record.estimatedCost, 0.00015);
    });
  });

  describe('6. Overview Metrics & Average Cost / Request Calculations', () => {
    it('calculates average cost strictly using priced requests and reports coverage rate', () => {
      const records = [
        { outcome: 'success', durationMs: 100, estimatedCost: 0.0002, tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, tokenCountsAvailable: true } },
        { outcome: 'success', durationMs: 200, estimatedCost: 0.0004, tokenUsage: { inputTokens: 200, outputTokens: 100, totalTokens: 300, tokenCountsAvailable: true } },
        { outcome: 'failure', durationMs: 300, estimatedCost: null, costStatus: 'missing_tokens', tokenUsage: { tokenCountsAvailable: false } },
        { outcome: 'success', durationMs: 150, estimatedCost: null, costStatus: 'unknown_pricing', tokenUsage: { tokenCountsAvailable: true, totalTokens: 100 } },
      ];

      const metrics = calculateOverviewMetrics(records);

      assert.equal(metrics.totalRequests, 4);
      assert.equal(metrics.pricedRequestCount, 2);
      assert.equal(metrics.unpricedRequestCount, 2);
      assert.equal(metrics.totalCostUsd, 0.0006);
      // avg = 0.0006 / 2 = 0.0003
      assert.equal(metrics.avgCostPerRequestUsd, 0.0003);
      // coverage = 2 / 4 * 100 = 50.0%
      assert.equal(metrics.costCoverageRate, 50);
    });

    it('returns null average cost when no requests have calculated pricing', () => {
      const unpricedRecords = [
        { outcome: 'success', durationMs: 100, estimatedCost: null, costStatus: 'missing_tokens' },
        { outcome: 'failure', durationMs: 150, estimatedCost: null, costStatus: 'missing_tokens' },
      ];

      const metrics = calculateOverviewMetrics(unpricedRecords);

      assert.equal(metrics.totalRequests, 2);
      assert.equal(metrics.pricedRequestCount, 0);
      assert.equal(metrics.unpricedRequestCount, 2);
      assert.equal(metrics.totalCostUsd, 0);
      assert.equal(metrics.avgCostPerRequestUsd, null);
      assert.equal(metrics.costCoverageRate, 0);
    });
  });
});
