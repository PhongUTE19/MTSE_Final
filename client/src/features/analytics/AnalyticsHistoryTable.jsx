import React, { useState } from 'react';
import { UI_LABELS } from '../../shared/constants';
import { ANALYTICS_CONFIG, ANALYTICS_CHART_CONFIG } from './analyticsConstants';
import { validatePagination } from '../../shared/utils';
import { formatTimestamp } from '../../shared/utils/formatters';
import { useSort } from '../../shared/hooks';
import Pagination from '../../shared/components/Pagination';
import SortableHeader from '../../shared/components/SortableHeader';

const historyComparators = {
  tokens: (a, b, dir) => {
    const valA = a?.tokenUsage?.totalTokens ?? -1;
    const valB = b?.tokenUsage?.totalTokens ?? -1;
    return dir === 'desc' ? valB - valA : valA - valB;
  },
  cost: (a, b, dir) => {
    const valA = a?.estimatedCost ?? -1;
    const valB = b?.estimatedCost ?? -1;
    return dir === 'desc' ? valB - valA : valA - valB;
  },
};

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

          {record.promptVersion && (
            <div className="analytics-detail-item">
              <strong>Prompt Version:</strong> <span className="font-mono">{record.promptVersion}</span>
            </div>
          )}

          {record.promptHash && (
            <div className="analytics-detail-item">
              <strong>Prompt Hash (SHA-256):</strong> <span className="font-mono text-break">{record.promptHash}</span>
            </div>
          )}

          <div className="analytics-detail-item">
            <strong>Estimated Cost:</strong>{' '}
            <span>
              {record.estimatedCost != null
                ? `$${record.estimatedCost.toFixed(6)} USD (${record.cost?.pricingModel || record.model})`
                : `Pricing unavailable (${record.costStatus || 'unpriced'})`}
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
  filters,
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

  const { sortKey, sortDirection, toggleSort, applySort } = useSort({
    comparators: historyComparators,
  });

  const sortedRecords = applySort(records);

  const toggleExpand = (id) => {
    setExpandedRowId((prev) => (prev === id ? null : id));
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
      </div>

      {/* Reusable Pagination Component */}
      <Pagination
        page={page}
        limit={limit}
        total={total}
        totalPages={totalPages}
        pageSizeOptions={ANALYTICS_CONFIG.PAGE_SIZE_OPTIONS}
        onPageChange={handlePageChange}
        onLimitChange={handleLimitChange}
        loading={loading}
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
                currentSortKey={sortKey}
                currentDirection={sortDirection}
                onSort={toggleSort}
              >
                {UI_LABELS.ANALYTICS.HISTORY.TH_TIMESTAMP}
              </SortableHeader>
              <SortableHeader
                columnKey="feature"
                currentSortKey={sortKey}
                currentDirection={sortDirection}
                onSort={toggleSort}
              >
                {UI_LABELS.ANALYTICS.HISTORY.TH_FEATURE}
              </SortableHeader>
              <SortableHeader
                columnKey="model"
                currentSortKey={sortKey}
                currentDirection={sortDirection}
                onSort={toggleSort}
              >
                {UI_LABELS.ANALYTICS.HISTORY.TH_MODEL}
              </SortableHeader>
              <SortableHeader
                columnKey="outcome"
                currentSortKey={sortKey}
                currentDirection={sortDirection}
                onSort={toggleSort}
              >
                {UI_LABELS.ANALYTICS.HISTORY.TH_OUTCOME}
              </SortableHeader>
              <SortableHeader
                columnKey="durationMs"
                currentSortKey={sortKey}
                currentDirection={sortDirection}
                onSort={toggleSort}
              >
                {UI_LABELS.ANALYTICS.HISTORY.TH_LATENCY}
              </SortableHeader>
              <SortableHeader
                columnKey="tokens"
                currentSortKey={sortKey}
                currentDirection={sortDirection}
                onSort={toggleSort}
              >
                {UI_LABELS.ANALYTICS.HISTORY.TH_TOKENS}
              </SortableHeader>
              <th>{UI_LABELS.ANALYTICS.HISTORY.TH_PROMPT_VERSION}</th>
              <SortableHeader
                columnKey="cost"
                currentSortKey={sortKey}
                currentDirection={sortDirection}
                onSort={toggleSort}
              >
                {UI_LABELS.ANALYTICS.HISTORY.TH_COST}
              </SortableHeader>
              <SortableHeader
                columnKey="totalAttempts"
                currentSortKey={sortKey}
                currentDirection={sortDirection}
                onSort={toggleSort}
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
                  {UI_LABELS.ANALYTICS.HISTORY.EMPTY_STATE}
                </td>
              </tr>
            ) : (
              sortedRecords.map((rec) => {
                const isExpanded = expandedRowId === rec.id;
                const promptDisplay = rec.promptVersion
                  ? rec.promptVersion
                  : (rec.promptHash ? `${rec.promptHash.slice(0, 8)}…` : '—');
                const hasDetails = rec.outcome === 'failure' || rec.outcome === 'refusal' || rec.error || (rec.toolsExecuted && rec.toolsExecuted.length > 0) || rec.promptId || rec.promptHash;

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
                        {rec.tokenUsage?.tokenCountsAvailable ? (
                          <span>
                            {rec.tokenUsage.inputTokens ?? 0} / {rec.tokenUsage.outputTokens ?? 0}
                            <strong> ({rec.tokenUsage.totalTokens ?? 0})</strong>
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="font-mono" title={rec.promptHash ? `Hash: ${rec.promptHash}` : (rec.promptVersion || '')}>
                        {promptDisplay}
                      </td>
                      <td className="text-nowrap font-mono">
                        {rec.estimatedCost != null ? `$${rec.estimatedCost.toFixed(5)}` : '—'}
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
