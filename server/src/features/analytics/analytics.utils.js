import {
  OUTCOMES,
  PERCENTILES,
  TIME_WINDOW_MS,
  DEFAULT_TIME_RANGE,
} from './analytics.constants.js';

/**
 * Resolves starting and ending ISO timestamps based on timeRange or explicit date bounds.
 *
 * @param {object} [filters={}]
 * @returns {{ start: string | null, end: string | null }}
 */
export function resolveTimeBounds(filters = {}) {
  let start = null;
  const end = filters.endDate ? new Date(filters.endDate).toISOString() : new Date().toISOString();

  if (filters.startDate) {
    start = new Date(filters.startDate).toISOString();
  } else if (filters.timeRange && filters.timeRange !== 'all') {
    const windowMs = TIME_WINDOW_MS[filters.timeRange] || TIME_WINDOW_MS[DEFAULT_TIME_RANGE];
    start = new Date(Date.now() - windowMs).toISOString();
  }

  return { start, end };
}

/**
 * Calculates a specific percentile from an already sorted array of numeric values.
 *
 * @param {number[]} sortedValues - Array of sorted numbers (ascending)
 * @param {number} quantile - Number between 0 and 1 (e.g. 0.5, 0.95)
 * @returns {number}
 */
export function calculatePercentile(sortedValues, quantile) {
  if (!Array.isArray(sortedValues) || sortedValues.length === 0) {
    return 0;
  }
  const index = Math.floor(sortedValues.length * quantile);
  const clampedIndex = Math.min(Math.max(0, index), sortedValues.length - 1);
  return sortedValues[clampedIndex] ?? 0;
}

/**
 * Calculates summary metrics, token totals, and latency percentiles from records.
 *
 * @param {Array<object>} records
 * @returns {object}
 */
export function calculateOverviewMetrics(records = []) {
  const totalRequests = records.length;
  let successCount = 0;
  let failureCount = 0;
  let refusalCount = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let recordsWithMissingTokens = 0;

  let verifiedCostUsd = 0;
  let verifiedPricedCount = 0;
  let estimatedCostUsd = 0;
  let estimatedPricedCount = 0;
  let unpricedRequestCount = 0;

  const latencies = [];

  for (const rec of records) {
    if (rec.outcome === OUTCOMES.SUCCESS) successCount++;
    else if (rec.outcome === OUTCOMES.FAILURE) failureCount++;
    else if (rec.outcome === OUTCOMES.REFUSAL) refusalCount++;

    if (rec.tokenUsage?.tokenCountsAvailable && typeof rec.tokenUsage.totalTokens === 'number') {
      inputTokens += rec.tokenUsage.inputTokens || 0;
      outputTokens += rec.tokenUsage.outputTokens || 0;
      totalTokens += rec.tokenUsage.totalTokens || 0;
    } else {
      recordsWithMissingTokens++;
    }

    if (typeof rec.durationMs === 'number' && !isNaN(rec.durationMs)) {
      latencies.push(rec.durationMs);
    }

    const costVal = rec.estimatedCost ?? rec.cost?.estimatedCostUsd;
    const costStatus = rec.costStatus || rec.cost?.costStatus;

    if (typeof costVal === 'number' && !isNaN(costVal)) {
      if (costStatus === 'estimated_backfill') {
        estimatedCostUsd += costVal;
        estimatedPricedCount++;
      } else {
        verifiedCostUsd += costVal;
        verifiedPricedCount++;
      }
    } else {
      unpricedRequestCount++;
    }
  }

  latencies.sort((a, b) => a - b);
  const sumLatency = latencies.reduce((acc, v) => acc + v, 0);
  const latencySampleCount = latencies.length;
  const avgLatencyMs = latencySampleCount > 0 ? Math.round(sumLatency / latencySampleCount) : 0;

  const p50LatencyMs = calculatePercentile(latencies, PERCENTILES.P50);
  const p95LatencyMs = calculatePercentile(latencies, PERCENTILES.P95);

  const successRate = totalRequests > 0 ? Number(((successCount / totalRequests) * 100).toFixed(1)) : 0;
  const failureRate = totalRequests > 0 ? Number(((failureCount / totalRequests) * 100).toFixed(1)) : 0;
  const refusalRate = totalRequests > 0 ? Number(((refusalCount / totalRequests) * 100).toFixed(1)) : 0;

  // Verified actual costs (strictly actual usage)
  const verifiedAvgCostPerRequestUsd = verifiedPricedCount > 0
    ? Number((verifiedCostUsd / verifiedPricedCount).toFixed(6))
    : null;
  const roundedVerifiedCostUsd = Number(verifiedCostUsd.toFixed(6));

  // Combined metrics (transparently including deterministic backfill estimates)
  const totalPricedCount = verifiedPricedCount + estimatedPricedCount;
  const combinedTotalCostUsd = Number((verifiedCostUsd + estimatedCostUsd).toFixed(6));
  const combinedAvgCostPerRequestUsd = totalPricedCount > 0
    ? Number((combinedTotalCostUsd / totalPricedCount).toFixed(6))
    : null;

  const costCoverageRate = totalRequests > 0
    ? Number(((totalPricedCount / totalRequests) * 100).toFixed(1))
    : 0;
  const verifiedCoverageRate = totalRequests > 0
    ? Number(((verifiedPricedCount / totalRequests) * 100).toFixed(1))
    : 0;

  return {
    totalRequests,
    successCount,
    failureCount,
    refusalCount,
    successRate,
    failureRate,
    refusalRate,
    inputTokens,
    outputTokens,
    totalTokens,
    recordsWithMissingTokens,
    avgLatencyMs,
    p50LatencyMs,
    p95LatencyMs,
    latencySampleCount,
    // Verified actual metrics
    totalCostUsd: roundedVerifiedCostUsd,
    avgCostPerRequestUsd: verifiedAvgCostPerRequestUsd,
    pricedRequestCount: verifiedPricedCount,
    verifiedCostUsd: roundedVerifiedCostUsd,
    verifiedAvgCostPerRequestUsd,
    verifiedPricedCount,
    verifiedCoverageRate,
    // Explicitly labeled estimated metrics
    estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)),
    estimatedPricedCount,
    estimatedAvgCostPerRequestUsd: estimatedPricedCount > 0 ? Number((estimatedCostUsd / estimatedPricedCount).toFixed(6)) : null,
    // Combined totals
    combinedTotalCostUsd,
    combinedAvgCostPerRequestUsd,
    totalPricedCount,
    unpricedRequestCount,
    costCoverageRate,
  };
}

