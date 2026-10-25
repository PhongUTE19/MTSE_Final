import React from 'react';
import HealthBadge from './HealthBadge';
import { ToastProvider } from '../context/ToastContext';

/**
 * Shared page shell and header layout for the Student Handbook Assistant.
 * Provides the application container, responsive header, health badge, and toast system.
 *
 * @param {object} props
 * @param {string} props.title - Main header title
 * @param {React.ReactNode} props.subtitle - Descriptive subtitle
 * @param {string} [props.kicker] - Optional category kicker above title
 * @param {React.ReactNode} [props.headerActions] - Slot for navigation or demo controls
 * @param {object} props.health - Backend health state
 * @param {Function} props.onRefreshHealth - Health retry handler
 * @param {React.ReactNode} props.children - Main page body content
 */
export default function HandbookLayout({
  title,
  subtitle,
  kicker,
  headerActions,
  health,
  onRefreshHealth,
  children,
}) {
  return (
    <ToastProvider>
      <div className="app-container">
        <header className="app-header">
          <div className="split-layout">
            <div>
              {kicker && (
                <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1">
                  {kicker}
                </p>
              )}
              <h1 className="app-title">{title}</h1>
              <p className="app-subtitle">{subtitle}</p>
            </div>
            {headerActions && (
              <div className="row-layout">
                {headerActions}
              </div>
            )}
          </div>

          <HealthBadge
            status={health?.status}
            indexedChunks={health?.indexedChunks}
            loading={health?.loading}
            error={health?.error}
            onRetry={onRefreshHealth}
          />
        </header>

        {children}
      </div>
    </ToastProvider>
  );
}
