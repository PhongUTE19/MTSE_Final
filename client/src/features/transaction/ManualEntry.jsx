import React, { useId, useRef, useState } from 'react';
import { INITIAL_TRANSACTION } from '../../shared/transactions/expenseConstants.js';
import TransactionFields from '../../composites/transactions/TransactionFields.jsx';
import { validateTransactionData } from '../../shared/transactions/transactionFieldsUtils.js';
import { useModalAccessibility } from '../../shared/hooks/useModalAccessibility.js';
import Button from '../../primitives/buttons/Button.jsx';
import IconButton from '../../primitives/buttons/IconButton.jsx';
import { Inline, Stack } from '../../primitives/layout/index.js';
import ErrorText from '../../primitives/labels/ErrorText.jsx';
import Text from '../../primitives/typography/Text.jsx';
import { Card, CardHeader, CardTitle, CardFooter } from '../../primitives/cards/index.js';
import Backdrop from '../../primitives/Backdrop.jsx';
import Modal from '../../composites/overlays/Modal.jsx';

/**
 * Manual transaction entry component.
 * Provides a dedicated, non-AI form for creating or editing expense/income transactions directly.
 */
export default function ManualEntry({
  transaction,
  onSave,
  onClose,
  standalone = false,
}) {
  const [form, setForm] = useState(transaction || INITIAL_TRANSACTION);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const titleId = useId();
  const modalRef = useRef(null);

  const isModal = Boolean(onClose) && !standalone;

  const { handleBackdropMouseDown } = useModalAccessibility({
    id: 'manual-entry',
    modalRef,
    onClose,
    enabled: isModal,
    dismissible: !saving,
    initialFocusSelector: 'input, select, textarea',
  });

  async function handleSubmit(event) {
    event.preventDefault();
    if (saving) return;
    const validation = validateTransactionData(form);
    if (!validation.isValid) {
      setError(validation.error);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({ ...form, merchant: form.merchant.trim(), amount: validation.amount });
      if (onClose) onClose();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  const isEditing = Boolean(transaction?.id);

  const formContent = (
    <Stack gap="md">
      <CardHeader as="header">
        <Inline justify="between" align="start" fullWidth>
          <Stack gap="2xs">
            <Text variant="eyebrow">MANUAL ENTRY</Text>
            <CardTitle as="h2" id={titleId}>
              {isEditing ? 'Edit transaction' : 'New manual transaction'}
            </CardTitle>
            <Text variant="secondary" size="xs">
              Record transaction directly into ledger without AI extraction.
            </Text>
          </Stack>
          {isModal && (
            <IconButton
              type="button"
              variant="ghost"
              onClick={saving ? undefined : onClose}
              disabled={saving}
              aria-label="Close form"
            >
              ×
            </IconButton>
          )}
        </Inline>
      </CardHeader>

      {error && <ErrorText as="p">{error}</ErrorText>}

      <TransactionFields
        values={form}
        onChange={setForm}
        disabled={saving}
        noteRows={3}
      />

      <CardFooter as="footer">
        <Inline gap="sm" justify="end">
          {onClose && (
            <Button
              type="button"
              variant="secondary"
              onClick={saving ? undefined : onClose}
              disabled={saving}
            >
              Cancel
            </Button>
          )}
          <Button type="submit" variant="primary" disabled={saving} loading={saving}>
            {isEditing ? 'Update transaction' : 'Save transaction'}
          </Button>
        </Inline>
      </CardFooter>
    </Stack>
  );

  if (isModal) {
    return (
      <Backdrop open={true} onDismiss={handleBackdropMouseDown} dismissible={!saving}>
        <Modal
          as="form"
          ref={modalRef}
          size="lg"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onSubmit={handleSubmit}
        >
          {formContent}
        </Modal>
      </Backdrop>
    );
  }

  return (
    <Card as="form" onSubmit={handleSubmit} variant="glass" padding="md">
      {formContent}
    </Card>
  );
}
