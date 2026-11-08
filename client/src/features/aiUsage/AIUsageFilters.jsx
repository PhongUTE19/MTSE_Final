import React from 'react';
import { UI_LABELS } from '../../shared/constants';
import { AI_USAGE_CONFIG } from './aiUsageConstants';
import Select from '../../primitives/inputs/Select.jsx';
import Label from '../../primitives/labels/Label.jsx';
import Button from '../../primitives/buttons/Button.jsx';
import { Inline, Stack } from '../../primitives/layout/index.js';

/**
 * Filter toolbar for AI Usage dashboard.
 * Composes Base Inline layout and Base Stack primitives directly with zero styling wrapper elements.
 */
export default function AIUsageFilters({ filters, onChange, onRefresh, refreshing = false }) {
  const handleFilterChange = (key, value) => {
    onChange({
      ...filters,
      [key]: value,
      page: 1, // Reset to first page when filter changes
    });
  };

  return (
    <Inline
      as="section"
      gap="md"
      wrap
      align="end"
      role="search"
      aria-label="Analytics filters"
    >
      <Stack gap="xs">
        <Label htmlFor="analytics-filter-timerange">{UI_LABELS.ANALYTICS.FILTER_TIME_RANGE}</Label>
        <Select
          id="analytics-filter-timerange"
          value={filters.timeRange || '7d'}
          onChange={(e) => handleFilterChange('timeRange', e.target.value)}
          options={AI_USAGE_CONFIG.TIME_RANGES}
        />
      </Stack>

      <Stack gap="xs">
        <Label htmlFor="analytics-filter-feature">{UI_LABELS.ANALYTICS.FILTER_FEATURE}</Label>
        <Select
          id="analytics-filter-feature"
          value={filters.feature || 'all'}
          onChange={(e) => handleFilterChange('feature', e.target.value)}
          options={AI_USAGE_CONFIG.FEATURES}
        />
      </Stack>

      <Stack gap="xs">
        <Label htmlFor="analytics-filter-outcome">{UI_LABELS.ANALYTICS.FILTER_OUTCOME}</Label>
        <Select
          id="analytics-filter-outcome"
          value={filters.outcome || 'all'}
          onChange={(e) => handleFilterChange('outcome', e.target.value)}
          options={AI_USAGE_CONFIG.OUTCOMES}
        />
      </Stack>

      {onRefresh && (
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            if (!refreshing) onRefresh();
          }}
          disabled={refreshing}
          loading={refreshing}
          aria-label="Refresh analytics data"
          title="Refresh analytics data"
        >
          Refresh
        </Button>
      )}
    </Inline>
  );
}
