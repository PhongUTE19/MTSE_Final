import React from 'react';
import { TOAST_TYPES, UI_LABELS } from '../constants';

export default function ToastItem({ toast, onDismiss }) {
  const isError = toast.type === TOAST_TYPES.ERROR;

  const getPrefix = () => {
    switch (toast.type) {
      case TOAST_TYPES.SUCCESS:
        return UI_LABELS.COMMON.SUCCESS_PREFIX;
      case TOAST_TYPES.ERROR:
        return UI_LABELS.COMMON.ERROR_PREFIX;
      default:
        return '';
    }
  };

  return (
    <div
      className={`toast toast-${toast.type}`}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
    >
      <div className="toast-content">
        {getPrefix() && <strong>{getPrefix()}</strong>}
        <span>{toast.message}</span>
      </div>
      <button
        type="button"
        className="btn"
        onClick={() => onDismiss(toast.id)}
        aria-label={UI_LABELS.COMMON.DISMISS}
        title={UI_LABELS.COMMON.DISMISS}
      >
        {UI_LABELS.COMMON.CLOSE}
      </button>
    </div>
  );
}
