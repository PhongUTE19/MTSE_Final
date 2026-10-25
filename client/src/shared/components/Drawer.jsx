import React, { useEffect } from 'react';

/**
 * Reusable slide-out drawer dialog component.
 *
 * Provides backdrop overlay, accessible dialog attributes, header title,
 * and body container.
 *
 * @param {object} props
 * @param {boolean} props.isOpen - Whether drawer is open
 * @param {() => void} props.onClose - Backdrop / close trigger handler
 * @param {string} [props.title] - Accessible drawer title
 * @param {React.RefObject} [props.drawerRef] - Ref passed to aside element for focus management
 * @param {string} [props.id='admin-drawer'] - DOM element ID for dialog and title
 * @param {React.ReactNode} [props.headerActions] - Optional buttons in header
 * @param {React.ReactNode} [props.header] - Optional custom header override
 * @param {string} [props.className=''] - Extra classes for the aside container
 * @param {string} [props.bodyClassName=''] - Extra classes for the drawer body
 * @param {string} [props.backdropClassName=''] - Extra classes for the backdrop
 * @param {boolean} [props.hideBackdrop=false] - Whether to suppress the backdrop overlay
 * @param {string} [props.ariaLabel] - Explicit aria-label if title is omitted
 * @param {React.ReactNode} props.children - Drawer body contents
 */
export default function Drawer({
  isOpen,
  onClose,
  title,
  drawerRef,
  id = 'admin-drawer',
  headerActions,
  header,
  className = '',
  bodyClassName = '',
  backdropClassName = '',
  hideBackdrop = false,
  ariaLabel,
  children,
}) {
  const backdropClasses = `drawer-backdrop ${isOpen ? 'drawer-backdrop--open' : ''} ${backdropClassName}`.trim();
  const drawerClasses = `drawer ${isOpen ? 'drawer--open' : ''} ${className}`.trim();
  const bodyClasses = `drawer-body ${bodyClassName}`.trim();

  useEffect(() => {
    if (!isOpen || !onClose) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <>
      {/* Backdrop */}
      {!hideBackdrop && (
        <div
          className={backdropClasses}
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Slide-out Drawer */}
      <aside
        id={id}
        className={drawerClasses}
        role="dialog"
        aria-modal={!hideBackdrop}
        aria-labelledby={title ? `${id}-title` : undefined}
        aria-label={ariaLabel}
        aria-hidden={!isOpen}
        tabIndex={-1}
        ref={drawerRef}
        onClick={(e) => e.stopPropagation()}
      >
        {header ? (
          header
        ) : (
          <div className="drawer-header">
            <div>
              <h3 id={`${id}-title`} className="drawer-title">
                {title}
              </h3>
            </div>
            {headerActions && <div>{headerActions}</div>}
          </div>
        )}

        <div className={bodyClasses}>
          {children}
        </div>
      </aside>
    </>
  );
}
