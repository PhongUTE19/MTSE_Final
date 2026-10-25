import React, { useState } from 'react';
import { UI_LABELS } from '../../shared/constants';

export default function ChunkCard({ chunk }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="card">
      <div className="card-header split-layout">
        <div className="flex-container">
          <span className="badge">{chunk.id}</span>
          <span className="badge">{chunk.source}</span>
          <h4 className="card-title">{chunk.title}</h4>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? UI_LABELS.COMMON.COLLAPSE : UI_LABELS.COMMON.EXPAND}
        </button>
      </div>
      <div className="card-body">
        <p className={`card-content ${isExpanded ? 'expanded' : ''}`}>
          {chunk.content}
        </p>
      </div>
    </div>
  );
}
