import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateTokensForRequest,
  calculateEstimatedBackfillCost,
} from '../../server/src/features/aiUsage/tokenEstimator.js';
import {
  formatDbToRecord,
  formatRecordForDb,
} from '../../server/src/features/aiUsage/aiUsage.repository.js';
import { createUsageTracker } from '../../server/src/features/aiUsage/usageTracker.js';

describe('Honest Token & Usage Provenance Suite (P2-T14)', () => {
  it('returns null and usageSource="unavailable" when provider usage metadata is missing (never fabricates PRNG tokens)', () => {
    const req = {
      id: 'rec-missing-1',
      feature: 'receipt_extraction',
      operation: 'extractReceiptImage',
      model: 'gemini-2.5-flash',
      outcome: 'success',
    };

    const result = estimateTokensForRequest(req);
    assert.equal(result.isEstimated, false);
    assert.equal(result.usageSource, 'unavailable');
    assert.equal(result.estimatedInputTokens, null);
    assert.equal(result.estimatedOutputTokens, null);
    assert.equal(result.estimatedTotalTokens, null);
    assert.equal(result.effectiveInputTokens, null);
    assert.equal(result.effectiveOutputTokens, null);
    assert.equal(result.effectiveTotalTokens, null);
  });

  it('preserves explicit zero token counts as 0 rather than missing', () => {
    const result = estimateTokensForRequest({
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      cached_tokens: 0,
    });

    assert.equal(result.usageSource, 'provider_reported');
    assert.equal(result.effectiveInputTokens, 0);
    assert.equal(result.effectiveOutputTokens, 0);
    assert.equal(result.effectiveTotalTokens, 0);
    assert.equal(result.cachedTokens, 0);
  });

  it('derives total tokens only when both input and output tokens are present', () => {
    const derived = estimateTokensForRequest({
      input_tokens: 120,
      output_tokens: 30,
    });
    assert.equal(derived.usageSource, 'derived');
    assert.equal(derived.effectiveTotalTokens, 150);

    const partial = estimateTokensForRequest({
      input_tokens: 120,
    });
    assert.equal(partial.usageSource, 'unavailable');
    assert.equal(partial.effectiveTotalTokens, null);
  });

  it('returns costStatus="missing_tokens" instead of fabricating cost when tokens are unavailable', () => {
    const cost = calculateEstimatedBackfillCost('gemini-2.5-flash', {
      effectiveInputTokens: null,
      effectiveOutputTokens: null,
    });
    assert.equal(cost.estimatedCostUsd, null);
    assert.equal(cost.costStatus, 'missing_tokens');

    const dbRecord = formatDbToRecord({
      id: 'row-1',
      timestamp: '2026-11-17T00:00:00.000Z',
      feature: 'chat',
      operation: 'generateAnswer',
      model: 'gemini-2.5-flash',
      outcome: 'success',
      token_counts_available: false,
    });
    assert.equal(dbRecord.estimatedTokens.isEstimated, false);
    assert.equal(dbRecord.estimatedTokens.usageSource, 'unavailable');
    assert.equal(dbRecord.estimatedTokens.effectiveInputTokens, null);
    assert.equal(dbRecord.tokenUsage.usageSource, 'unavailable');
  });

  it('persists and reconstructs provider_reported, derived, unavailable, explicit zero, and legacy unknown provenance accurately', () => {
    const tracker = createUsageTracker();

    // 1. Provider-reported round-trip
    const reported = tracker.trackUsage({
      feature: 'chat',
      operation: 'generateAnswer',
      model: 'gemini-2.5-flash',
      tokenUsage: { inputTokens: 100, outputTokens: 25, totalTokens: 125, usageSource: 'provider_reported', tokenCountsAvailable: true },
    });
    const reportedRow = formatRecordForDb(reported);
    assert.equal(reportedRow.usage_source, 'provider_reported');
    const reportedBack = formatDbToRecord(reportedRow);
    assert.equal(reportedBack.tokenUsage.usageSource, 'provider_reported');
    assert.equal(reportedBack.costStatus, 'calculated');

    // 2. Derived total round-trip (totalTokens omitted, derived pre-insert)
    const derived = tracker.trackUsage({
      feature: 'chat',
      operation: 'generateAnswer',
      model: 'gemini-2.5-flash',
      tokenUsage: { inputTokens: 100, outputTokens: 25, tokenCountsAvailable: true },
    });
    assert.equal(derived.tokenUsage.totalTokens, 125);
    assert.equal(derived.tokenUsage.usageSource, 'derived');
    const derivedRow = formatRecordForDb(derived);
    assert.equal(derivedRow.usage_source, 'derived');
    assert.equal(derivedRow.total_tokens, 125);
    const derivedBack = formatDbToRecord(derivedRow);
    assert.equal(derivedBack.tokenUsage.usageSource, 'derived');
    assert.equal(derivedBack.costStatus, 'calculated');

    // 3. Explicit zero round-trip
    const zeroRec = tracker.trackUsage({
      feature: 'chat',
      operation: 'generateAnswer',
      model: 'gemini-2.5-flash',
      tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, usageSource: 'provider_reported', tokenCountsAvailable: true },
    });
    const zeroBack = formatDbToRecord(formatRecordForDb(zeroRec));
    assert.equal(zeroBack.tokenUsage.inputTokens, 0);
    assert.equal(zeroBack.tokenUsage.outputTokens, 0);
    assert.equal(zeroBack.tokenUsage.totalTokens, 0);
    assert.equal(zeroBack.tokenUsage.usageSource, 'provider_reported');

    // 4. Legacy record with populated total_tokens but NULL usage_source must classify as 'unknown' (not 'provider_reported')
    const legacyRow = {
      id: 'legacy-1',
      timestamp: '2026-10-25T00:00:00.000Z',
      feature: 'chat',
      operation: 'generateAnswer',
      model: 'gemini-2.5-flash',
      outcome: 'success',
      input_tokens: 80,
      output_tokens: 20,
      total_tokens: 100,
      token_counts_available: true,
      usage_source: null,
      estimated_cost: 0.00001,
      cost_status: 'calculated',
    };
    const legacyBack = formatDbToRecord(legacyRow);
    assert.equal(legacyBack.tokenUsage.usageSource, 'unknown');
    assert.equal(legacyBack.costStatus, 'calculated');

    // 5. Consistency between tokenUsage.usageSource and estimatedTokens.usageSource on partial/missing rows
    const partialRow = {
      id: 'partial-1',
      timestamp: '2026-11-17T00:00:00.000Z',
      feature: 'chat',
      operation: 'generateAnswer',
      model: 'gemini-2.5-flash',
      outcome: 'success',
      input_tokens: 80,
      output_tokens: null,
      total_tokens: null,
      token_counts_available: false,
      usage_source: 'unavailable',
    };
    const partialBack = formatDbToRecord(partialRow);
    assert.equal(partialBack.tokenUsage.usageSource, 'unavailable');
    assert.equal(partialBack.estimatedTokens.usageSource, 'unavailable');
  });
});
