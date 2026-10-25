import React from 'react';
import AppSidebar from './AppSidebar';
import './workspaceLayout.css';

/**
 * Shared workspace shell: sidebar + titled main column.
 * `headerAction` fills the right side of the header; `overlays` render
 * outside the main column (modals, floating assistant).
 */
export default function WorkspaceLayout({
  eyebrow,
  title,
  headerAction,
  shellClassName = '',
  sidebarProps,
  overlays,
  children,
}) {
  return (
    <main className={`expense-shell${shellClassName ? ` ${shellClassName}` : ''}`}>
      <AppSidebar {...sidebarProps} />

      <section className="expense-main">
        <header className="expense-header">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
          </div>
          {headerAction}
        </header>

        {children}
      </section>

      {overlays}
    </main>
  );
}
