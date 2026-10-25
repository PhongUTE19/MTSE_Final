import React, { useEffect, useRef } from 'react';
import { DeleteIcon } from './Icons';

/**
 * Reusable, accessible application confirmation dialog popup.
 * Reuses SpendWise UI foundations, button classes, and typography tokens.
 *
 * @param {object} props
 * @param {boolean} props.isOpen
 * @param {string} [props.title='Confirmation']
 * @param {React.ReactNode} props.message
 * @param {string} [props.confirmText='Confirm']
 * @param {string} [props.cancelText='Cancel']
 * @param {'primary'|'danger'} [props.variant='primary']
 * @param {boolean} [props.isLoading=false]
 * @param {() => void} props.onConfirm
 * @param {() => void} props.onCancel
 */
export default function ConfirmDialog({
  isOpen,
  title = 'Confirmation',
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'primary',
  isLoading = false,
  onConfirm,
  onCancel,
}) {
  const dialogRef = useRef(null);
  const confirmButtonRef = useRef(null);
  const cancelButtonRef = useRef(null);

  // Focus management: focus cancel on destructive actions to prevent accidental deletion,
  // or confirm button on standard confirmations.
  useEffect(() => {
    if (!isOpen) return;

    const targetButton = variant === 'danger' ? cancelButtonRef.current : confirmButtonRef.current;
    const fallbackButton = confirmButtonRef.current || cancelButtonRef.current;
    const timer = setTimeout(() => {
      (targetButton || fallbackButton)?.focus();
    }, 50);

    return () => clearTimeout(timer);
  }, [isOpen, variant]);

  // Keyboard interaction (Escape to cancel, Tab focus trapping)
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        if (!isLoading && onCancel) {
          event.preventDefault();
          onCancel();
        }
        return;
      }

      if (event.key === 'Tab' && dialogRef.current) {
        const focusableElements = dialogRef.current.querySelectorAll(
          'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (!focusableElements.length) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (event.shiftKey) {
          if (document.activeElement === firstElement) {
            event.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            event.preventDefault();
            firstElement.focus();
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onCancel]);

  if (!isOpen) return null;

  function handleBackdropClick(event) {
    if (event.target === event.currentTarget && !isLoading && onCancel) {
      onCancel();
    }
  }

  const isDestructive = variant === 'danger';
  const confirmButtonClass = `btn ${isDestructive ? 'btn-danger' : 'btn-primary'} confirm-dialog-btn`;

  return (
    <div
      className="confirm-dialog-backdrop"
      onClick={handleBackdropClick}
      data-testid="confirm-dialog-backdrop"
      role="presentation"
    >
      <div
        ref={dialogRef}
        className={`confirm-dialog card ${isDestructive ? 'confirm-dialog--destructive' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        data-testid="confirm-dialog"
      >
        <div className="confirm-dialog-header card-header split-layout">
          <div className="confirm-dialog-title-group row-layout">
            {isDestructive && (
              <div className="confirm-dialog-icon-badge" aria-hidden="true">
                <DeleteIcon className="confirm-dialog-icon" />
              </div>
            )}
            <div>
              <p className="eyebrow confirm-dialog-eyebrow">
                {isDestructive ? 'DESTRUCTIVE ACTION' : 'CONFIRMATION'}
              </p>
              <h3 id="confirm-dialog-title" className="confirm-dialog-title card-title">
                {title}
              </h3>
            </div>
          </div>
          <button
            type="button"
            className="confirm-dialog-close"
            onClick={onCancel}
            disabled={isLoading}
            aria-label="Close dialog"
          >
            &times;
          </button>
        </div>

        <div id="confirm-dialog-message" className="confirm-dialog-body card-body">
          <p className="confirm-dialog-message-text">{message}</p>
        </div>

        <div className="confirm-dialog-actions modal-actions">
          <button
            ref={cancelButtonRef}
            type="button"
            className="btn btn-secondary confirm-dialog-btn"
            onClick={onCancel}
            disabled={isLoading}
            data-testid="confirm-dialog-cancel"
          >
            {cancelText}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            className={confirmButtonClass}
            onClick={onConfirm}
            disabled={isLoading}
            data-testid="confirm-dialog-confirm"
          >
            {isLoading && <span className="spinner" aria-hidden="true" />}
            <span>{isLoading ? 'Processing…' : confirmText}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
