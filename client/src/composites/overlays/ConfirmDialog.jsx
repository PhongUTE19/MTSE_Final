import React, { useEffect, useRef } from 'react';
import Button from '../../primitives/buttons/Button.jsx';
import IconButton from '../../primitives/buttons/IconButton.jsx';
import { Inline, Stack } from '../../primitives/layout/index.js';
import { CardHeader, CardTitle, CardContent, CardFooter } from '../../primitives/cards/index.js';
import Text from '../../primitives/typography/Text.jsx';
import Badge from '../../primitives/labels/Badge.jsx';
import Icon from '../../primitives/display/Icon.jsx';
import Backdrop from '../../primitives/Backdrop.jsx';
import Modal from './Modal.jsx';
import { pushOverlay, isTopmostOverlay } from '../../shared/utils/overlayStack.js';
import { INITIAL_FOCUS_DELAY_MS } from '../../shared/utils/drawerFocus.js';
import { omitProps } from '../../shared/utils/domProps.js';

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
  ...rest
}) {
  const domProps = omitProps(rest);
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
    }, INITIAL_FOCUS_DELAY_MS);

    return () => clearTimeout(timer);
  }, [isOpen, variant]);

  const overlayRef = useRef(null);
  if (!overlayRef.current) {
    overlayRef.current = { id: 'confirm-dialog', dismissible: !isLoading };
  }
  overlayRef.current.dismissible = !isLoading;

  useEffect(() => {
    if (!isOpen) return undefined;
    return pushOverlay(overlayRef.current);
  }, [isOpen]);

  // Keyboard interaction (Escape to cancel, Tab focus trapping)
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        if (!isTopmostOverlay(overlayRef.current)) return;
        if (!isLoading && onCancel) {
          event.preventDefault();
          event.stopPropagation();
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
        } else if (document.activeElement === lastElement) {
            event.preventDefault();
            firstElement.focus();
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

  return (
    <Backdrop open={true} onDismiss={handleBackdropClick} dismissible={!isLoading}>
      <Modal
        ref={dialogRef}
        size="md"
        variant={isDestructive ? 'danger' : 'default'}
        role="dialog"
        ariaModal={true}
        ariaLabelledby="confirm-dialog-title"
        ariaDescribedby="confirm-dialog-message"
        data-testid="confirm-dialog"
        {...domProps}
      >
        <CardHeader as="header">
          <Inline justify="between" align="start" fullWidth>
            <Inline gap="sm" align="center">
              {isDestructive && (
                <Badge variant="error" size="lg" aria-hidden="true">
                  <Icon name="delete" size="md" />
                </Badge>
              )}
              <Stack gap="2xs">
                <Text variant="eyebrow" color={isDestructive ? 'error' : undefined}>
                  {isDestructive ? 'DESTRUCTIVE ACTION' : 'CONFIRMATION'}
                </Text>
                <CardTitle id="confirm-dialog-title" as="h3">
                  {title}
                </CardTitle>
              </Stack>
            </Inline>
            <IconButton
              type="button"
              variant="ghost"
              onClick={onCancel}
              disabled={isLoading}
              aria-label="Close dialog"
            >
              &times;
            </IconButton>
          </Inline>
        </CardHeader>

        <CardContent id="confirm-dialog-message">
          <Text variant="body">{message}</Text>
        </CardContent>

        <CardFooter>
          <Inline gap="sm" justify="end">
            <Button
              ref={cancelButtonRef}
              type="button"
              variant="secondary"
              onClick={onCancel}
              disabled={isLoading}
              data-testid="confirm-dialog-cancel"
            >
              {cancelText}
            </Button>
            <Button
              ref={confirmButtonRef}
              type="button"
              variant={isDestructive ? 'danger' : 'primary'}
              onClick={onConfirm}
              disabled={isLoading}
              loading={isLoading}
              data-testid="confirm-dialog-confirm"
            >
              {confirmText}
            </Button>
          </Inline>
        </CardFooter>
      </Modal>
    </Backdrop>
  );
}
