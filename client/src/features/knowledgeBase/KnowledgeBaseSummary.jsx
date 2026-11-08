import React from 'react';
import { UI_LABELS } from '../../shared/constants/index.js';
import { Grid } from '../../primitives/layout/index.js';
import Badge from '../../primitives/labels/Badge.jsx';
import StatCard from '../../composites/dataDisplay/StatCard.jsx';

/**
 * Knowledge Base status cards displaying document count, chunks, vector count, and sync state.
 * Composes Base Grid primitive and StatCard composite components directly without styling wrappers.
 */
export default function KnowledgeBaseStats({ status, indexing, loading = false }) {
  const isLoading = Boolean(loading);
  const isUnavailable = !isLoading && !status;
  const syncLabel = isUnavailable
    ? 'Unavailable'
    : indexing
      ? UI_LABELS.ADMIN_STATS.INDEXING_IN_PROGRESS
      : status?.isSynced
        ? UI_LABELS.ADMIN_STATS.IN_SYNC
        : UI_LABELS.ADMIN_STATS.OUT_OF_SYNC;

  const syncBadge = (
    <Badge variant={isUnavailable ? 'neutral' : status?.isSynced ? 'success' : 'warning'}>
      {syncLabel}
    </Badge>
  );

  return (
    <Grid columns={4} gap="md" as="section" role="region" aria-label="Knowledge base summary">
      <StatCard
        label={UI_LABELS.ADMIN_STATS.KNOWLEDGE_FILES}
        value={status ? status.documentCount : '—'}
        valueColor={isUnavailable ? 'secondary' : 'primary'}
        loading={isLoading}
        sub={UI_LABELS.ADMIN_STATS.MD_DOCUMENTS}
      />
      <StatCard
        label={UI_LABELS.ADMIN_STATS.FILE_CHUNKS}
        value={status ? status.totalFileChunks : '—'}
        valueColor={isUnavailable ? 'secondary' : 'primary'}
        loading={isLoading}
        sub={UI_LABELS.ADMIN_STATS.PARSED_SECTIONS}
      />
      <StatCard
        label={UI_LABELS.ADMIN_STATS.QDRANT_VECTORS}
        value={status ? status.indexedChunks : '—'}
        valueColor={isUnavailable ? 'secondary' : 'primary'}
        loading={isLoading}
        sub={UI_LABELS.ADMIN_STATS.VECTOR_POINTS_IN_DB}
      />
      <StatCard
        label={UI_LABELS.ADMIN_STATS.SYNC_STATUS}
        value=""
        badge={syncBadge}
        loading={isLoading}
        sub={
          status?.lastIndexedAt
            ? `${UI_LABELS.ADMIN_STATS.LAST_INDEXED_PREFIX}${new Date(status.lastIndexedAt).toLocaleTimeString()}`
            : UI_LABELS.ADMIN_STATS.READY_TO_SYNC
        }
      />
    </Grid>
  );
}
