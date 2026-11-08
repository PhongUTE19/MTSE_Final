import React from 'react';
import { PageHeader } from '../../layouts/WorkspaceLayout.jsx';
import Alert from '../../composites/feedback/Alert.jsx';
import { Stack } from '../../primitives/layout/index.js';
import AIUsageFilters from './AIUsageFilters';
import AIUsageSummary from './AIUsageSummary';
import AIUsageCharts from './AIUsageCharts';
import AIUsageHistoryTable from './AIUsageHistoryTable';
import { useAIUsage } from './useAIUsage';

/**
 * Admin AI Usage page: telemetry, request metrics, charts, and query inspection.
 */
export default function AIUsagePage() {
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
  } = useAIUsage();

  return (
    <Stack gap="lg">
      <PageHeader
        eyebrow="ADMINISTRATION"
        title="AI Usage"
        description="Monitor Gemini token consumption, latency, and request telemetry across AI features."
      />

      <AIUsageFilters
        filters={filters}
        onChange={setFilters}
        onRefresh={refresh}
        refreshing={refreshing}
      />

      <AIUsageSummary overview={overview} loading={loading || refreshing} error={error} />

      <AIUsageCharts
        timeseries={timeseries}
        breakdown={breakdown}
        loading={loading}
      />

      <AIUsageHistoryTable
        historyData={historyData}
        filters={filters}
        onChangeFilters={setFilters}
        loading={loading || refreshing}
      />
    </Stack>
  );
}
