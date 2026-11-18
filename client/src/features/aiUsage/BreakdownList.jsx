import React from 'react';
import { AI_USAGE_CHART_CONFIG } from './aiUsageConstants';
import { formatNumber } from '../../shared/utils/formatters';
import ChartLoadingState from './ChartLoadingState.jsx';
import EmptyState from '../../composites/dataDisplay/EmptyState.jsx';
import { Inline, Stack } from '../../primitives/layout/index.js';
import ChartBar from '../../primitives/display/ChartBar.jsx';
import OverflowText from '../../primitives/typography/OverflowText.jsx';

const { COLORS } = AI_USAGE_CHART_CONFIG;

/**
 * Breakdown Distribution List with proportional progress bars.
 */
export default function BreakdownList({ items = [], emptyText = 'No data recorded', loading = false }) {
  if (loading) {
    return <ChartLoadingState height="sm" label="Loading breakdown…" />;
  }

  if (!items || items.length === 0) {
    return <EmptyState message={emptyText} />;
  }

  const colors = COLORS.PALETTE;

  return (
    <Stack gap="xs">
      {items.map((item, idx) => (
        <Inline key={item.name} gap="sm" align="center" fullWidth>
          <div className="w-36 shrink-0 min-w-0">
            <OverflowText as="span" size="xs" color="secondary" title={item.name}>
              {item.name}
            </OverflowText>
          </div>
          <ChartBar
            percentage={item.percentage}
            fillColor={colors[idx % colors.length]}
          />
          <span className="w-20 shrink-0 text-right text-xs font-medium text-content-primary">
            {item.percentage}% ({formatNumber(item.count)})
          </span>
        </Inline>
      ))}
    </Stack>
  );
}
