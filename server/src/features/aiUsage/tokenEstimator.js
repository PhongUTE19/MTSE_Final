import crypto from 'crypto';
import { MODEL_PRICING_REGISTRY, normalizeModelName } from './pricingConfig.js';

/**
 * Deterministic pseudo-random number generator in [0, 1) derived from a seed string.
 * Ensures identical inputs always yield identical random distributions.
 *
 * @param {string} seed
 * @param {number|string} [salt=0]
 * @returns {number} Float in range [0, 1)
 */
export function getDeterministicRandom(seed, salt = 0) {
  if (!seed || typeof seed !== 'string') {
    seed = 'default-seed';
  }
  const hash = crypto.createHash('sha256').update(`${seed}:${salt}`).digest('hex');
  const intVal = parseInt(hash.slice(0, 8), 16);
  return intVal / 0xffffffff;
}

/**
 * Deterministically generates an integer in range [min, max] inclusive using seed.
 *
 * @param {string} seed
 * @param {number} min
 * @param {number} max
 * @param {number|string} [salt=0]
 * @returns {number}
 */
export function deterministicIntInRange(seed, min, max, salt = 0) {
  if (min >= max) return min;
  const rand = getDeterministicRandom(seed, salt);
  return Math.round(min + rand * (max - min));
}

/**
 * Plausible token estimation ranges by task type, feature, and operation.
 * Calibrated against verified empirical usage in the SpendWise database.
 */
export const ESTIMATION_PROFILES = Object.freeze({
  RECEIPT_EXTRACTION: {
    inputMin: 1100,
    inputMax: 1300,
    outputMin: 140,
    outputMax: 280,
    failureOutputMin: 0,
    failureOutputMax: 10,
  },
  AGENT_TOOL_SELECTION: {
    inputMin: 750,
    inputMax: 950,
    outputMin: 20,
    outputMax: 80,
    failureOutputMin: 0,
    failureOutputMax: 10,
  },
  AGENT_SUMMARY: {
    inputMin: 450,
    inputMax: 900,
    outputMin: 30,
    outputMax: 150,
    failureOutputMin: 0,
    failureOutputMax: 10,
  },
  KNOWLEDGE_EMBEDDING: {
    inputMin: 120,
    inputMax: 320,
    outputMin: 0,
    outputMax: 0,
    failureOutputMin: 0,
    failureOutputMax: 0,
  },
  GENERAL_FALLBACK: {
    inputMin: 300,
    inputMax: 600,
    outputMin: 50,
    outputMax: 150,
    failureOutputMin: 0,
    failureOutputMax: 10,
  },
});

/**
 * Resolves the appropriate estimation profile for a given record.
 *
 * @param {object} record
 * @returns {object} Estimation profile
 */
export function resolveEstimationProfile(record = {}) {
  const feature = String(record.feature || '').toLowerCase();
  const operation = String(record.operation || '').toLowerCase();
  const model = normalizeModelName(record.model || '');

  if (feature === 'knowledge' || operation.includes('embed') || model.includes('embedding')) {
    return ESTIMATION_PROFILES.KNOWLEDGE_EMBEDDING;
  }

  if (feature === 'receipt_extraction' || operation.includes('receipt')) {
    return ESTIMATION_PROFILES.RECEIPT_EXTRACTION;
  }

  if (operation.includes('toolselection')) {
    return ESTIMATION_PROFILES.AGENT_TOOL_SELECTION;
  }

  if (operation.includes('summary')) {
    return ESTIMATION_PROFILES.AGENT_SUMMARY;
  }

  return ESTIMATION_PROFILES.GENERAL_FALLBACK;
}

/**
 * Estimates missing token usage for a request based on task context and request ID.
 * Preserves all existing actual token counts; estimates only missing dimensions.
 *
 * @param {object} record - Database row or usage record
 * @returns {{
 *   isEstimated: boolean,
 *   estimatedInputTokens: number | null,
 *   estimatedOutputTokens: number | null,
 *   estimatedTotalTokens: number | null,
 *   effectiveInputTokens: number,
 *   effectiveOutputTokens: number,
 *   effectiveTotalTokens: number,
 * }}
 */
