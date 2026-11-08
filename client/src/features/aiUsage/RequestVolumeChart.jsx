import React from 'react';
import { UI_LABELS } from '../../shared/constants';
import { AI_USAGE_CHART_CONFIG } from './aiUsageConstants';
import BarChartCanvas from './BarChartCanvas.jsx';
import ChartLoadingState from './ChartLoadingState.jsx';
import EmptyState from '../../composites/dataDisplay/EmptyState.jsx';

const { COLORS } = AI_USAGE_CHART_CONFIG;

const VOLUME_LEGEND = [
  { color: 'emerald', label: 'Success' },
  { color: 'red', label: 'Failure' },
  { color: 'amber', label: 'Refusal' },
];

/**
 * Pure SVG Stacked Bar Chart for Request Volume & Outcome Trend.
 */
export default function RequestVolumeChart({ data = [], loading = false }) {
  if (loading) {
    return <ChartLoadingState height="lg" label="Loading trend data…" />;
  }

  if (!data || data.length === 0) {
    return <EmptyState message={UI_LABELS.ANALYTICS.CHARTS.NO_DATA} />;
  }

  const maxVal = Math.max(...data.map((d) => d.totalRequests), 1);

  return (
    <BarChartCanvas
      data={data}
      ariaLabel="Request Volume Chart"
      legendItems={VOLUME_LEGEND}
      getTooltip={(d) =>
        `${d.dateLabel}: ${d.totalRequests} total (${d.successCount} ok, ${d.failureCount} err, ${d.refusalCount} ref)`
      }
      renderBar={({ item, x, barWidth, yBase, chartHeight }) => {
        const successHeight = (item.successCount / maxVal) * chartHeight;
        const failureHeight = (item.failureCount / maxVal) * chartHeight;
        const refusalHeight = (item.refusalCount / maxVal) * chartHeight;

        const ySuccess = yBase - successHeight;
        const yFailure = ySuccess - failureHeight;
        const yRefusal = yFailure - refusalHeight;

        return (
          <>
            {successHeight > 0 && (
              <rect x={x} y={ySuccess} width={barWidth} height={successHeight} fill={COLORS.SUCCESS} rx="2" />
            )}
            {failureHeight > 0 && (
              <rect x={x} y={yFailure} width={barWidth} height={failureHeight} fill={COLORS.FAILURE} rx="1" />
            )}
            {refusalHeight > 0 && (
              <rect x={x} y={yRefusal} width={barWidth} height={refusalHeight} fill={COLORS.REFUSAL} rx="1" />
            )}
          </>
        );
      }}
    />
  );
}
