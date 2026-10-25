import React from 'react';
import { UI_LABELS } from '../../shared/constants';
import { ANALYTICS_CHART_CONFIG } from './analyticsConstants';
import { formatNumber } from '../../shared/utils/formatters';


const { DIMENSIONS, COLORS } = ANALYTICS_CHART_CONFIG;

/**
 * Pure SVG Stacked Bar Chart for Request Volume & Outcome Trend
 */
function RequestVolumeChart({ data = [] }) {
  if (!data || data.length === 0) {
    return <div className="empty-state">{UI_LABELS.ANALYTICS.CHARTS.NO_DATA}</div>;
  }

  const svgWidth = DIMENSIONS.WIDTH;
  const svgHeight = DIMENSIONS.HEIGHT;
  const paddingBottom = DIMENSIONS.PADDING_BOTTOM;
  const paddingTop = DIMENSIONS.PADDING_TOP;
  const chartHeight = svgHeight - paddingBottom - paddingTop;

  const maxVal = Math.max(...data.map((d) => d.totalRequests), 1);
  const barWidth = Math.max(8, Math.min(32, Math.floor((svgWidth - 40) / data.length) - 6));
  const spacing = (svgWidth - 40) / data.length;

  return (
    <div>
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="analytics-svg-chart"
        preserveAspectRatio="none"
        aria-label="Request Volume Chart"
      >
        {/* Baseline grid */}
        <line
          x1="20"
          y1={svgHeight - paddingBottom}
          x2={svgWidth - 10}
          y2={svgHeight - paddingBottom}
          stroke="var(--color-slate-200)"
          strokeWidth="1"
        />

        {data.map((d, idx) => {
          const x = 25 + idx * spacing + (spacing - barWidth) / 2;
          const totalHeight = (d.totalRequests / maxVal) * chartHeight;
          const successHeight = (d.successCount / maxVal) * chartHeight;
          const failureHeight = (d.failureCount / maxVal) * chartHeight;
          const refusalHeight = (d.refusalCount / maxVal) * chartHeight;

          const yBase = svgHeight - paddingBottom;
          const ySuccess = yBase - successHeight;
          const yFailure = ySuccess - failureHeight;
          const yRefusal = yFailure - refusalHeight;

          // Short label (e.g. MM-DD or HH:00)
          const rawLabel = d.dateLabel || d.timestamp || '';
          const shortLabel = rawLabel.includes(' ')
            ? rawLabel.split(' ')[1]
            : rawLabel.slice(5);

          return (
            <g key={d.timestamp || idx}>
              <title>
                {`${d.dateLabel}: ${d.totalRequests} total (${d.successCount} ok, ${d.failureCount} err, ${d.refusalCount} ref)`}
              </title>

              {/* Success slice (green) */}
              {successHeight > 0 && (
                <rect
                  x={x}
                  y={ySuccess}
                  width={barWidth}
                  height={successHeight}
                  fill={COLORS.SUCCESS}
                  rx="2"
                />
              )}

              {/* Failure slice (red) */}
              {failureHeight > 0 && (
                <rect
                  x={x}
                  y={yFailure}
                  width={barWidth}
                  height={failureHeight}
                  fill={COLORS.FAILURE}
                  rx="1"
                />
              )}

              {/* Refusal slice (amber) */}
              {refusalHeight > 0 && (
                <rect
                  x={x}
                  y={yRefusal}
                  width={barWidth}
                  height={refusalHeight}
                  fill={COLORS.REFUSAL}
                  rx="1"
                />
              )}

              {/* Date/hour axis tick */}
              <text
                x={x + barWidth / 2}
                y={svgHeight - 6}
                textAnchor="middle"
                fontSize="9"
                fill="var(--color-slate-500)"
              >
                {shortLabel}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="analytics-chart-legend">
        <span className="analytics-legend-item">
          <span className="analytics-legend-dot analytics-legend-dot--success" /> Success
        </span>
        <span className="analytics-legend-item">
          <span className="analytics-legend-dot analytics-legend-dot--failure" /> Failure
        </span>
        <span className="analytics-legend-item">
          <span className="analytics-legend-dot analytics-legend-dot--refusal" /> Refusal
        </span>
      </div>
    </div>
  );
}

/**
 * Pure SVG Area / Bar Chart for Token Trends
 */
function TokenTrendChart({ data = [] }) {
  if (!data || data.length === 0) {
    return <div className="empty-state">{UI_LABELS.ANALYTICS.CHARTS.NO_DATA}</div>;
  }

  const svgWidth = DIMENSIONS.WIDTH;
  const svgHeight = DIMENSIONS.HEIGHT;
  const paddingBottom = DIMENSIONS.PADDING_BOTTOM;
  const paddingTop = DIMENSIONS.PADDING_TOP;
  const chartHeight = svgHeight - paddingBottom - paddingTop;

  const maxVal = Math.max(...data.map((d) => d.totalTokens || 0), 10);
  const barWidth = Math.max(8, Math.min(32, Math.floor((svgWidth - 40) / data.length) - 6));
  const spacing = (svgWidth - 40) / data.length;

  return (
    <div>
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="analytics-svg-chart"
        preserveAspectRatio="none"
        aria-label="Token Usage Chart"
      >
        <line
          x1="20"
          y1={svgHeight - paddingBottom}
          x2={svgWidth - 10}
          y2={svgHeight - paddingBottom}
          stroke="var(--color-slate-200)"
          strokeWidth="1"
        />

        {data.map((d, idx) => {
          const tokens = d.totalTokens || 0;
          const x = 25 + idx * spacing + (spacing - barWidth) / 2;
          const barH = (tokens / maxVal) * chartHeight;
          const y = svgHeight - paddingBottom - barH;

          const rawLabel = d.dateLabel || d.timestamp || '';
          const shortLabel = rawLabel.includes(' ')
            ? rawLabel.split(' ')[1]
            : rawLabel.slice(5);

          return (
            <g key={d.timestamp || idx}>
              <title>{`${d.dateLabel}: ${formatNumber(tokens)} tokens`}</title>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(barH, 2)}
                fill={COLORS.TOKEN}
                rx="2"
              />
              <text
                x={x + barWidth / 2}
                y={svgHeight - 6}
                textAnchor="middle"
                fontSize="9"
                fill="var(--color-slate-500)"
              >
                {shortLabel}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="analytics-chart-legend">
        <span className="analytics-legend-item">
          <span className="analytics-legend-dot analytics-legend-dot--token" /> Total Tokens (Observed)
        </span>
      </div>
    </div>
  );
}

/**
 * Breakdown Distribution List with proportional progress bars
 */
function BreakdownList({ items = [], emptyText = 'No data recorded' }) {
  if (!items || items.length === 0) {
    return <div className="empty-state">{emptyText}</div>;
  }

  const colors = COLORS.PALETTE;

  return (
    <div className="bar-list">
      {items.map((item, idx) => (
        <div key={item.name} className="bar-row">
          <span className="bar-label" title={item.name}>
            {item.name}
          </span>
          <div className="bar-track">
            <svg className="bar-track-svg" width="100%" height="100%" aria-hidden="true">
              <rect
                className="bar-fill"
                x="0"
                y="0"
                width={`${Math.max(item.percentage, 2)}%`}
                height="100%"
                rx="2"
                fill={colors[idx % colors.length]}
              />
            </svg>
          </div>
          <span className="bar-val">
            {item.percentage}% ({formatNumber(item.count)})
          </span>
        </div>
      ))}
    </div>
  );
}

export default function AnalyticsCharts({ timeseries = [], breakdown = {} }) {
  return (
    <div className="analytics-charts-grid" role="region" aria-label="Analytics charts">
      {/* 1. Request Volume Trend */}
      <div className="panel">
        <div className="panel-header split-layout">
          <h4 className="panel-title">{UI_LABELS.ANALYTICS.CHARTS.VOLUME_TREND}</h4>
        </div>
        <RequestVolumeChart data={timeseries} />
      </div>

      {/* 2. Token Usage Trend */}
      <div className="panel">
        <div className="panel-header split-layout">
          <h4 className="panel-title">{UI_LABELS.ANALYTICS.CHARTS.TOKEN_TREND}</h4>
        </div>
        <TokenTrendChart data={timeseries} />
      </div>

      {/* 3. Feature Breakdown */}
      <div className="panel">
        <div className="panel-header split-layout">
          <h4 className="panel-title">{UI_LABELS.ANALYTICS.CHARTS.FEATURE_BREAKDOWN}</h4>
        </div>
        <BreakdownList items={breakdown?.byFeature} />
      </div>

      {/* 4. Model Breakdown */}
      <div className="panel">
        <div className="panel-header split-layout">
          <h4 className="panel-title">{UI_LABELS.ANALYTICS.CHARTS.MODEL_BREAKDOWN}</h4>
        </div>
        <BreakdownList items={breakdown?.byModel} />
      </div>
    </div>
  );
}
