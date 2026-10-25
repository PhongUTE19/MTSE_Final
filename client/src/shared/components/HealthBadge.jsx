import React from 'react';
import { UI_LABELS } from '../constants';

export default function HealthBadge({ status, indexedChunks, loading, error, onRetry }) {
  if (loading) {
    return (
      <div className="badge badge-warning">
        {UI_LABELS.HEALTH.CHECKING}
      </div>
    );
  }

  if (error) {
    return (
      <div className="badge badge-error">
        <span>{UI_LABELS.HEALTH.OFFLINE}</span>
        {onRetry && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onRetry}
          >
            {UI_LABELS.COMMON.RETRY}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="badge badge-success">
      {UI_LABELS.HEALTH.ONLINE_PREFIX}
    </div>
  );
}
