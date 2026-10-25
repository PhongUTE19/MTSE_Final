import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchAnalyticsOverview,
  fetchAnalyticsTimeseries,
  fetchAnalyticsBreakdown,
  fetchAnalyticsHistory,
} from './analyticsApi';
import { ANALYTICS_CONFIG } from './analyticsConstants';

/**
 * Custom hook to manage Admin Analytics filter state, asynchronous queries,
 * error handling, and manual refresh triggers.
 *
 * Follows the project's standard hook conventions (e.g. useChunks, useDocuments).
 *
 * @param {object} [options={}]
 * @param {object} [options.initialFilters]
 * @returns {object} Analytics query state and operations
 */
export function useAnalytics(options = {}) {
  const [filters, setFilters] = useState(() => ({
    timeRange: ANALYTICS_CONFIG.DEFAULT_TIME_RANGE,
    feature: 'all',
    model: 'all',
    outcome: 'all',
    page: 1,
    limit: ANALYTICS_CONFIG.DEFAULT_PAGE_SIZE,
    ...(options.initialFilters || {}),
  }));

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const [overview, setOverview] = useState(null);
  const [timeseries, setTimeseries] = useState([]);
  const [breakdown, setBreakdown] = useState(null);
  const [historyData, setHistoryData] = useState(null);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadData = useCallback(async (activeFilters, isManualRefresh = false) => {
    if (isManualRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const [ov, ts, bd, hist] = await Promise.all([
        fetchAnalyticsOverview(activeFilters),
        fetchAnalyticsTimeseries(activeFilters),
        fetchAnalyticsBreakdown(activeFilters),
        fetchAnalyticsHistory(activeFilters),
      ]);

      if (isMountedRef.current) {
        setOverview(ov);
        setTimeseries(ts || []);
        setBreakdown(bd);
        setHistoryData(hist);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err.message || 'Failed to fetch analytics data');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    loadData(filters);
  }, [filters, loadData]);

  const refresh = useCallback(() => {
    loadData(filters, true);
  }, [filters, loadData]);

  return {
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
  };
}
