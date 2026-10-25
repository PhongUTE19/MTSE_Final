import React from 'react';
import { UI_LABELS } from '../../../../shared/constants';
import { formatSectionTitle, formatScore } from '../../../../shared/utils/formatters';

/**
 * Renders the supporting sources list for debugging and auditability.
 */
export default function SupportingSources({ sources }) {
  if (!sources || sources.length === 0) return null;

  return (
    <div className="panel-body">
      <h4 className="card-title">{UI_LABELS.ANSWER_SECTION.SUPPORTING_SOURCES}</h4>
      <ul className="card-list">
        {sources.map((src, index) => {
          if (typeof src === 'string') {
            return (
              <li key={index} className="card">
                <span className="badge">[{index + 1}]</span>
                <span>{src}</span>
              </li>
            );
          }

          const displayTitle = formatSectionTitle(src);
          const docName = src.source || UI_LABELS.ANSWER_SECTION.DEFAULT_DOC_NAME;
          const chunkId = src.id;

          return (
            <li key={index} className="card">
              <span className="badge">[{index + 1}]</span>
              <span><strong>{displayTitle}</strong></span>
              <span>({docName}{chunkId ? ` • ${chunkId}` : ''})</span>
              {src.score !== undefined && (
                <span className="badge">
                  {formatScore(src.score)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
