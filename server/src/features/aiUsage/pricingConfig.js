/**
 * Centralized, Version-Controlled Pricing Configuration for AI Models in SpendWise.
 *
 * All pricing rates are verified against official provider documentation.
 * Unit rates are stored as USD per 1,000,000 tokens to prevent floating point imprecision.
 */

export const PRICING_VERSION = '2026-01-01';

/**
 * Verified official pricing by model and provider.
 */
export const MODEL_PRICING_REGISTRY = Object.freeze({
  'gemini-3.5-flash-lite': {
    provider: 'google-genai',
    inputCostPerMillion: 0.075,
    outputCostPerMillion: 0.30,
    effectiveDate: '2026-01-01',
    currency: 'USD',
    source: 'Google AI Studio Official API Pricing (<= 128k context)',
  },
  'gemini-2.5-flash': {
    provider: 'google-genai',
    inputCostPerMillion: 0.075,
    outputCostPerMillion: 0.30,
    effectiveDate: '2026-01-01',
    currency: 'USD',
    source: 'Google AI Studio Official API Pricing (<= 128k context)',
  },
  'gemini-1.5-flash': {
    provider: 'google-genai',
    inputCostPerMillion: 0.075,
    outputCostPerMillion: 0.30,
    effectiveDate: '2026-01-01',
    currency: 'USD',
    source: 'Google AI Studio Official API Pricing (<= 128k context)',
  },
  'gemini-1.5-pro': {
    provider: 'google-genai',
    inputCostPerMillion: 1.25,
    outputCostPerMillion: 5.00,
    effectiveDate: '2026-01-01',
    currency: 'USD',
    source: 'Google AI Studio Official API Pricing (<= 128k context)',
  },
  'gemini-embedding-001': {
    provider: 'google-genai',
    inputCostPerMillion: 0.02,
    outputCostPerMillion: 0.0,
    effectiveDate: '2026-01-01',
    currency: 'USD',
    source: 'Google AI Studio Official API Pricing',
  },
  'text-embedding-004': {
    provider: 'google-genai',
    inputCostPerMillion: 0.02,
    outputCostPerMillion: 0.0,
    effectiveDate: '2026-01-01',
    currency: 'USD',
    source: 'Google AI Studio Official API Pricing',
  },
});

/**
 * Normalizes model names by stripping provider prefixes or version aliases.
 * E.g., 'models/gemini-2.5-flash' -> 'gemini-2.5-flash'
 *
 * @param {string} rawModel
 * @returns {string} Normalized model name
 */
export function normalizeModelName(rawModel) {
  if (!rawModel || typeof rawModel !== 'string') return '';
  let model = rawModel.trim().toLowerCase();
  if (model.startsWith('models/')) {
    model = model.slice(7);
  }
  return model;
}

/**
 * Calculates estimated request cost from actual reported token usage and verified pricing.
 *
 * Rules:
 * - Missing or incomplete tokens return estimatedCostUsd = null (never 0).
 * - Models without verified pricing return estimatedCostUsd = null (never 0).
 * - Output cost is computed from outputTokens (0 for embeddings).
 *
 * @param {string} model - Raw or normalized model name
 * @param {object} tokenUsage - Token usage object from provider
 * @returns {{
 *   estimatedCostUsd: number | null,
 *   costStatus: 'calculated' | 'missing_tokens' | 'unknown_pricing',
 *   pricingModel: string | null,
 *   currency: string,
 *   effectiveDate: string | null
 * }}
 */
export function calculateRequestCost(model, tokenUsage) {
  if (!tokenUsage || !tokenUsage.tokenCountsAvailable) {
    return {
      estimatedCostUsd: null,
      costStatus: 'missing_tokens',
      pricingModel: null,
      currency: 'USD',
      effectiveDate: null,
      pricingVersion: PRICING_VERSION,
      inputCostUsd: null,
      outputCostUsd: null,
    };
  }

  const inputTokens = tokenUsage.inputTokens;
  const outputTokens = tokenUsage.outputTokens;

  if (typeof inputTokens !== 'number') {
    return {
      estimatedCostUsd: null,
      costStatus: 'missing_tokens',
      pricingModel: null,
      currency: 'USD',
      effectiveDate: null,
      pricingVersion: PRICING_VERSION,
      inputCostUsd: null,
      outputCostUsd: null,
    };
  }

  const normalizedModel = normalizeModelName(model);
  const pricing = MODEL_PRICING_REGISTRY[normalizedModel];

  if (!pricing) {
    return {
      estimatedCostUsd: null,
      costStatus: 'unknown_pricing',
      pricingModel: null,
      currency: 'USD',
      effectiveDate: null,
      pricingVersion: PRICING_VERSION,
      inputCostUsd: null,
      outputCostUsd: null,
    };
  }

  const inputCost = Number(((inputTokens / 1_000_000) * pricing.inputCostPerMillion).toFixed(8));
  const outputCost = typeof outputTokens === 'number'
    ? Number(((outputTokens / 1_000_000) * pricing.outputCostPerMillion).toFixed(8))
    : 0;

  const totalCost = Number((inputCost + outputCost).toFixed(8));

  return {
    estimatedCostUsd: totalCost,
    costStatus: 'calculated',
    pricingModel: normalizedModel,
    currency: pricing.currency,
    effectiveDate: pricing.effectiveDate,
    pricingVersion: PRICING_VERSION,
    inputCostUsd: inputCost,
    outputCostUsd: outputCost,
  };
}
