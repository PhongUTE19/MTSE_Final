import React from 'react';
import { UI_LABELS, UI_UNITS, PAGINATION } from '../../shared/constants';
import { formatFileSize } from '../../shared/utils/formatters';
import { useSearch, useSort, usePagination } from '../../shared/hooks';
import DocumentTableToolbar from './DocumentTableToolbar.jsx';
import SortableHeader from '../../composites/dataDisplay/SortableHeader.jsx';
import Pagination from '../../composites/navigation/Pagination.jsx';
import Button from '../../primitives/buttons/Button.jsx';
import Inline from '../../primitives/layout/Inline.jsx';
import Stack from '../../primitives/layout/Stack.jsx';
import EmptyState from '../../composites/dataDisplay/EmptyState.jsx';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../../primitives/table/index.js';

export default function DocumentTable({
  documents = [],
  viewerLoading = false,
  onView,
  onReindex,
  indexing,
  loading,
}) {
  const { searchQuery, handleSearchChange, clearSearch, applyFilter } = useSearch({
    searchFields: ['filename'],
  });

  const { sortKey, sortDirection, toggleSort, applySort } = useSort({
    defaultKey: 'filename',
    defaultDirection: 'asc',
  });

  const filteredDocs = applyFilter(documents);
  const sortedDocs = applySort(filteredDocs);

  const pagination = usePagination({
    initialPage: 1,
    initialLimit: PAGINATION.DEFAULT_LIMIT,
    total: sortedDocs.length,
  });

  const displayedDocs = pagination.paginate(sortedDocs);

  return (
    <Stack gap="md">
      <DocumentTableToolbar
        hasDocuments={documents.length > 0}
        indexing={indexing}
        loading={loading}
        searchQuery={searchQuery}
        onReindex={onReindex}
        onSearchChange={(val) => {
          handleSearchChange(val);
          pagination.setPage(1);
        }}
        onSearchClear={() => {
          clearSearch();
          pagination.setPage(1);
        }}
      />

      <Pagination
        page={pagination.page}
        limit={pagination.limit}
        total={sortedDocs.length}
        totalPages={pagination.totalPages}
        pageSizeOptions={PAGINATION.OPTIONS}
        onPageChange={pagination.setPage}
        onLimitChange={pagination.setLimit}
        loading={loading}
        ariaLabel="Documents pagination"
      />

      {documents.length === 0 && (
        <EmptyState message={UI_LABELS.DOCUMENT_TABLE.EMPTY_STATE} />
      )}

      {documents.length > 0 && sortedDocs.length === 0 && (
        <EmptyState message={UI_LABELS.DOCUMENT_TABLE.NO_MATCHING_DOCS} />
      )}

      {sortedDocs.length > 0 && (
        <Table variant="default" responsive>
          <TableHead>
            <TableRow>
              <SortableHeader
                columnKey="filename"
                currentSortKey={sortKey}
                currentDirection={sortDirection}
                onSort={toggleSort}
              >
                {UI_LABELS.DOCUMENT_TABLE.TH_FILENAME}
              </SortableHeader>
              <SortableHeader
                columnKey="sectionCount"
                currentSortKey={sortKey}
                currentDirection={sortDirection}
                onSort={toggleSort}
              >
                {UI_LABELS.DOCUMENT_TABLE.TH_SECTIONS}
              </SortableHeader>
              <SortableHeader
                columnKey="size"
                currentSortKey={sortKey}
                currentDirection={sortDirection}
                onSort={toggleSort}
              >
                {UI_LABELS.DOCUMENT_TABLE.TH_SIZE}
              </SortableHeader>
              <SortableHeader
                columnKey="modifiedAt"
                currentSortKey={sortKey}
                currentDirection={sortDirection}
                onSort={toggleSort}
              >
                {UI_LABELS.DOCUMENT_TABLE.TH_LAST_MODIFIED}
              </SortableHeader>
              <TableHeaderCell>{UI_LABELS.DOCUMENT_TABLE.TH_ACTIONS}</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {displayedDocs.map((doc) => (
              <TableRow key={doc.filename}>
                <TableCell truncate title={doc.filename}>{doc.filename}</TableCell>
                <TableCell>{doc.sectionCount} {UI_LABELS.COMMON.CHUNKS}</TableCell>
                <TableCell nowrap>{formatFileSize(doc.size)} {UI_UNITS.KB}</TableCell>
                <TableCell nowrap>{new Date(doc.modifiedAt).toLocaleDateString()}</TableCell>
                <TableCell>
                  <Inline gap="xs">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={viewerLoading}
                      onClick={() => onView?.(doc.filename)}
                    >
                      View
                    </Button>
                  </Inline>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Stack>
  );
}
