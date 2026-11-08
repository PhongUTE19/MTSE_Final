import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '../../app/providers/index.js';
import {
  fetchAIUsageOverview,
  fetchAIUsageTimeseries,
  fetchAIUsageBreakdown,
  fetchAIUsageHistory,
} from './aiUsageApi';
import { AI_USAGE_CONFIG } from './aiUsageConstants';

/**
 * Custom hook to manage Admin AI Usage filter state, asynchronous queries,
 * error handling, and manual refresh triggers.
 *
 * Follows the project's standard hook conventions (e.g. useChunks, useDocuments).
 *
 * @param {object} [options={}]
 * @param {object} [options.initialFilters]
 * @returns {object} AI usage query state and operations
 */
export function useAIUsage(options = {}) {
  let toast = null;
  try {
    const toastContext = useToast();
    toast = toastContext?.toast;
  } catch {
    // Fallback when rendered without ToastProvider
  }

  const [filters, setFilters] = useState(() => ({
    timeRange: AI_USAGE_CONFIG.DEFAULT_TIME_RANGE,
    feature: 'all',
    model: 'all',
    outcome: 'all',
    page: 1,
    limit: AI_USAGE_CONFIG.DEFAULT_PAGE_SIZE,
    search: '',
    sortBy: 'timestamp',
    sortOrder: 'desc',
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
  const prevCoreFiltersRef = useRef(null);

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

    const prevCore = prevCoreFiltersRef.current;
    const coreChanged =
      isManualRefresh ||
      !prevCore ||
      prevCore.timeRange !== activeFilters.timeRange ||
      prevCore.feature !== activeFilters.feature ||
      prevCore.model !== activeFilters.model ||
      prevCore.outcome !== activeFilters.outcome ||
      prevCore.startDate !== activeFilters.startDate ||
      prevCore.endDate !== activeFilters.endDate;

    try {
      if (coreChanged) {
        const [ov, ts, bd, hist] = await Promise.all([
          fetchAIUsageOverview(activeFilters),
          fetchAIUsageTimeseries(activeFilters),
          fetchAIUsageBreakdown(activeFilters),
          fetchAIUsageHistory(activeFilters),
        ]);

        if (isMountedRef.current) {
          setOverview(ov);
          setTimeseries(ts || []);
          setBreakdown(bd);
          setHistoryData(hist);
          prevCoreFiltersRef.current = {
            timeRange: activeFilters.timeRange,
            feature: activeFilters.feature,
            model: activeFilters.model,
            outcome: activeFilters.outcome,
            startDate: activeFilters.startDate,
            endDate: activeFilters.endDate,
          };
        }
      } else {
        const hist = await fetchAIUsageHistory(activeFilters);
        if (isMountedRef.current) {
          setHistoryData(hist);
        }
      }
    } catch (err) {
      if (isMountedRef.current) {
        const errorMsg = err.message || 'Failed to load AI usage data.';
        setError(errorMsg);
        toast?.error(errorMsg);
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