/**
 * Groups timestamped records into chronological hourly or daily buckets.
 *
 * @param {Array<object>} records
 * @param {boolean} isHourly
 * @returns {Array<object>}
 */
export function groupRecordsIntoTimeBuckets(records = [], isHourly = false) {
  const buckets = new Map();

  for (const rec of records) {
    const d = new Date(rec.timestamp);
    const key = isHourly
      ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:00`
      : `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

    if (!buckets.has(key)) {
      buckets.set(key, {
        timestamp: key,
        dateLabel: key,
        totalRequests: 0,
        successCount: 0,
        failureCount: 0,
        refusalCount: 0,
        totalTokens: 0,
        totalCostUsd: 0,
        pricedRequests: 0,
        durationSum: 0,
        avgLatencyMs: 0,
      });
    }

    const b = buckets.get(key);
    b.totalRequests++;
    if (rec.outcome === OUTCOMES.SUCCESS) b.successCount++;
    else if (rec.outcome === OUTCOMES.FAILURE) b.failureCount++;
    else if (rec.outcome === OUTCOMES.REFUSAL) b.refusalCount++;

    if (rec.tokenUsage?.totalTokens) {
      b.totalTokens += rec.tokenUsage.totalTokens;
    }
    const costVal = rec.estimatedCost ?? rec.cost?.estimatedCostUsd;
    if (typeof costVal === 'number' && !isNaN(costVal)) {
      b.totalCostUsd = Number((b.totalCostUsd + costVal).toFixed(6));
      b.pricedRequests++;
    }
    if (rec.durationMs) {
      b.durationSum += rec.durationMs;
    }
    b.avgLatencyMs = Math.round(b.durationSum / b.totalRequests);
    b.avgCostUsd = b.pricedRequests > 0 ? Number((b.totalCostUsd / b.pricedRequests).toFixed(6)) : null;
  }

  return Array.from(buckets.values());
}

/**
 * Calculates frequency distributions for features, models, operations, and outcomes.
 *
 * @param {Array<object>} records
 * @returns {object}
 */
export function calculateDistributions(records = []) {
  const featureMap = new Map();
  const modelMap = new Map();
  const operationMap = new Map();
  const outcomeMap = new Map();
  const total = records.length;

  for (const rec of records) {
    const f = rec.feature || 'unknown';
    const m = rec.model || 'unknown';
    const op = rec.operation || 'unknown';
    const out = rec.outcome || 'unknown';

    featureMap.set(f, (featureMap.get(f) || 0) + 1);
    modelMap.set(m, (modelMap.get(m) || 0) + 1);
    operationMap.set(op, (operationMap.get(op) || 0) + 1);
    outcomeMap.set(out, (outcomeMap.get(out) || 0) + 1);
  }

  const formatDist = (map) =>
    Array.from(map.entries()).map(([name, count]) => ({
      name,
      count,
      percentage: total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0,
    }));

  return {
    byFeature: formatDist(featureMap),
    byModel: formatDist(modelMap),
    byOperation: formatDist(operationMap),
    byOutcome: formatDist(outcomeMap),
    total,
  };
}

