import React from 'react';
import WorkspaceLayout from '../../layouts/WorkspaceLayout';
import HealthBadge from '../../shared/components/HealthBadge';
import { ToastProvider } from '../../shared/contexts/ToastContext';
import { useHealth } from '../../shared/hooks';
import { ADMIN_TABS, USER_ROLES } from '../../shared/constants';
import AnalyticsFilters from './AnalyticsFilters';
import AnalyticsKpiCards from './AnalyticsKpiCards';
import AnalyticsCharts from './AnalyticsCharts';
import AnalyticsHistoryTable from './AnalyticsHistoryTable';
import { useAnalytics } from './useAnalytics';
import './analytics.css';

/**
 * Admin analytics page: telemetry, request metrics, charts, and query inspection,
 * rendered inside the shared workspace layout.
 */
export default function AnalyticsPage({ user, onSignOut }) {
  const { health, checkHealth } = useHealth(USER_ROLES.ADMIN);
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
    <ToastProvider>
      <WorkspaceLayout
        eyebrow="ADMINISTRATION"
        title="AI Usage"
        sidebarProps={{ activeView: ADMIN_TABS.ANALYTICS, user, onSignOut }}
        headerAction={
          <HealthBadge
            status={health?.status}
            indexedChunks={health?.indexedChunks}
            loading={health?.loading}
            error={health?.error}
            onRetry={checkHealth}
          />
        }
      >
        <div className="dashboard-container">
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
        </div>
      </WorkspaceLayout>
    </ToastProvider>
  );
}
