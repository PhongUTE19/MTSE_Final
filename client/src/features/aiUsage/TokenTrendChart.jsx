import React from 'react';
import { UI_LABELS } from '../../shared/constants';
import { AI_USAGE_CHART_CONFIG } from './aiUsageConstants';
import { formatNumber } from '../../shared/utils/formatters';
import BarChartCanvas from './BarChartCanvas.jsx';
import ChartLoadingState from './ChartLoadingState.jsx';
import EmptyState from '../../composites/dataDisplay/EmptyState.jsx';

const { COLORS } = AI_USAGE_CHART_CONFIG;

const TOKEN_LEGEND = [
  { color: 'sky', label: 'Total Tokens (Observed)' },
];

/**
 * Pure SVG Bar Chart for Token Trends.
 */
export default function TokenTrendChart({ data = [], loading = false }) {
  if (loading) {
    return <ChartLoadingState height="lg" label="Loading token metrics…" />;
  }

  if (!data || data.length === 0) {
    return <EmptyState message={UI_LABELS.ANALYTICS.CHARTS.NO_DATA} />;
  }

  const maxVal = Math.max(...data.map((d) => d.totalTokens || 0), 10);

  return (
    <BarChartCanvas
      data={data}
      ariaLabel="Token Usage Chart"
      legendItems={TOKEN_LEGEND}
      getTooltip={(d) => `${d.dateLabel}: ${formatNumber(d.totalTokens || 0)} tokens`}
      renderBar={({ item, x, barWidth, yBase, chartHeight }) => {
        const tokens = item.totalTokens || 0;
        const barH = (tokens / maxVal) * chartHeight;
        const y = yBase - barH;

        return (
          <rect
            x={x}
            y={y}
            width={barWidth}
            height={Math.max(barH, 2)}
            fill={COLORS.TOKEN}
            rx="2"
          />
        );
      }}
    />
  );
}
