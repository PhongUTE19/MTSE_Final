import React from 'react';
import IconButton from '../../primitives/buttons/IconButton.jsx';
import Inline from '../../primitives/layout/Inline.jsx';
import Text from '../../primitives/typography/Text.jsx';
import { TOAST_TYPES, UI_LABELS } from '../../shared/constants';

const TOAST_BORDER_ACCENTS = {
  [TOAST_TYPES.SUCCESS]: 'border-l-success-accent',
  [TOAST_TYPES.ERROR]: 'border-l-error-accent',
  [TOAST_TYPES.WARNING]: 'border-l-warning-accent',
  [TOAST_TYPES.INFO]: 'border-l-info-accent',
};

export default function ToastItem({ toast, onDismiss }) {
  const isError = toast.type === TOAST_TYPES.ERROR;
  const accentClass = TOAST_BORDER_ACCENTS[toast.type] || 'border-l-info-accent';

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

  const containerClasses = `flex items-start gap-2.5 p-3 px-4 rounded-lg bg-surface border border-border border-l-4 shadow-toast text-sm text-content-primary leading-snug pointer-events-auto animate-toast-in ${accentClass}`.trim();

  return (
    <div
      className={containerClasses}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
    >
      <div className="flex-1 break-words">
        <Inline gap="xs" align="center">
          {getPrefix() && <Text as="strong" weight="bold">{getPrefix()}</Text>}
          <Text as="span">{toast.message}</Text>
        </Inline>
      </div>
      <div className="shrink-0">
        <IconButton
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onDismiss(toast.id)}
          aria-label={UI_LABELS.COMMON.DISMISS}
          title={UI_LABELS.COMMON.DISMISS}
        >
          {UI_LABELS.COMMON.CLOSE}
        </IconButton>
      </div>
    </div>
  );
}
