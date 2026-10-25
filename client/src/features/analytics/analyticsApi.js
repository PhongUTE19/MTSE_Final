import { API_ENDPOINTS } from '../../shared/constants';
import { apiRequest } from '../../shared/services/apiClient';
import { toQueryString } from '../../shared/utils/collectionUtils';

/**
 * Builds a query string from filter options.
 *
 * @param {object} [filters={}]
 * @returns {string}
 */
function buildFilterQueryString(filters = {}) {
  return toQueryString(filters, { ignoreValues: ['', null, undefined, 'all'] });
}

/**
 * Fetches high-level summary KPIs (requests, success/failure/refusal rates, tokens, latencies).
 *
 * @param {object} [filters]
 * @returns {Promise<object>}
 */
export function fetchAnalyticsOverview(filters) {
  const qs = buildFilterQueryString(filters);
  return apiRequest(`${API_ENDPOINTS.ADMIN_ANALYTICS_OVERVIEW}${qs}`, {}, 'Failed to load analytics overview');
}

/**
 * Fetches timeseries aggregations grouped by day or hour.
 *
 * @param {object} [filters]
 * @returns {Promise<Array<object>>}
 */
export function fetchAnalyticsTimeseries(filters) {
  const qs = buildFilterQueryString(filters);
  return apiRequest(`${API_ENDPOINTS.ADMIN_ANALYTICS_TIMESERIES}${qs}`, {}, 'Failed to load analytics timeseries');
}

/**
 * Fetches breakdown distributions by feature, model, operation, and outcome.
 *
 * @param {object} [filters]
 * @returns {Promise<object>}
 */
export function fetchAnalyticsBreakdown(filters) {
  const qs = buildFilterQueryString(filters);
  return apiRequest(`${API_ENDPOINTS.ADMIN_ANALYTICS_BREAKDOWN}${qs}`, {}, 'Failed to load analytics breakdown');
}

/**
 * Fetches paginated request history records.
 *
 * @param {object} [filters]
 * @returns {Promise<{ page: number, limit: number, total: number, totalPages: number, records: Array<object> }>}
 */
export function fetchAnalyticsHistory(filters) {
  const qs = buildFilterQueryString(filters);
  return apiRequest(`${API_ENDPOINTS.ADMIN_ANALYTICS_HISTORY}${qs}`, {}, 'Failed to load analytics request history');
}
