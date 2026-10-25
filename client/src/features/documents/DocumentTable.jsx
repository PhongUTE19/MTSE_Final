import React, { useRef } from 'react';
import { UI_LABELS, FILE_EXTENSIONS, UI_UNITS, PAGINATION } from '../../shared/constants';
import { formatFileSize } from '../../shared/utils/formatters';
import { useSearch, useSort, usePagination } from '../../shared/hooks';
import SearchInput from '../../shared/components/SearchInput';
import SortableHeader from '../../shared/components/SortableHeader';
import Pagination from '../../shared/components/Pagination';


export default function DocumentTable({
  documents = [],
  editorLoading,
  onNew,
  onEdit,
  onDelete,
  onUpload,
  onReindex,
  indexing,
  loading,
}) {
  const fileInputRef = useRef(null);

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

  // Only paginate if total documents exceed default page size, otherwise show all
  const shouldPaginate = sortedDocs.length > pagination.limit;
  const displayedDocs = shouldPaginate ? pagination.paginate(sortedDocs) : sortedDocs;

  return (
    <div>
      <div className="split-layout table-toolbar">
        <div className="row-layout">
          <input
            type="file"
            ref={fileInputRef}
            accept={FILE_EXTENSIONS.MARKDOWN}
            className="hidden-file-input"
            onChange={onUpload}
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => fileInputRef.current?.click()}
            title={UI_LABELS.DOCUMENT_TABLE.UPLOAD_TITLE}
          >
            {UI_LABELS.DOCUMENT_TABLE.UPLOAD_BTN}
          </button>
          <button type="button" className="btn btn-primary" onClick={onNew}>
            {UI_LABELS.DOCUMENT_TABLE.ADD_DOC_BTN}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onReindex}
            disabled={indexing || loading}
          >
            {indexing ? (
              <>
                <span className="spinner"></span> {UI_LABELS.ADMIN_DASHBOARD.INDEXING_BTN}
              </>
            ) : (
              UI_LABELS.ADMIN_DASHBOARD.REINDEX_BTN
            )}
          </button>
        </div>

        {documents.length > 0 && (
          <SearchInput
            value={searchQuery}
            onChange={(val) => {
              handleSearchChange(val);
              pagination.setPage(1);
            }}
            onClear={() => {
              clearSearch();
              pagination.setPage(1);
            }}
            placeholder={UI_LABELS.DOCUMENT_TABLE.SEARCH_PLACEHOLDER}
            ariaLabel={UI_LABELS.DOCUMENT_TABLE.SEARCH_PLACEHOLDER}
          />
        )}
      </div>

      {documents.length === 0 ? (
        <div className="empty-state">{UI_LABELS.DOCUMENT_TABLE.EMPTY_STATE}</div>
      ) : sortedDocs.length === 0 ? (
        <div className="empty-state">{UI_LABELS.DOCUMENT_TABLE.NO_MATCHING_DOCS}</div>
      ) : (
        <>
          {shouldPaginate && (
            <div className="table-pagination-wrapper">
              <Pagination
                page={pagination.page}
                limit={pagination.limit}
                total={sortedDocs.length}
                totalPages={pagination.totalPages}
                pageSizeOptions={PAGINATION.OPTIONS}
                onPageChange={pagination.setPage}
                onLimitChange={pagination.setLimit}
                ariaLabel="Documents pagination"
              />
            </div>
          )}

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
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
                  <th>{UI_LABELS.DOCUMENT_TABLE.TH_ACTIONS}</th>
                </tr>
              </thead>
              <tbody>
                {displayedDocs.map((doc) => (
                  <tr key={doc.filename}>
                    <td>{doc.filename}</td>
                    <td>{doc.sectionCount} {UI_LABELS.COMMON.CHUNKS}</td>
                    <td>{formatFileSize(doc.size)} {UI_UNITS.KB}</td>
                    <td>{new Date(doc.modifiedAt).toLocaleDateString()}</td>
                    <td className="row-layout">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={editorLoading}
                        onClick={() => onEdit(doc.filename)}
                      >
                        {UI_LABELS.COMMON.EDIT}
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => onDelete(doc.filename)}
                      >
                        {UI_LABELS.COMMON.DELETE}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
