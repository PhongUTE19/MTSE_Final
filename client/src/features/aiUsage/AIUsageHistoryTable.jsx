import React, { useState } from 'react';
import { UI_LABELS } from '../../shared/constants';
import { AI_USAGE_CONFIG } from './aiUsageConstants';
import { validatePagination } from '../../shared/utils';
import AIUsageHistoryRow from './AIUsageHistoryRow.jsx';
import Pagination from '../../composites/navigation/Pagination.jsx';
import SortableHeader from '../../composites/dataDisplay/SortableHeader.jsx';
import { SearchField } from '../../composites/filters/index.js';
import Button from '../../primitives/buttons/Button.jsx';
import EmptyState from '../../composites/dataDisplay/EmptyState.jsx';
import Spinner from '../../primitives/feedback/Spinner.jsx';
import { Card, CardHeader, CardTitle } from '../../primitives/cards/index.js';
import { Inline } from '../../primitives/layout/index.js';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../../primitives/table/index.js';
import Text from '../../primitives/typography/Text.jsx';

const COLUMN_COUNT = 10;
const DESC_DEFAULT_SORT_KEYS = new Set(['timestamp', 'durationMs', 'tokens', 'cost', 'totalAttempts']);

const HISTORY_COLUMNS = [
  { key: 'timestamp', label: UI_LABELS.ANALYTICS.HISTORY.TH_TIMESTAMP, sortable: true },
  { key: 'feature', label: UI_LABELS.ANALYTICS.HISTORY.TH_FEATURE, sortable: true },
  { key: 'model', label: UI_LABELS.ANALYTICS.HISTORY.TH_MODEL, sortable: true },
  { key: 'outcome', label: UI_LABELS.ANALYTICS.HISTORY.TH_OUTCOME, sortable: true },
  { key: 'durationMs', label: UI_LABELS.ANALYTICS.HISTORY.TH_LATENCY, sortable: true },
  { key: 'tokens', label: UI_LABELS.ANALYTICS.HISTORY.TH_TOKENS, sortable: true },
  { key: 'promptVersion', label: UI_LABELS.ANALYTICS.HISTORY.TH_PROMPT_VERSION, sortable: false },
  { key: 'cost', label: UI_LABELS.ANALYTICS.HISTORY.TH_COST, sortable: true },
  { key: 'totalAttempts', label: UI_LABELS.ANALYTICS.HISTORY.TH_ATTEMPTS, sortable: true, align: 'center' },
  { key: 'details', label: UI_LABELS.ANALYTICS.HISTORY.TH_DETAILS, sortable: false },
];

export default function AIUsageHistoryTable({
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

  const isInitialLoad = loading && records.length === 0;
  const isEmpty = !loading && records.length === 0;

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
    let nextDirection = DESC_DEFAULT_SORT_KEYS.has(columnKey) ? 'desc' : 'asc';
    if (currentSortKey === columnKey) {
      nextDirection = currentDirection === 'desc' ? 'asc' : 'desc';
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
    const validLimit = val.isValid && val.limit ? val.limit : AI_USAGE_CONFIG.DEFAULT_PAGE_SIZE;
    onChangeFilters({
      ...filters,
      limit: validLimit,
      page: 1,
    });
  };

  return (
    <Card>
      <CardHeader>
        <Inline justify="between" align="center" fullWidth wrap gap="sm">
          <div>
            <CardTitle as="h3">{UI_LABELS.ANALYTICS.HISTORY.TITLE}</CardTitle>
            <Text variant="secondary">
              {UI_LABELS.ANALYTICS.HISTORY.SUBTITLE}
            </Text>
          </div>
          <SearchField
            value={filters.search || ''}
            onChange={handleSearchChange}
            onClear={handleSearchClear}
            placeholder="Search ID, feature, model, prompt, outcome..."
            ariaLabel="Search request history"
            disabled={isInitialLoad}
          />
        </Inline>
      </CardHeader>

      <Pagination
        page={page}
        limit={limit}
        total={total}
        totalPages={totalPages}
        pageSizeOptions={AI_USAGE_CONFIG.PAGE_SIZE_OPTIONS}
        onPageChange={handlePageChange}
        onLimitChange={handleLimitChange}
        loading={loading}
        showGoToPage={true}
        ariaLabel="Request history pagination"
      />

      <Table variant="compact" responsive>
        <TableHead>
          <TableRow>
            {HISTORY_COLUMNS.map((column) =>
              column.sortable ? (
                <SortableHeader
                  key={column.key}
                  columnKey={column.key}
                  currentSortKey={currentSortKey}
                  currentDirection={currentDirection}
                  onSort={handleSort}
                  align={column.align}
                >
                  {column.label}
                </SortableHeader>
              ) : (
                <TableHeaderCell key={column.key} align={column.align}>
                  {column.label}
                </TableHeaderCell>
              )
            )}
          </TableRow>
        </TableHead>
        <TableBody>
          {isInitialLoad && (
            <TableRow>
              <TableCell colSpan={COLUMN_COUNT}>
                <EmptyState icon={<Spinner size="md" variant="primary" ariaHidden />} message={UI_LABELS.ANALYTICS.HISTORY.LOADING} />
              </TableCell>
            </TableRow>
          )}
          {isEmpty && (
            <TableRow>
              <TableCell colSpan={COLUMN_COUNT}>
                <EmptyState
                  message={
                    filters.search
                      ? `No request history found matching \u201C${filters.search}\u201D.`
                      : UI_LABELS.ANALYTICS.HISTORY.EMPTY_STATE
                  }
                  actions={
                    filters.search ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={handleSearchClear}
                      >
                        Clear search
                      </Button>
                    ) : null
                  }
                />
              </TableCell>
            </TableRow>
          )}
          {records.map((record) => (
            <AIUsageHistoryRow
              key={record.id}
              record={record}
              isExpanded={expandedRowId === record.id}
              onToggle={toggleExpand}
              colSpan={COLUMN_COUNT}
            />
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
