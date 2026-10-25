import React, { useState } from 'react';
import { ANALYTICS_CONFIG, ANALYTICS_CHART_CONFIG, UI_LABELS } from '../../../constants';
import { validatePagination } from '../../../utils';
import { formatTimestamp } from '../../../utils/formatters';
import { useSort } from '../../../hooks';
import Pagination from '../../common/Pagination';
import SortableHeader from '../../common/SortableHeader';

const historyComparators = {
  tokens: (a, b, dir) => {
    const valA = a?.tokenUsage?.totalTokens ?? -1;
    const valB = b?.tokenUsage?.totalTokens ?? -1;
    return dir === 'desc' ? valB - valA : valA - valB;
  },
};

/**
 * Renders expanded details for a failed, refused, or retried request.
 */
function AnalyticsHistoryDetailRow({ record }) {
  return (
    <tr className="analytics-history-detail-row">
      <td colSpan="9">
        <div className="analytics-history-detail-box">
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
    const validLimit = val.isValid && val.limit ? val.limit : 20;
    onChangeFilters({
      ...filters,
      limit: validLimit,
      page: 1,
    });
  };

  return (
    <div className="panel flex-container" role="region" aria-label="Request history">
      <div className="panel-header">
        <h4 className="panel-title">{UI_LABELS.ANALYTICS.HISTORY.TITLE}</h4>
        <span className="panel-subtitle">
          {UI_LABELS.ANALYTICS.HISTORY.SUBTITLE}
        </span>
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
                <td colSpan="9" className="empty-state">
                  {UI_LABELS.ANALYTICS.HISTORY.LOADING}
                </td>
              </tr>
            ) : records.length === 0 ? (
              <tr>
                <td colSpan="9" className="empty-state">
                  {UI_LABELS.ANALYTICS.HISTORY.EMPTY_STATE}
                </td>
              </tr>
            ) : (
              sortedRecords.map((rec) => {
                const isExpanded = expandedRowId === rec.id;
                const promptHashShort = rec.promptVersion
                  ? rec.promptVersion.slice(0, ANALYTICS_CHART_CONFIG.PROMPT_HASH_DISPLAY_LENGTH)
                  : '—';

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
                      <td className="font-mono" title={rec.promptVersion}>
                        {promptHashShort}
                      </td>
                      <td className="text-center">
                        {rec.totalAttempts || 1}
                      </td>
                      <td>
                        {rec.outcome === 'failure' || rec.outcome === 'refusal' || rec.error ? (
                          <button
                            type="button"
                            className="btn btn-chip"
                            onClick={() => toggleExpand(rec.id)}
                            aria-expanded={isExpanded}
                            aria-label={`Toggle failure details for request ${rec.id}`}
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
