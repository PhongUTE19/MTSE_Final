import React from 'react';
import { UI_LABELS } from '../../shared/constants/index.js';
import { formatNumber } from '../../shared/utils/formatters.js';
import Badge from '../../primitives/labels/Badge.jsx';
import { Grid } from '../../primitives/layout/index.js';
import StatCard from '../../composites/dataDisplay/StatCard.jsx';

function resolveFailureColor(isUnavailable, failureRate) {
  if (isUnavailable) return 'secondary';
  return failureRate > 0 ? 'error' : 'primary';
}

function resolveAvgCostValue(isUnavailable, avgCostPerRequestUsd) {
  if (isUnavailable || avgCostPerRequestUsd == null) return '—';
  return `$${avgCostPerRequestUsd.toFixed(6)}`;
}

function resolveCostSubLabel({
  isUnavailable,
  estimatedPricedCount,
  totalCostUsd,
  pricedRequestCount,
  estimatedCostUsd,
  totalRequests,
  costCoverageRate,
}) {
  if (isUnavailable) return 'Unavailable';
  if (estimatedPricedCount > 0) {
    return `Verified: $${totalCostUsd.toFixed(4)} (${pricedRequestCount} reqs) · Est: ~$${estimatedCostUsd.toFixed(4)} (${estimatedPricedCount} reqs)`;
  }
  return `Total: $${totalCostUsd.toFixed(4)} · ${pricedRequestCount} of ${totalRequests} priced (${costCoverageRate}%)`;
}

export default function AIUsageSummary({ overview, loading = false, error = null }) {
  const isLoading = Boolean(loading);
  const isUnavailable = !isLoading && (Boolean(error) || !overview);

  const {
    totalRequests = 0,
    successCount = 0,
    failureCount = 0,
    refusalCount = 0,
    successRate = 0,
    failureRate = 0,
    refusalRate = 0,
    inputTokens = 0,
    outputTokens = 0,
    totalTokens = 0,
    recordsWithMissingTokens = 0,
    avgLatencyMs = 0,
    p95LatencyMs = 0,
    latencySampleCount = 0,
    totalCostUsd = 0,
    avgCostPerRequestUsd = null,
    pricedRequestCount = 0,
    unpricedRequestCount = 0,
    costCoverageRate = 0,
    estimatedPricedCount = 0,
    estimatedCostUsd = 0,
    combinedAvgCostPerRequestUsd = null,
    totalPricedCount = 0,
  } = overview || {};

  const showDetails = !isLoading && !isUnavailable;

  return (
    <Grid as="section" columns={3} gap="md" role="region" aria-label="AI usage summary">
      <StatCard
        label={UI_LABELS.ANALYTICS.KPIS.TOTAL_REQUESTS}
        value={isUnavailable ? '—' : formatNumber(totalRequests)}
        valueColor={isUnavailable ? 'secondary' : 'primary'}
        loading={isLoading}
        sub="Across selected time window"
      />

      <StatCard
        label={UI_LABELS.ANALYTICS.KPIS.SUCCESS_RATE}
        value={isUnavailable ? '—' : `${successRate}%`}
        valueColor={isUnavailable ? 'secondary' : 'success'}
        loading={isLoading}
        sub={isUnavailable ? 'Unavailable' : `${formatNumber(successCount)} successful calls`}
      />

      <StatCard
        label={UI_LABELS.ANALYTICS.KPIS.FAILURE_RATE}
        value={isUnavailable ? '—' : `${failureRate}%`}
        valueColor={resolveFailureColor(isUnavailable, failureRate)}
        loading={isLoading}
        sub={
          isUnavailable
            ? 'Unavailable'
            : `${formatNumber(failureCount)} errors · ${formatNumber(refusalCount)} refusals (${refusalRate}%)`
        }
      />

      <StatCard
        label={UI_LABELS.ANALYTICS.KPIS.TOTAL_TOKENS}
        value={isUnavailable ? '—' : formatNumber(totalTokens)}
        valueColor={isUnavailable ? 'secondary' : 'primary'}
        loading={isLoading}
        sub={
          isUnavailable
            ? 'Unavailable'
            : `In: ${formatNumber(inputTokens)} · Out: ${formatNumber(outputTokens)}`
        }
      >
        {showDetails && recordsWithMissingTokens > 0 && (
          <Badge as="div" variant="warning" title="Provider response did not include complete token metadata">
            {UI_LABELS.ANALYTICS.KPIS.INCOMPLETE_TOKENS_WARNING(recordsWithMissingTokens)}
          </Badge>
        )}
      </StatCard>

      <StatCard
        label={UI_LABELS.ANALYTICS.KPIS.LATENCY_TITLE}
        value={isUnavailable ? '—' : avgLatencyMs}
        valueColor={isUnavailable ? 'secondary' : 'primary'}
        unit={isUnavailable ? undefined : 'ms'}
        loading={isLoading}
        sub={
          isUnavailable
            ? 'Unavailable'
            : `p95: ${p95LatencyMs} ms · Sample: ${latencySampleCount || totalRequests} calls`
        }
      />

      <StatCard
        label={UI_LABELS.ANALYTICS.KPIS.AVG_COST}
        value={resolveAvgCostValue(isUnavailable, avgCostPerRequestUsd)}
        valueColor={isUnavailable ? 'secondary' : 'primary'}
        loading={isLoading}
        sub={resolveCostSubLabel({
          isUnavailable,
          estimatedPricedCount,
          totalCostUsd,
          pricedRequestCount,
          estimatedCostUsd,
          totalRequests,
          costCoverageRate,
        })}
      >
        {showDetails && estimatedPricedCount > 0 && combinedAvgCostPerRequestUsd != null && (
          <Badge
            as="div"
            variant="subtle"
            title="Combined average including deterministic estimates for requests with missing provider tokens"
          >
            Combined avg: ~${combinedAvgCostPerRequestUsd.toFixed(6)} ({totalPricedCount || (pricedRequestCount + estimatedPricedCount)} of {totalRequests} priced)
          </Badge>
        )}
        {showDetails && unpricedRequestCount > 0 && (
          <Badge as="div" variant="warning" title="Requests with unpriced models or missing token counts">
            {unpricedRequestCount} unpriced request{unpricedRequestCount > 1 ? 's' : ''}
          </Badge>
        )}
      </StatCard>
    </Grid>
  );
}