/**
 * Filters in-memory records based on time bounds, feature, model, outcome, and search term.
 *
 * @param {Array<object>} records
 * @param {object} [filters={}]
 * @returns {Array<object>}
 */
export function filterInMemoryRecords(records = [], filters = {}) {
  const { start, end } = resolveTimeBounds(filters);
  const rawSearch = (filters.search || filters.q || '').trim().toLowerCase();

  return records.filter((rec) => {
    if (start && rec.timestamp < start) return false;
    if (end && rec.timestamp > end) return false;
    if (filters.feature && filters.feature !== 'all' && rec.feature !== filters.feature) return false;
    if (filters.model && filters.model !== 'all' && rec.model !== filters.model) return false;
    if (filters.outcome && filters.outcome !== 'all' && rec.outcome !== filters.outcome) return false;

    if (rawSearch) {
      const matches = Boolean(
        (rec.id && String(rec.id).toLowerCase().includes(rawSearch)) ||
        (rec.feature && String(rec.feature).toLowerCase().includes(rawSearch)) ||
        (rec.operation && String(rec.operation).toLowerCase().includes(rawSearch)) ||
        (rec.model && String(rec.model).toLowerCase().includes(rawSearch)) ||
        (rec.outcome && String(rec.outcome).toLowerCase().includes(rawSearch)) ||
        (rec.promptId && String(rec.promptId).toLowerCase().includes(rawSearch)) ||
        (rec.promptVersion && String(rec.promptVersion).toLowerCase().includes(rawSearch)) ||
        (rec.promptHash && String(rec.promptHash).toLowerCase().includes(rawSearch))
      );
      if (!matches) return false;
    }

    return true;
  });
}

/**
 * Sorts in-memory analytics usage records across the full dataset.
 *
 * @param {Array<object>} records
 * @param {string} [sortBy='timestamp']
 * @param {'asc'|'desc'} [sortOrder='desc']
 * @returns {Array<object>}
 */
export function sortInMemoryRecords(records = [], sortBy = 'timestamp', sortOrder = 'desc') {
  const isDesc = sortOrder === 'desc';

  return records.sort((a, b) => {
    let result = 0;

    switch (sortBy) {
      case 'timestamp': {
        const timeA = new Date(a.timestamp || 0).getTime();
        const timeB = new Date(b.timestamp || 0).getTime();
        result = timeA - timeB;
        break;
      }
      case 'feature': {
        result = String(a.feature || '').localeCompare(String(b.feature || ''));
        break;
      }
      case 'model': {
        result = String(a.model || '').localeCompare(String(b.model || ''));
        break;
      }
      case 'outcome': {
        result = String(a.outcome || '').localeCompare(String(b.outcome || ''));
        break;
      }
      case 'durationMs': {
        const valA = typeof a.durationMs === 'number' ? a.durationMs : 0;
        const valB = typeof b.durationMs === 'number' ? b.durationMs : 0;
        result = valA - valB;
        break;
      }
      case 'tokens': {
        const valA = a.tokenUsage?.totalTokens ?? a.estimatedTokens?.effectiveTotalTokens ?? a.estimatedTotalTokens ?? -1;
        const valB = b.tokenUsage?.totalTokens ?? b.estimatedTokens?.effectiveTotalTokens ?? b.estimatedTotalTokens ?? -1;
        result = valA - valB;
        break;
      }
      case 'cost': {
        const valA = a.estimatedCost ?? a.cost?.estimatedCostUsd ?? -1;
        const valB = b.estimatedCost ?? b.cost?.estimatedCostUsd ?? -1;
        result = valA - valB;
        break;
      }
      case 'totalAttempts': {
        const valA = a.totalAttempts || a.attemptCount || 1;
        const valB = b.totalAttempts || b.attemptCount || 1;
        result = valA - valB;
        break;
      }
      default: {
        const timeA = new Date(a.timestamp || 0).getTime();
        const timeB = new Date(b.timestamp || 0).getTime();
        result = timeA - timeB;
        break;
      }
    }

    if (result !== 0) {
      return isDesc ? -result : result;
    }

    // Deterministic tie-breaker
    const secA = new Date(a.timestamp || 0).getTime();
    const secB = new Date(b.timestamp || 0).getTime();
    return secB - secA;
  });
}
