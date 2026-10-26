import { getSupabaseClient } from '../../shared/integrations/supabase.js';
import { defaultUsageStore } from './usageTracker.js';
import { resolveTimeBounds, filterInMemoryRecords } from './analytics.utils.js';
import {
  ANALYTICS_TABLE,
  IN_MEMORY_DEFAULTS,
  PERSISTENCE_PROVIDERS,
  PROVIDERS,
} from './analytics.constants.js';

/**
 * Formats a normalized usage record into a database row for ai_usage_analytics.
 *
 * @param {object} record - UsageRecord
 * @returns {object} Database row object
 */
export function formatRecordForDb(record) {
  return {
    id: record.id,
    timestamp: record.timestamp,
    feature: record.feature,
    operation: record.operation,
    provider: record.provider || PROVIDERS.GOOGLE_GENAI,
    model: record.model,
    outcome: record.outcome,
    is_refusal: Boolean(record.isRefusal || record.refusal),
    refusal_reason: record.refusalReason || null,
    duration_ms: record.durationMs || 0,
    time_to_first_token_ms: record.timeToFirstTokenMs || null,
    total_attempts: record.totalAttempts || record.attemptCount || 1,
    attempts: record.attempts || [],
    input_tokens: record.tokenUsage?.inputTokens ?? null,
    output_tokens: record.tokenUsage?.outputTokens ?? null,
    total_tokens: record.tokenUsage?.totalTokens ?? null,
    token_counts_available: Boolean(record.tokenUsage?.tokenCountsAvailable),
    prompt_id: record.promptId || null,
    prompt_version: record.promptVersion || null,
    prompt_hash: record.promptHash || null,
    tools_executed: record.toolsExecuted || [],
    estimated_cost: record.estimatedCost ?? null,
    cost_status: record.costStatus || 'unknown',
    error: record.error || null,
  };
}

/**
 * Maps a database row back to the application-level usage record shape.
 *
 * @param {object} row - Database row
 * @returns {object} Usage record
 */
