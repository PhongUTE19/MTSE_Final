import { MODEL_PRICING_REGISTRY, normalizeModelName } from './pricingConfig.js';

/**
 * Normalizes provider-reported token usage without fabricating or pseudo-randomizing
 * missing token counts.
 *
 * - Returns `usageSource: 'provider_reported'` when input, output, and total are reported.
 * - Returns `usageSource: 'derived'` when input and output are reported and total is derived.
 * - Returns `usageSource: 'unavailable'` with `null` counts when provider usage is absent.
 *
 * @param {object} record - Database row or usage record
 */
export function estimateTokensForRequest(record = {}) {
  const rawInput = record.input_tokens ?? record.inputTokens ?? record.tokenUsage?.inputTokens;
  const rawOutput = record.output_tokens ?? record.outputTokens ?? record.tokenUsage?.outputTokens;
  const rawTotal = record.total_tokens ?? record.totalTokens ?? record.tokenUsage?.totalTokens;
  const rawCached = record.cached_tokens ?? record.cachedTokens ?? record.tokenUsage?.cachedTokens;

  const hasActualInput = typeof rawInput === 'number' && Number.isFinite(rawInput);
  const hasActualOutput = typeof rawOutput === 'number' && Number.isFinite(rawOutput);
  const hasActualTotal = typeof rawTotal === 'number' && Number.isFinite(rawTotal);
  const hasActualCached = typeof rawCached === 'number' && Number.isFinite(rawCached);

  const actualInput = hasActualInput ? rawInput : null;
  const actualOutput = hasActualOutput ? rawOutput : null;
  const cachedTokens = hasActualCached ? rawCached : null;

  let actualTotal = hasActualTotal ? rawTotal : null;
  const explicitSource = record.usage_source ?? record.usageSource ?? record.tokenUsage?.usageSource;
  let usageSource = typeof explicitSource === 'string' ? explicitSource : 'unavailable';

  if (typeof explicitSource !== 'string') {
    if (hasActualInput && hasActualOutput && hasActualTotal) {
      usageSource = 'provider_reported';
    } else if (hasActualInput && hasActualOutput) {
      actualTotal = actualInput + actualOutput;
      usageSource = 'derived';
    } else if (hasActualTotal) {
      usageSource = 'provider_reported';
    }
  } else if (hasActualInput && hasActualOutput && !hasActualTotal) {
    actualTotal = actualInput + actualOutput;
  }

  return {
    isEstimated: false,
    usageSource,
    estimatedInputTokens: null,
    estimatedOutputTokens: null,
    estimatedTotalTokens: null,
    effectiveInputTokens: actualInput,
    effectiveOutputTokens: actualOutput,
    effectiveTotalTokens: actualTotal,
    cachedTokens,
  };
}

/**
 * Calculates cost only when verified token counts and model pricing are both available.
 * Never fabricates cost from missing or pseudo-random token estimates.
 */
export function calculateEstimatedBackfillCost(rawModel, tokens, timestamp) {
  if (
    !tokens ||
    typeof tokens.effectiveInputTokens !== 'number' ||
    typeof tokens.effectiveOutputTokens !== 'number'
  ) {
    return {
      estimatedCostUsd: null,
      costStatus: 'missing_tokens',
      pricingModel: null,
    };
  }

  const normalizedModel = normalizeModelName(rawModel);
  const pricing = MODEL_PRICING_REGISTRY[normalizedModel];

  if (!pricing) {
    return {
      estimatedCostUsd: null,
      costStatus: 'unknown_pricing',
      pricingModel: null,
    };
  }

  if (timestamp && pricing.effectiveDate) {
    const rowDate = new Date(timestamp);
    const effectiveDate = new Date(pricing.effectiveDate);
    if (rowDate < effectiveDate) {
      return {
        estimatedCostUsd: null,
        costStatus: 'unknown_pricing',
        pricingModel: null,
      };
    }
  }

  const inputCost = (tokens.effectiveInputTokens / 1_000_000) * pricing.inputCostPerMillion;
  const outputCost = (tokens.effectiveOutputTokens / 1_000_000) * pricing.outputCostPerMillion;
  const totalCost = Number((inputCost + outputCost).toFixed(8));

  return {
    estimatedCostUsd: totalCost,
    costStatus: 'calculated',
    pricingModel: normalizedModel,
  };
}
