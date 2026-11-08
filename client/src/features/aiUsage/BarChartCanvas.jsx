import React from 'react';
import { AI_USAGE_CHART_CONFIG } from './aiUsageConstants';
import { Inline } from '../../primitives/layout/index.js';
import Text from '../../primitives/typography/Text.jsx';
import ColorIndicator from '../../primitives/display/ColorIndicator.jsx';

function computeBarChartGeometry(dataLength) {
  const {
    WIDTH: svgWidth,
    HEIGHT: svgHeight,
    PADDING_BOTTOM: paddingBottom,
    PADDING_TOP: paddingTop,
  } = AI_USAGE_CHART_CONFIG.DIMENSIONS;
  const chartHeight = svgHeight - paddingBottom - paddingTop;
  const barWidth = Math.max(8, Math.min(32, Math.floor((svgWidth - 40) / dataLength) - 6));
  const spacing = (svgWidth - 40) / dataLength;
  const yBase = svgHeight - paddingBottom;
  return { svgWidth, svgHeight, yBase, chartHeight, barWidth, spacing };
}

function formatShortChartLabel(item) {
  const rawLabel = item.dateLabel || item.timestamp || '';
  return rawLabel.includes(' ') ? rawLabel.split(' ')[1] : rawLabel.slice(5);
}

/**
 * Shared SVG bar-chart canvas for AI Usage time-series charts.
 * Handles responsive viewBox sizing, baseline axis, column x-positioning,
 * accessible <title> tooltips, x-axis tick labels, and optional legend items.
 */
export default function BarChartCanvas({
  data,
  ariaLabel,
  getTooltip,
  renderBar,
  legendItems = [],
}) {
  const { svgWidth, svgHeight, yBase, chartHeight, barWidth, spacing } =
    computeBarChartGeometry(data.length);

  return (
    <div>
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="w-full h-chart overflow-visible"
        preserveAspectRatio="none"
        role="img"
        aria-label={ariaLabel}
      >
        <line
          x1="20"
          y1={yBase}
          x2={svgWidth - 10}
          y2={yBase}
          stroke="var(--color-slate-200)"
          strokeWidth="1"
        />

        {data.map((item, idx) => {
          const x = 25 + idx * spacing + (spacing - barWidth) / 2;
          const shortLabel = formatShortChartLabel(item);

          return (
            <g key={item.timestamp || idx}>
              <title>{getTooltip(item)}</title>
              {renderBar({ item, x, barWidth, yBase, chartHeight })}
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

      {legendItems.length > 0 && (
        <Inline gap="md" align="center" justify="center">
          {legendItems.map((entry) => (
            <Inline key={entry.label} gap="xs" align="center">
              <ColorIndicator color={entry.color} />
              <Text as="span" variant="caption">{entry.label}</Text>
            </Inline>
          ))}
        </Inline>
      )}
    </div>
  );
}
