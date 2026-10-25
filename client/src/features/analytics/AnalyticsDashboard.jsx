import React from 'react';
import AnalyticsFilters from './AnalyticsFilters';
import AnalyticsKpiCards from './AnalyticsKpiCards';
import AnalyticsCharts from './AnalyticsCharts';
import AnalyticsHistoryTable from './AnalyticsHistoryTable';
import { useAnalytics } from './useAnalytics';
import './analytics.css';

/**
 * Analytics dashboard displaying telemetry, request metrics, charts, and query inspection.
 */
export default function AnalyticsDashboard() {
  const {
    filters,
    setFilters,
    loading,
    refreshing,
    error,
    overview,
    timeseries,
    breakdown,
    historyData,
    refresh,
  } = useAnalytics();

  return (
    <div className="inner-dashboard-container">
      {error && (
        <div className="form-error" style={{ marginBottom: '16px' }} role="alert">
          {error}
        </div>
      )}

      {/* 2. Filter Toolbar */}
      <AnalyticsFilters
        filters={filters}
        onChange={setFilters}
        onRefresh={refresh}
        refreshing={refreshing}
      />

      {/* 3. KPI Metrics */}
      <AnalyticsKpiCards overview={overview} />

      {/* 4. Visualizations */}
      <AnalyticsCharts timeseries={timeseries} breakdown={breakdown} />

      {/* 5. Request History */}
      <AnalyticsHistoryTable
        historyData={historyData}
        filters={filters}
        onChangeFilters={setFilters}
        loading={loading || refreshing}
      />
    </div>
  );
}

export const AdminAnalyticsDashboard = AnalyticsDashboard;
