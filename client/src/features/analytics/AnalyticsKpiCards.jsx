import React from 'react';
import { UI_LABELS } from '../../shared/constants';
import { formatNumber } from '../../shared/utils/formatters';


export default function AnalyticsKpiCards({ overview }) {
  if (!overview) return null;

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
  } = overview;

  return (
    <div className="stats-grid" role="region" aria-label="KPI overview">
      {/* 1. Total Requests */}
      <div className="card flex-container">
        <span className="stat-label">{UI_LABELS.ANALYTICS.KPIS.TOTAL_REQUESTS}</span>
        <span className="stat-value">{formatNumber(totalRequests)}</span>
        <span className="stat-sub">Across selected time window</span>
      </div>

      {/* 2. Success Rate */}
      <div className="card flex-container">
        <span className="stat-label">{UI_LABELS.ANALYTICS.KPIS.SUCCESS_RATE}</span>
        <span className="stat-value stat-value--success">
          {successRate}%
        </span>
        <span className="stat-sub">
          {formatNumber(successCount)} successful calls
        </span>
      </div>

      {/* 3. Failure & Refusal */}
      <div className="card flex-container">
        <span className="stat-label">{UI_LABELS.ANALYTICS.KPIS.FAILURE_RATE}</span>
        <span className={`stat-value ${failureRate > 0 ? 'stat-value--failure' : ''}`}>
          {failureRate}%
        </span>
        <span className="stat-sub">
          {formatNumber(failureCount)} errors · {formatNumber(refusalCount)} refusals ({refusalRate}%)
        </span>
      </div>

      {/* 4. Total Tokens & Completeness Warning */}
      <div className="card flex-container">
        <span className="stat-label">{UI_LABELS.ANALYTICS.KPIS.TOTAL_TOKENS}</span>
        <span className="stat-value">{formatNumber(totalTokens)}</span>
        <span className="stat-sub">
          In: {formatNumber(inputTokens)} · Out: {formatNumber(outputTokens)}
        </span>
        {recordsWithMissingTokens > 0 && (
          <div className="badge badge-warning" title="Provider response did not include complete token metadata">
            {UI_LABELS.ANALYTICS.KPIS.INCOMPLETE_TOKENS_WARNING(recordsWithMissingTokens)}
          </div>
        )}
      </div>

      {/* 5. Latency Metrics */}
      <div className="card flex-container">
        <span className="stat-label">{UI_LABELS.ANALYTICS.KPIS.LATENCY_TITLE}</span>
        <span className="stat-value">
          {avgLatencyMs} <span className="stat-unit">ms</span>
        </span>
        <span className="stat-sub">
          p95: {p95LatencyMs} ms
        </span>
      </div>
    </div>
  );
}