export function formatDbToRecord(row) {
  const isRefusal = Boolean(row.is_refusal);
  const totalAttempts = row.total_attempts || 1;
  const estimatedCost = row.estimated_cost != null ? Number(row.estimated_cost) : null;
  const costStatus = row.cost_status || (estimatedCost !== null ? 'calculated' : 'unknown');

  // Parse prompt metadata safely, supporting historical rows where hash was in prompt_version
  let promptId = row.prompt_id || null;
  let promptVersion = row.prompt_version || null;
  let promptHash = row.prompt_hash || null;

  if (promptVersion && typeof promptVersion === 'string') {
    const trimmed = promptVersion.trim();
    if (/^[a-f0-9]{64}$/i.test(trimmed)) {
      if (!promptHash) promptHash = trimmed;
      promptVersion = null; // Do not invent explicit version for pure hash
    } else if (/^[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+:[a-f0-9]{64}$/i.test(trimmed)) {
      const parts = trimmed.split(':');
      if (!promptId) promptId = parts[0];
      promptVersion = parts[1];
      if (!promptHash) promptHash = parts[2];
    } else if (/^[a-zA-Z0-9_-]+:[a-f0-9]{64}$/i.test(trimmed)) {
      const parts = trimmed.split(':');
      promptVersion = parts[0];
      if (!promptHash) promptHash = parts[1];
    }
  }

  return {
    id: row.id,
    timestamp: row.timestamp,
    feature: row.feature,
    operation: row.operation,
    provider: row.provider,
    model: row.model,
    outcome: row.outcome,
    isRefusal,
    refusal: isRefusal,
    refusalReason: row.refusal_reason,
    durationMs: row.duration_ms,
    timeToFirstTokenMs: row.time_to_first_token_ms,
    totalAttempts,
    attemptCount: totalAttempts,
    attempts: row.attempts || [],
    tokenUsage: {
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      totalTokens: row.total_tokens,
      tokenCountsAvailable: row.token_counts_available,
      tokenCountsComplete: Boolean(
        row.token_counts_available &&
        row.input_tokens !== null &&
        row.output_tokens !== null &&
        row.total_tokens !== null
      ),
    },
    promptId,
    promptVersion,
    promptHash,
    toolsExecuted: row.tools_executed || [],
    cost: {
      estimatedCostUsd: estimatedCost,
      costStatus,
      currency: 'USD',
    },
    estimatedCost,
    costStatus,
    error: row.error,
  };
}

/**
 * Builds standard Supabase query filters for time bounds, feature, model, and outcome.
 *
 * @param {object} baseQuery - Supabase query builder
 * @param {object} filters - User filter options
 * @returns {object} Filtered query builder
 */
function applyDatabaseFilters(baseQuery, filters = {}) {
  const { start, end } = resolveTimeBounds(filters);
  let query = baseQuery;

  if (start) query = query.gte('timestamp', start);
  if (end) query = query.lte('timestamp', end);
  if (filters.feature && filters.feature !== 'all') query = query.eq('feature', filters.feature);
  if (filters.model && filters.model !== 'all') query = query.eq('model', filters.model);
  if (filters.outcome && filters.outcome !== 'all') query = query.eq('outcome', filters.outcome);

  return query;
}

/**
 * Helper to obtain Supabase client, respecting test override.
 */
function getRepositoryClient() {
  if (process.env.FORCE_IN_MEMORY_ANALYTICS === 'true') {
    return null;
  }
  return getSupabaseClient();
}

/**
 * Fetches raw records needed for KPI overview calculations.
 *
 * @param {object} [filters={}]
 * @returns {Promise<{ records: Array<object>, isDurable: boolean, provider: string }>}
 */
export async function fetchOverviewRecords(filters = {}) {
  const client = getRepositoryClient();

  if (client) {
    try {
      const baseQuery = client
        .from(ANALYTICS_TABLE)
        .select('outcome, duration_ms, input_tokens, output_tokens, total_tokens, token_counts_available');

      const { data, error } = await applyDatabaseFilters(baseQuery, filters);
      if (error) throw new Error(error.message);

      const records = (data || []).map(formatDbToRecord);

      return {
        records,
        isDurable: true,
        provider: PERSISTENCE_PROVIDERS.SUPABASE,
      };
    } catch (err) {
      console.warn('[AnalyticsRepo] Supabase overview query failed, falling back to in-memory:', err.message);
    }
  }

  const fallbackRecords = filterInMemoryRecords(
    defaultUsageStore.getRecent(IN_MEMORY_DEFAULTS.RECENT_QUERY_LIMIT),
    filters
  );

  return {
    records: fallbackRecords,
    isDurable: false,
    provider: PERSISTENCE_PROVIDERS.IN_MEMORY,
  };
}

/**
 * Fetches chronological records for time-series trend analysis.
 *
 * @param {object} [filters={}]
 * @returns {Promise<Array<object>>}
 */
export async function fetchTimeseriesRecords(filters = {}) {
  const client = getRepositoryClient();

  if (client) {
    try {
      const baseQuery = client
        .from(ANALYTICS_TABLE)
        .select('timestamp, outcome, duration_ms, total_tokens, token_counts_available')
        .order('timestamp', { ascending: true });

      const { data, error } = await applyDatabaseFilters(baseQuery, filters);
      if (!error && data) {
        return data.map(formatDbToRecord);
      }
    } catch (err) {
      console.warn('[AnalyticsRepo] Supabase timeseries query failed, falling back to in-memory:', err.message);
    }
  }

  return filterInMemoryRecords(
    defaultUsageStore.getRecent(IN_MEMORY_DEFAULTS.RECENT_QUERY_LIMIT),
    filters
  );
}

/**
 * Fetches dimension values for categorical breakdown distributions.
 *
 * @param {object} [filters={}]
 * @returns {Promise<Array<object>>}
 */
export async function fetchBreakdownRecords(filters = {}) {
  const client = getRepositoryClient();

  if (client) {
    try {
      const baseQuery = client.from(ANALYTICS_TABLE).select('feature, model, operation, outcome');
      const { data, error } = await applyDatabaseFilters(baseQuery, filters);
      if (!error && data) {
        return data;
      }
    } catch (err) {
      console.warn('[AnalyticsRepo] Supabase breakdown query failed, falling back to in-memory:', err.message);
    }
  }

  return filterInMemoryRecords(
    defaultUsageStore.getRecent(IN_MEMORY_DEFAULTS.RECENT_QUERY_LIMIT),
    filters
  );
}

/**
 * Fetches paginated request history records from database or in-memory fallback.
 *
 * @param {object} filters
 * @param {{ offset: number, limit: number }} pagination
 * @returns {Promise<{ records: Array<object>, total: number }>}
 */
export async function fetchHistoryRecords(filters = {}, { offset = 0, limit = 20 } = {}) {
  const client = getRepositoryClient();

  if (client) {
    try {
      const baseQuery = client
        .from(ANALYTICS_TABLE)
        .select('*', { count: 'exact' })
        .order('timestamp', { ascending: false })
        .range(offset, offset + limit - 1);

      const { data, count, error } = await applyDatabaseFilters(baseQuery, filters);
      if (error) throw new Error(error.message);

      return {
        records: (data || []).map(formatDbToRecord),
        total: count || 0,
      };
    } catch (err) {
      console.warn('[AnalyticsRepo] Supabase history query failed, falling back to in-memory:', err.message);
    }
  }

  // In-memory fallback
  const filtered = filterInMemoryRecords(
    defaultUsageStore.getRecent(IN_MEMORY_DEFAULTS.RECENT_QUERY_LIMIT),
    filters
  );
  filtered.sort((a, b) => (b.timestamp > a.timestamp ? 1 : -1));

  return {
    records: filtered.slice(offset, offset + limit),
    total: filtered.length,
  };
}
