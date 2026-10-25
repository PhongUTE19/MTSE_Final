import React from 'react';
import AnalyticsFilters from './AnalyticsFilters';
import AnalyticsKpiCards from './AnalyticsKpiCards';
import AnalyticsCharts from './AnalyticsCharts';
import AnalyticsHistoryTable from './AnalyticsHistoryTable';
import { useAnalytics } from './useAnalytics';
import { UI_LABELS } from '../../shared/constants';

export default function AdminAnalyticsDashboard() {
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

  const isDurable = overview?.persistence?.isDurable;

  return (
    <div className="inner-dashboard-container">
      {/* 1. Header with Persistence Status */}

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
