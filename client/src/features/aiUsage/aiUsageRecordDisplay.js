export const MISSING_VALUE = '—';
const SHA256_HEX = /^[a-f0-9]{64}$/i;

/**
 * Returns the prompt version only when it is a human-assigned label.
 * Legacy records stored the prompt hash in the version field, which is not a version.
 */
export function getExplicitPromptVersion(record) {
  const version = record.promptVersion;
  return version && !SHA256_HEX.test(version.trim()) ? version : null;
}

/**
 * Resolves the token counts to display for a request history record.
 * Provider-reported counts win; deterministic estimates are the fallback.
 *
 * @returns {{ source: 'actual'|'estimated'|'unavailable', input?: *, output?: *, total?: * }}
 */
export function resolveTokenCounts(record) {
  const usage = record.tokenUsage;
  if (usage?.tokenCountsAvailable && usage.inputTokens != null) {
    return {
      source: 'actual',
      input: usage.inputTokens,
      output: usage.outputTokens ?? MISSING_VALUE,
      total: usage.totalTokens ?? MISSING_VALUE,
    };
  }

  if (record.estimatedTokens || record.estimatedTotalTokens != null) {
    const estimate = record.estimatedTokens;
    return {
      source: 'estimated',
      input: estimate?.effectiveInputTokens ?? record.estimatedInputTokens ?? MISSING_VALUE,
      output: estimate?.effectiveOutputTokens ?? record.estimatedOutputTokens ?? MISSING_VALUE,
      total: estimate?.effectiveTotalTokens ?? record.estimatedTotalTokens ?? MISSING_VALUE,
    };
  }

  return { source: 'unavailable' };
}

export function formatUsd(amount, fractionDigits) {
  return `$${amount.toFixed(fractionDigits)}`;
}

/**
 * Explains why a record has no cost: `tooltip` for the table cell, `detail` for the inspector.
 */
export function describeUnavailablePricing({ costStatus, model }) {
  switch (costStatus) {
    case 'missing_tokens':
      return { tooltip: 'token counts missing', detail: 'missing token counts' };
    case 'unknown_pricing':
      return {
        tooltip: 'unverified model pricing',
        detail: `unverified model pricing for ${model || 'unknown'}`,
      };
    default:
      return { tooltip: 'legacy unpriced request', detail: 'legacy unpriced request' };
  }
}
