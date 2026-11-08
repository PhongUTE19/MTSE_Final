import React, { useRef } from 'react';
import { UI_LABELS, FILE_EXTENSIONS } from '../../shared/constants';
import { SearchField } from '../../composites/filters/index.js';
import Button from '../../primitives/buttons/Button.jsx';
import FileInput from '../../primitives/inputs/FileInput.jsx';
import Inline from '../../primitives/layout/Inline.jsx';

/**
 * Action toolbar for Knowledge Base DocumentTable (upload, add, reindex, and search).
 */
export default function DocumentTableToolbar({
  hasDocuments,
  uploading,
  indexing,
  loading,
  searchQuery,
  onUpload,
  onNew,
  onReindex,
  onSearchChange,
  onSearchClear,
}) {
  const fileInputRef = useRef(null);

  return (
    <Inline justify="between" align="center" gap="sm" fullWidth wrap>
      <Inline gap="xs" align="center" wrap>
        <FileInput
          ref={fileInputRef}
          accept={FILE_EXTENSIONS.MARKDOWN}
          hidden
          disabled={uploading || indexing || loading}
          onChange={onUpload}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={() => fileInputRef.current?.click()}
          title={UI_LABELS.DOCUMENT_TABLE.UPLOAD_TITLE}
          disabled={uploading || indexing || loading}
          loading={uploading}
        >
          {UI_LABELS.DOCUMENT_TABLE.UPLOAD_BTN}
        </Button>
        <Button type="button" variant="primary" onClick={onNew} disabled={uploading || indexing}>
          {UI_LABELS.DOCUMENT_TABLE.ADD_DOC_BTN}
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={onReindex}
          disabled={indexing || loading}
          loading={indexing}
        >
          {UI_LABELS.ADMIN_DASHBOARD.REINDEX_BTN}
        </Button>
      </Inline>

      {hasDocuments && (
        <SearchField
          value={searchQuery}
          onChange={onSearchChange}
          onClear={onSearchClear}
          placeholder={UI_LABELS.DOCUMENT_TABLE.SEARCH_PLACEHOLDER}
          ariaLabel={UI_LABELS.DOCUMENT_TABLE.SEARCH_PLACEHOLDER}
        />
      )}
    </Inline>
  );
}
