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
export function fetchAIUsageOverview(filters) {
  const qs = buildFilterQueryString(filters);
  return apiRequest(`${API_ENDPOINTS.ADMIN_AI_USAGE_OVERVIEW}${qs}`, {}, 'Failed to load AI usage overview');
}

/**
 * Fetches timeseries aggregations grouped by day or hour.
 *
 * @param {object} [filters]
 * @returns {Promise<Array<object>>}
 */
export function fetchAIUsageTimeseries(filters) {
  const qs = buildFilterQueryString(filters);
  return apiRequest(`${API_ENDPOINTS.ADMIN_AI_USAGE_TIMESERIES}${qs}`, {}, 'Failed to load AI usage timeseries');
}

/**
 * Fetches breakdown distributions by feature, model, operation, and outcome.
 *
 * @param {object} [filters]
 * @returns {Promise<object>}
 */
export function fetchAIUsageBreakdown(filters) {
  const qs = buildFilterQueryString(filters);
  return apiRequest(`${API_ENDPOINTS.ADMIN_AI_USAGE_BREAKDOWN}${qs}`, {}, 'Failed to load AI usage breakdown');
}

/**
 * Fetches paginated request history records.
 *
 * @param {object} [filters]
 * @returns {Promise<{ page: number, limit: number, total: number, totalPages: number, records: Array<object> }>}
 */
export function fetchAIUsageHistory(filters) {
  const qs = buildFilterQueryString(filters);
  return apiRequest(`${API_ENDPOINTS.ADMIN_AI_USAGE_HISTORY}${qs}`, {}, 'Failed to load AI usage request history');
}
