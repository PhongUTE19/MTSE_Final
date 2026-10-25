import React from 'react';

/**
 * Reusable slide-out drawer dialog component.
 *
 * Provides backdrop overlay, accessible dialog attributes, header title,
 * and body container.
 *
 * @param {object} props
 * @param {boolean} props.isOpen - Whether drawer is open
 * @param {() => void} props.onClose - Backdrop / close trigger handler
 * @param {string} props.title - Accessible drawer title
 * @param {React.RefObject} [props.drawerRef] - Ref passed to aside element for focus management
 * @param {string} [props.id='admin-drawer'] - DOM element ID for dialog and title
 * @param {React.ReactNode} [props.headerActions] - Optional buttons in header
 * @param {React.ReactNode} props.children - Drawer body contents
 */
export default function Drawer({
  isOpen,
  onClose,
  title,
  drawerRef,
  id = 'admin-drawer',
  headerActions,
  children,
}) {
  return (
    <>
      {/* Backdrop */}
      <div
        className={`drawer-backdrop ${isOpen ? 'drawer-backdrop--open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-out Drawer */}
      <aside
        id={id}
        className={`drawer ${isOpen ? 'drawer--open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-hidden={!isOpen}
        tabIndex={-1}
        ref={drawerRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-header">
          <div>
            <h3 id={`${id}-title`} className="drawer-title">
              {title}
            </h3>
          </div>
          {headerActions && <div>{headerActions}</div>}
        </div>

        <div className="drawer-body">
          {children}
        </div>
      </aside>
    </>
  );
}
