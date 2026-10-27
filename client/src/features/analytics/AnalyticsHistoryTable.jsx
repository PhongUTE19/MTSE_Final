import React, { useState } from 'react';
import { UI_LABELS } from '../../shared/constants';
import { ANALYTICS_CONFIG } from './analyticsConstants';
import { validatePagination } from '../../shared/utils';
import { formatTimestamp } from '../../shared/utils/formatters';
import Pagination from '../../shared/components/Pagination';
import SortableHeader from '../../shared/components/SortableHeader';
import SearchInput from '../../shared/components/SearchInput';

/**
 * Renders expanded details for a request including tool calls, cost details, and attempt history.
 */
function AnalyticsHistoryDetailRow({ record }) {
  return (
    <tr className="analytics-history-detail-row">
      <td colSpan="10">
        <div className="analytics-history-detail-box">
          {record.toolsExecuted && record.toolsExecuted.length > 0 && (
            <div className="analytics-detail-item">
              <strong>Tools Executed ({record.toolsExecuted.length}):</strong>{' '}
              <span className="font-mono text-highlight">{record.toolsExecuted.join(', ')}</span>
            </div>
          )}

          {record.promptId && (
            <div className="analytics-detail-item">
              <strong>Prompt ID:</strong> <span className="font-mono">{record.promptId}</span>
            </div>
          )}

          <div className="analytics-detail-item">
            <strong>Prompt Version:</strong>{' '}
            {record.promptVersion && !/^[a-f0-9]{64}$/i.test(record.promptVersion.trim()) ? (
              <span className="font-mono">{record.promptVersion}</span>
            ) : (
              <span className="text-muted">Legacy / unknown</span>
            )}
          </div>

          {record.promptHash && (
            <div className="analytics-detail-item">
              <strong>Prompt Hash (SHA-256):</strong> <span className="font-mono text-break">{record.promptHash}</span>
            </div>
          )}

          <div className="analytics-detail-item">
            <strong>Token Usage:</strong>{' '}
            {record.tokenUsage?.tokenCountsAvailable && record.tokenUsage?.inputTokens != null ? (
              <span>
                Actual: {record.tokenUsage.inputTokens} in / {record.tokenUsage.outputTokens != null ? record.tokenUsage.outputTokens : '—'} out ({record.tokenUsage.totalTokens != null ? record.tokenUsage.totalTokens : '—'} total)
              </span>
            ) : (record.estimatedTokens || record.estimatedTotalTokens != null) ? (
              <span>
                Estimated: ~{record.estimatedTokens?.effectiveInputTokens ?? record.estimatedInputTokens ?? '—'} in / ~{record.estimatedTokens?.effectiveOutputTokens ?? record.estimatedOutputTokens ?? '—'} out (~{record.estimatedTokens?.effectiveTotalTokens ?? record.estimatedTotalTokens ?? '—'} total){' '}
                <span className="analytics-detail-category">(Deterministic backfill estimate)</span>
              </span>
            ) : (
              <span className="text-muted">Unavailable from provider</span>
            )}
          </div>

          <div className="analytics-detail-item">
            <strong>Estimated Cost:</strong>{' '}
            <span>
              {record.estimatedCost != null ? (
                record.costStatus === 'estimated_backfill' ? (
                  <span>
                    ~${record.estimatedCost.toFixed(6)} USD ({record.cost?.pricingModel || record.model}){' '}
                    <span className="analytics-detail-category">(Estimated from backfilled tokens)</span>
                  </span>
                ) : (
                  <span>
                    ${record.estimatedCost.toFixed(6)} USD (${record.cost?.pricingModel || record.model}){' '}
                    <span className="analytics-detail-category">(Calculated from actual tokens)</span>
                  </span>
                )
              ) : (
                <span className="text-muted">
                  Pricing unavailable ({
                    record.costStatus === 'missing_tokens'
                      ? 'missing token counts'
                      : record.costStatus === 'unknown_pricing'
                        ? `unverified model pricing for ${record.model || 'unknown'}`
                        : 'legacy unpriced request'
                  })
                </span>
              )}
            </span>
          </div>

          {record.isRefusal && (
            <div className="analytics-detail-item">
              <strong>Refusal Reason:</strong>{' '}
              <span>{record.refusalReason || 'Provider refused prompt'}</span>
            </div>
          )}

          {record.error && (
            <div className="analytics-detail-item">
              <strong>Error Message:</strong>{' '}
              <span className="text-error">
                {record.error.message || String(record.error)}
              </span>
              {record.error.category && (
                <span className="analytics-detail-category">
                  (Category: {record.error.category})
                </span>
              )}
            </div>
          )}

          {record.attempts && record.attempts.length > 0 && (
            <div>
              <strong>Attempt History ({record.attempts.length}):</strong>
              <ul className="analytics-attempts-list">
                {record.attempts.map((att, i) => (
                  <li key={i}>
                    Attempt #{att.attemptNumber}: {att.status} ({att.durationMs} ms){' '}
                    {att.error ? `— ${att.error.message}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

export default function AnalyticsHistoryTable({
  historyData,
  filters = {},
  onChangeFilters,
  loading = false,
}) {
  const [expandedRowId, setExpandedRowId] = useState(null);

  const {
    records = [],
    page = 1,
    limit = 20,
    total = 0,
    totalPages = 1,
  } = historyData || {};

  const currentSortKey = filters.sortBy || 'timestamp';
  const currentDirection = filters.sortOrder || 'desc';

  const toggleExpand = (id) => {
    setExpandedRowId((prev) => (prev === id ? null : id));
  };

  const handleSearchChange = (val) => {
    onChangeFilters({
      ...filters,
      search: val,
      page: 1,
    });
  };

  const handleSearchClear = () => {
    onChangeFilters({
      ...filters,
      search: '',
      page: 1,
    });
  };

  const handleSort = (columnKey) => {
    let nextDirection = 'desc';
    if (currentSortKey === columnKey) {
      nextDirection = currentDirection === 'desc' ? 'asc' : 'desc';
    } else {
      nextDirection = ['timestamp', 'durationMs', 'tokens', 'cost', 'totalAttempts'].includes(columnKey)
        ? 'desc'
        : 'asc';
    }
    onChangeFilters({
      ...filters,
      sortBy: columnKey,
      sortOrder: nextDirection,
      page: 1,
    });
  };

  const handlePageChange = (newPage) => {
    const val = validatePagination(newPage, limit);
    const validPage = val.isValid && val.page ? val.page : 1;
    onChangeFilters({
      ...filters,
      page: Math.max(1, Math.min(validPage, totalPages)),
    });
  };

  const handleLimitChange = (newLimit) => {
    const val = validatePagination(1, newLimit);
    const validLimit = val.isValid && val.limit ? val.limit : ANALYTICS_CONFIG.DEFAULT_LIMIT;
    onChangeFilters({
      ...filters,
      limit: validLimit,
      page: 1,
    });
  };

  return (
    <div className="card analytics-history-card">
      <div className="analytics-history-header">
        <div>
          <h3>{UI_LABELS.ANALYTICS.HISTORY.TITLE}</h3>
          <p className="section-description">
            {UI_LABELS.ANALYTICS.HISTORY.SUBTITLE}
          </p>
        </div>
        <div className="table-search-box">
          <SearchInput
            value={filters.search || ''}
            onChange={handleSearchChange}
            onClear={handleSearchClear}
            placeholder="Search ID, feature, model, prompt, outcome..."
            ariaLabel="Search request history"
            disabled={loading && records.length === 0}
          />
        </div>
      </div>

      {/* Reusable Pagination Component with Direct Page Jump */}
      <Pagination
        page={page}
        limit={limit}
        total={total}
        totalPages={totalPages}
        pageSizeOptions={ANALYTICS_CONFIG.PAGE_SIZE_OPTIONS}
        onPageChange={handlePageChange}
        onLimitChange={handleLimitChange}
        loading={loading}
        showGoToPage={true}
        showingLabel={(from, to, tot) => (
          <span>
            {UI_LABELS.COMMON.SHOWING} <strong>{from}–{to}</strong>{' '}
            {UI_LABELS.COMMON.OF} <strong>{tot}</strong> records
          </span>
        )}
        ariaLabel="Request history pagination"
      />
      <div className="table-responsive table-responsive--bordered">
        <table className="data-table data-table--compact">
          <thead>
            <tr>
              <SortableHeader
                columnKey="timestamp"
                currentSortKey={currentSortKey}
                currentDirection={currentDirection}
                onSort={handleSort}
              >
                {UI_LABELS.ANALYTICS.HISTORY.TH_TIMESTAMP}
              </SortableHeader>
              <SortableHeader
                columnKey="feature"
                currentSortKey={currentSortKey}
                currentDirection={currentDirection}
                onSort={handleSort}
              >
                {UI_LABELS.ANALYTICS.HISTORY.TH_FEATURE}
              </SortableHeader>
              <SortableHeader
                columnKey="model"
                currentSortKey={currentSortKey}
                currentDirection={currentDirection}
                onSort={handleSort}
              >
                {UI_LABELS.ANALYTICS.HISTORY.TH_MODEL}
              </SortableHeader>
              <SortableHeader
                columnKey="outcome"
                currentSortKey={currentSortKey}
                currentDirection={currentDirection}
                onSort={handleSort}
              >
                {UI_LABELS.ANALYTICS.HISTORY.TH_OUTCOME}
              </SortableHeader>
              <SortableHeader
                columnKey="durationMs"
                currentSortKey={currentSortKey}
                currentDirection={currentDirection}
                onSort={handleSort}
              >
                {UI_LABELS.ANALYTICS.HISTORY.TH_LATENCY}
              </SortableHeader>
              <SortableHeader
                columnKey="tokens"
                currentSortKey={currentSortKey}
                currentDirection={currentDirection}
                onSort={handleSort}
              >
                {UI_LABELS.ANALYTICS.HISTORY.TH_TOKENS}
              </SortableHeader>
              <th>{UI_LABELS.ANALYTICS.HISTORY.TH_PROMPT_VERSION}</th>
              <SortableHeader
                columnKey="cost"
                currentSortKey={currentSortKey}
                currentDirection={currentDirection}
                onSort={handleSort}
              >
                {UI_LABELS.ANALYTICS.HISTORY.TH_COST}
              </SortableHeader>
              <SortableHeader
                columnKey="totalAttempts"
                currentSortKey={currentSortKey}
                currentDirection={currentDirection}
                onSort={handleSort}
              >
                {UI_LABELS.ANALYTICS.HISTORY.TH_ATTEMPTS}
              </SortableHeader>
              <th>{UI_LABELS.ANALYTICS.HISTORY.TH_DETAILS}</th>
            </tr>
          </thead>
          <tbody>
            {loading && records.length === 0 ? (
              <tr>
                <td colSpan="10" className="empty-state">
                  {UI_LABELS.ANALYTICS.HISTORY.LOADING}
                </td>
              </tr>
            ) : records.length === 0 ? (
              <tr>
                <td colSpan="10" className="empty-state">
                  {filters.search ? (
                    <div className="analytics-empty-search">
                      <p>No request history found matching &ldquo;{filters.search}&rdquo;.</p>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={handleSearchClear}
                        style={{ marginTop: '8px' }}
                      >
                        Clear search
                      </button>
                    </div>
                  ) : (
                    UI_LABELS.ANALYTICS.HISTORY.EMPTY_STATE
                  )}
                </td>
              </tr>
            ) : (
              records.map((rec) => {
                const isExpanded = expandedRowId === rec.id;
                const isPureHash = rec.promptVersion && /^[a-f0-9]{64}$/i.test(rec.promptVersion.trim());
                const hasExplicitVersion = Boolean(rec.promptVersion && !isPureHash);
                const hasDetails = rec.outcome === 'failure' ||
                  rec.outcome === 'refusal' ||
                  Boolean(rec.error) ||
                  Boolean(rec.toolsExecuted && rec.toolsExecuted.length > 0) ||
                  Boolean(rec.promptId) ||
                  Boolean(rec.promptHash) ||
                  rec.costStatus === 'estimated_backfill' ||
                  Boolean(rec.estimatedTokens) ||
                  rec.estimatedCost == null;

                return (
                  <React.Fragment key={rec.id}>
                    <tr>
                      <td className="text-nowrap">
                        {formatTimestamp(rec.timestamp)}
                      </td>
                      <td>
                        <span className="badge">{rec.feature}</span>
                        {rec.operation && rec.operation !== rec.feature && (
                          <small className="table-subtext">
                            {rec.operation}
                          </small>
                        )}
                      </td>
                      <td className="text-truncate" title={rec.model}>
                        {rec.model || '—'}
                      </td>
                      <td>
                        <span className={`badge badge-pill ${rec.outcome === 'success'
                          ? 'badge-success'
                          : rec.outcome === 'failure'
                            ? 'badge-error'
                            : 'badge-warning'
                          }`}>
                          {rec.outcome}
                        </span>
                      </td>
                      <td className="text-nowrap">
                        {rec.durationMs != null ? `${rec.durationMs} ms` : '—'}
                      </td>
                      <td className="text-nowrap">
                        {rec.tokenUsage?.tokenCountsAvailable && rec.tokenUsage?.inputTokens != null ? (
                          <span>
                            {rec.tokenUsage.inputTokens} / {rec.tokenUsage.outputTokens != null ? rec.tokenUsage.outputTokens : '—'}
                            <strong> ({rec.tokenUsage.totalTokens != null ? rec.tokenUsage.totalTokens : '—'})</strong>
                          </span>
                        ) : (rec.estimatedTokens || rec.estimatedTotalTokens != null) ? (
                          <span title="Estimated tokens derived deterministically from request context">
                            {rec.estimatedTokens?.effectiveInputTokens ?? rec.estimatedInputTokens ?? '—'} /{' '}
                            {rec.estimatedTokens?.effectiveOutputTokens ?? rec.estimatedOutputTokens ?? '—'}
                            <strong> ({rec.estimatedTokens?.effectiveTotalTokens ?? rec.estimatedTotalTokens ?? '—'})</strong>
                            <small className="table-subtext" style={{ display: 'block', color: 'var(--color-warning)' }}>
                              ~Est
                            </small>
                          </span>
                        ) : (
                          <span className="text-muted" title="Token counts unavailable from provider">—</span>
                        )}
                      </td>
                      <td
                        className="font-mono"
                        title={rec.promptHash ? `Hash: ${rec.promptHash}` : (hasExplicitVersion ? `Version: ${rec.promptVersion}` : undefined)}
                      >
                        {hasExplicitVersion ? (
                          rec.promptVersion
                        ) : (
                          <span className="text-muted">Legacy / unknown</span>
                        )}
                      </td>
                      <td className="text-nowrap font-mono">
                        {rec.estimatedCost != null ? (
                          rec.costStatus === 'estimated_backfill' ? (
                            <span title={`Estimated cost based on deterministic token estimates (~$${rec.estimatedCost.toFixed(6)} USD)`}>
                              ${rec.estimatedCost.toFixed(5)}
                              <small className="table-subtext" style={{ display: 'block', color: 'var(--color-warning)' }}>
                                ~Est
                              </small>
                            </span>
                          ) : (
                            `$${rec.estimatedCost.toFixed(5)}`
                          )
                        ) : (
                          <span
                            className="text-muted"
                            title={
                              rec.costStatus === 'missing_tokens'
                                ? 'Pricing unavailable: token counts missing'
                                : rec.costStatus === 'unknown_pricing'
                                  ? 'Pricing unavailable: unverified model pricing'
                                  : 'Pricing unavailable: legacy unpriced request'
                            }
                          >
                            —
                          </span>
                        )}
                      </td>
                      <td className="text-center">
                        {rec.totalAttempts || 1}
                      </td>
                      <td>
                        {hasDetails ? (
                          <button
                            type="button"
                            className="btn btn-chip"
                            onClick={() => toggleExpand(rec.id)}
                            aria-expanded={isExpanded}
                            aria-label={`Toggle details for request ${rec.id}`}
                          >
                            {isExpanded ? UI_LABELS.COMMON.COLLAPSE : UI_LABELS.COMMON.EXPAND}
                          </button>
                        ) : (
                          <span className="text-muted">
                            —
                          </span>
                        )}
                      </td>
                    </tr>

                    {isExpanded && <AnalyticsHistoryDetailRow record={rec} />}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
