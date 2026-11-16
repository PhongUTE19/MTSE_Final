import React from 'react';
import { UI_LABELS } from '../../shared/constants';
import { SearchField } from '../../composites/filters/index.js';
import Button from '../../primitives/buttons/Button.jsx';
import Inline from '../../primitives/layout/Inline.jsx';

/**
 * Action toolbar for read-only Knowledge Base DocumentTable (reindex and search).
 */
export default function DocumentTableToolbar({
  hasDocuments,
  indexing,
  loading,
  searchQuery,
  onReindex,
  onSearchChange,
  onSearchClear,
}) {
  return (
    <Inline justify="between" align="center" gap="sm" fullWidth wrap>
      <Inline gap="xs" align="center" wrap>
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
