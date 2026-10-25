import React from 'react';
import { UI_LABELS } from '../../shared/constants';
import { ANALYTICS_CONFIG } from './analyticsConstants';

export default function AnalyticsFilters({
  filters,
  onChange,
  onRefresh,
  refreshing = false,
}) {
  const handleFilterChange = (key, value) => {
    onChange({
      ...filters,
      [key]: value,
      page: 1, // Reset to first page when filter changes
    });
  };

  return (
    <div className="analytics-filters-bar" role="search" aria-label="Analytics filters">
      <div className="analytics-filter-item">
        <label htmlFor="analytics-filter-timerange" className="form-label">
          {UI_LABELS.ANALYTICS.FILTER_TIME_RANGE}
        </label>
        <select
          id="analytics-filter-timerange"
          className="form-select"
          value={filters.timeRange || '7d'}
          onChange={(e) => handleFilterChange('timeRange', e.target.value)}
        >
          {ANALYTICS_CONFIG.TIME_RANGES.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="analytics-filter-item">
        <label htmlFor="analytics-filter-feature" className="form-label">
          {UI_LABELS.ANALYTICS.FILTER_FEATURE}
        </label>
        <select
          id="analytics-filter-feature"
          className="form-select"
          value={filters.feature || 'all'}
          onChange={(e) => handleFilterChange('feature', e.target.value)}
        >
          {ANALYTICS_CONFIG.FEATURES.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="analytics-filter-item">
        <label htmlFor="analytics-filter-outcome" className="form-label">
          {UI_LABELS.ANALYTICS.FILTER_OUTCOME}
        </label>
        <select
          id="analytics-filter-outcome"
          className="form-select"
          value={filters.outcome || 'all'}
          onChange={(e) => handleFilterChange('outcome', e.target.value)}
        >
          {ANALYTICS_CONFIG.OUTCOMES.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="analytics-filter-item analytics-filter-action">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label={UI_LABELS.ANALYTICS.REFRESH_BTN}
        >
          {refreshing ? UI_LABELS.ANALYTICS.REFRESHING_BTN : UI_LABELS.ANALYTICS.REFRESH_BTN}
        </button>
      </div>
    </div>
  );
}