export function estimateTokensForRequest(record = {}) {
  const seed = record.id || 'deterministic-seed';
  const hasActualInput = typeof (record.input_tokens ?? record.inputTokens ?? record.tokenUsage?.inputTokens) === 'number';
  const hasActualOutput = typeof (record.output_tokens ?? record.outputTokens ?? record.tokenUsage?.outputTokens) === 'number';
  const hasActualTotal = typeof (record.total_tokens ?? record.totalTokens ?? record.tokenUsage?.totalTokens) === 'number';

  const actualInput = hasActualInput ? (record.input_tokens ?? record.inputTokens ?? record.tokenUsage?.inputTokens) : null;
  const actualOutput = hasActualOutput ? (record.output_tokens ?? record.outputTokens ?? record.tokenUsage?.outputTokens) : null;
  const actualTotal = hasActualTotal ? (record.total_tokens ?? record.totalTokens ?? record.tokenUsage?.totalTokens) : null;

  // If all components are already provided by provider, no estimation is required
  if (hasActualInput && hasActualOutput && hasActualTotal) {
    return {
      isEstimated: false,
      estimatedInputTokens: null,
      estimatedOutputTokens: null,
      estimatedTotalTokens: null,
      effectiveInputTokens: actualInput,
      effectiveOutputTokens: actualOutput,
      effectiveTotalTokens: actualTotal,
    };
  }

  const profile = resolveEstimationProfile(record);
  const isFailure = record.outcome === 'failure';

  // Estimate missing input tokens if not recorded
  let estimatedInput = null;
  if (!hasActualInput) {
    estimatedInput = deterministicIntInRange(seed, profile.inputMin, profile.inputMax, 'input');
  }

  // Estimate missing output tokens if not recorded
  let estimatedOutput = null;
  if (!hasActualOutput) {
    const outMin = isFailure ? profile.failureOutputMin : profile.outputMin;
    const outMax = isFailure ? profile.failureOutputMax : profile.outputMax;
    estimatedOutput = deterministicIntInRange(seed, outMin, outMax, 'output');
  }

  const effectiveInput = hasActualInput ? actualInput : estimatedInput;
  const effectiveOutput = hasActualOutput ? actualOutput : estimatedOutput;

  // Total tokens: preserve provider total if valid, otherwise sum effective input + output
  let estimatedTotal = null;
  if (!hasActualTotal) {
    estimatedTotal = effectiveInput + effectiveOutput;
  }
  const effectiveTotal = hasActualTotal ? actualTotal : estimatedTotal;

  return {
    isEstimated: true,
    estimatedInputTokens: hasActualInput ? null : estimatedInput,
    estimatedOutputTokens: hasActualOutput ? null : estimatedOutput,
    estimatedTotalTokens: hasActualTotal ? null : estimatedTotal,
    effectiveInputTokens: effectiveInput,
    effectiveOutputTokens: effectiveOutput,
    effectiveTotalTokens: effectiveTotal,
  };
}

/**
 * Calculates estimated cost from estimated or effective token usage.
 *
 * @param {string} rawModel
 * @param {{ effectiveInputTokens: number, effectiveOutputTokens: number }} tokens
 * @param {string|Date} [timestamp]
 * @returns {{
 *   estimatedCostUsd: number | null,
 *   costStatus: 'estimated_backfill' | 'unknown_pricing',
 *   pricingModel: string | null,
 * }}
 */
export function calculateEstimatedBackfillCost(rawModel, tokens, timestamp) {
  const normalizedModel = normalizeModelName(rawModel);
  const pricing = MODEL_PRICING_REGISTRY[normalizedModel];

  if (!pricing) {
    return {
      estimatedCostUsd: null,
      costStatus: 'unknown_pricing',
      pricingModel: null,
    };
  }

  // Verify historical effective date if timestamp is available
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
    costStatus: 'estimated_backfill',
    pricingModel: normalizedModel,
  };
}
