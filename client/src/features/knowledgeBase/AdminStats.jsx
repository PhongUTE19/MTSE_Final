import React from 'react';
import { UI_LABELS } from '../../shared/constants';

export default function AdminStats({ status, indexing }) {
  return (
    <div className="stats-grid">
      <div className="card flex-container">
        <span className="stat-label">{UI_LABELS.ADMIN_STATS.KNOWLEDGE_FILES}</span>
        <span className="stat-value">{status ? status.documentCount : UI_LABELS.ADMIN_STATS.PLACEHOLDER}</span>
        <span className="stat-sub">{UI_LABELS.ADMIN_STATS.MD_DOCUMENTS}</span>
      </div>
      <div className="card flex-container">
        <span className="stat-label">{UI_LABELS.ADMIN_STATS.FILE_CHUNKS}</span>
        <span className="stat-value">{status ? status.totalFileChunks : UI_LABELS.ADMIN_STATS.PLACEHOLDER}</span>
        <span className="stat-sub">{UI_LABELS.ADMIN_STATS.PARSED_SECTIONS}</span>
      </div>
      <div className="card flex-container">
        <span className="stat-label">{UI_LABELS.ADMIN_STATS.QDRANT_VECTORS}</span>
        <span className="stat-value">{status ? status.indexedChunks : UI_LABELS.ADMIN_STATS.PLACEHOLDER}</span>
        <span className="stat-sub">{UI_LABELS.ADMIN_STATS.VECTOR_POINTS_IN_DB}</span>
      </div>
      <div className="card flex-container">
        <span className="stat-label">{UI_LABELS.ADMIN_STATS.SYNC_STATUS}</span>
        <span
          className={`stat-badge ${status?.isSynced ? 'stat-badge--synced' : 'stat-badge--unsynced'
            }`}
        >
          {indexing
            ? UI_LABELS.ADMIN_STATS.INDEXING_IN_PROGRESS
            : status?.isSynced
              ? UI_LABELS.ADMIN_STATS.IN_SYNC
              : UI_LABELS.ADMIN_STATS.OUT_OF_SYNC}
        </span>
        <span className="stat-sub">
          {status?.lastIndexedAt
            ? `${UI_LABELS.ADMIN_STATS.LAST_INDEXED_PREFIX}${new Date(status.lastIndexedAt).toLocaleTimeString()}`
            : UI_LABELS.ADMIN_STATS.READY_TO_SYNC}
        </span>
      </div>
    </div>
  );
}
