import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  INITIAL_TRANSACTION,
  MAX_RECEIPT_SIZE_BYTES,
  RECEIPT_ACCEPT_ATTR,
  RECEIPT_ACCEPTED_TYPES,
} from '../../shared/transactions/expenseConstants.js';
import TransactionFields from '../../composites/transactions/TransactionFields.jsx';
import Alert from '../../composites/feedback/Alert.jsx';
import {
  buildReceiptReviewForm,
  getForeignCurrencyContext,
  validateTransactionData,
} from '../../shared/transactions/transactionFieldsUtils.js';
import { useModalAccessibility } from '../../shared/hooks/useModalAccessibility.js';
import Button from '../../primitives/buttons/Button.jsx';
import IconButton from '../../primitives/buttons/IconButton.jsx';
import FileInput from '../../primitives/inputs/FileInput.jsx';
import Spinner from '../../primitives/feedback/Spinner.jsx';
import { Grid, Inline, Stack } from '../../primitives/layout/index.js';
import { List, ListItem } from '../../primitives/lists/index.js';
import ErrorText from '../../primitives/labels/ErrorText.jsx';
import Text from '../../primitives/typography/Text.jsx';
import { Card, CardHeader, CardTitle, CardFooter } from '../../primitives/cards/index.js';
import Backdrop from '../../primitives/Backdrop.jsx';
import Modal from '../../composites/overlays/Modal.jsx';

/**
 * Unified Add Transaction / Edit Transaction component.
 * - For new transactions: two-column layout with Receipt Image Picker + Scan placeholder (left)
 *   and TransactionFields (right), with automatic draft creation/auto-save on user edits.
 * - For editing existing confirmed transactions: preserves single-column update form.
 */
export default function ManualEntry({
  transaction,
  onSave,
  onFormChange,
  onReceiptFileSelect,
  onClose,
  standalone = false,
}) {
  const [form, setForm] = useState(transaction || INITIAL_TRANSACTION);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState('');
  const [receiptFileName, setReceiptFileName] = useState('');
  const [warnings, setWarnings] = useState([]);
  const [scanNotice, setScanNotice] = useState('');

  const titleId = useId();
  const modalRef = useRef(null);
  const fileInputRef = useRef(null);
  const previewUrlRef = useRef('');

  const isEditing = Boolean(transaction?.id);
  const isModal = Boolean(onClose) && !standalone;
  const saving = submitting || uploadingReceipt;

  useEffect(() => {
    return () => {
      if (previewUrlRef.current && typeof URL !== 'undefined' && URL.revokeObjectURL) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = '';
      }
    };
  }, []);

  const { handleBackdropMouseDown } = useModalAccessibility({
    id: 'manual-entry',
    modalRef,
    onClose,
    enabled: isModal,
    dismissible: !saving,
    initialFocusSelector: 'input, select, textarea',
  });

  const foreignCurrency = useMemo(() => getForeignCurrencyContext(form), [form]);

  function handleFormChange(nextValues) {
    setForm(nextValues);
    setError('');
    if (!isEditing) {
      onFormChange?.(nextValues);
    }
  }

  function handlePickerClick() {
    if (saving) return;
    setScanNotice('');
    fileInputRef.current?.click();
  }

  function handlePickerKeyDown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handlePickerClick();
    }
  }

  function handleScanPlaceholder() {
    if (saving) return;
    setScanNotice('Camera scan is coming soon. Click the image area above to select a receipt image.');
  }

  async function handleReceiptInputChange(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || saving) return;

    if (!RECEIPT_ACCEPTED_TYPES.includes(file.type) || file.size > MAX_RECEIPT_SIZE_BYTES) {
      setError('Upload a JPG, PNG, or WebP file up to 5 MB.');
      return;
    }

    setError('');
    setScanNotice('');

    if (typeof URL !== 'undefined' && URL.createObjectURL) {
      if (previewUrlRef.current && URL.revokeObjectURL) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
      const nextUrl = URL.createObjectURL(file);
      previewUrlRef.current = nextUrl;
      setReceiptPreviewUrl(nextUrl);
    }
    setReceiptFileName(file.name || 'Receipt image');

    if (!onReceiptFileSelect) return;

    setUploadingReceipt(true);
    try {
      const extracted = await onReceiptFileSelect(file, form);
      if (extracted?.extractedFields) {
        const nextForm = buildReceiptReviewForm(extracted.extractedFields);
        setForm(nextForm);
        setWarnings(Array.isArray(extracted.warnings) ? extracted.warnings : []);
      }
    } catch (uploadError) {
      setError(uploadError?.message || 'Receipt extraction could not be completed. You can continue editing manually.');
    } finally {
      setUploadingReceipt(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (saving) return;
    const validation = validateTransactionData(form);
    if (!validation.isValid) {
      setError(validation.error);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onSave({ ...form, merchant: form.merchant.trim(), amount: validation.amount });
      if (onClose) onClose();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  const formFieldsSection = (
    <Stack gap="md">
      {warnings.length > 0 && (
        <Alert variant="warning" role="status" aria-label="Extraction warnings">
          <List variant="bulleted">
            {warnings.map((warning) => (
              <ListItem key={warning}>{warning}</ListItem>
            ))}
          </List>
        </Alert>
      )}

      {foreignCurrency && (
        <Alert variant="warning" role="status">
          <Text>
            Detected currency: {foreignCurrency.currency}
            {foreignCurrency.foreignAmount != null && ` (receipt total ${foreignCurrency.foreignAmount})`}.
            Enter the equivalent amount in VND below; no automatic conversion is applied.
          </Text>
        </Alert>
      )}

      {error && <ErrorText as="p">{error}</ErrorText>}

      <TransactionFields
        values={form}
        onChange={handleFormChange}
        disabled={saving}
        noteRows={3}
      />
    </Stack>
  );

  const pickerSection = (
    <Stack gap="sm">
      <FileInput
        ref={fileInputRef}
        accept={RECEIPT_ACCEPT_ATTR}
        hidden
        aria-label="Receipt image file"
        onChange={handleReceiptInputChange}
      />

      <div
        role="button"
        tabIndex={saving ? -1 : 0}
        aria-label={receiptPreviewUrl ? `Change receipt image (${receiptFileName})` : 'Select receipt image'}
        aria-disabled={saving ? 'true' : undefined}
        onClick={handlePickerClick}
        onKeyDown={handlePickerKeyDown}
        className={
          receiptPreviewUrl
            ? 'rounded-xl border border-border bg-surface-subtle p-3 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors hover:border-border-hover focus-visible:outline-none focus-visible:shadow-focus'
            : 'min-h-56 rounded-xl border-2 border-dashed border-border bg-surface-subtle p-6 flex flex-col items-center justify-center gap-2 text-center cursor-pointer transition-colors hover:bg-surface-muted hover:border-border-hover focus-visible:outline-none focus-visible:shadow-focus'
        }
      >
        {receiptPreviewUrl ? (
          <>
            <img
              src={receiptPreviewUrl}
              alt={receiptFileName || 'Selected receipt preview'}
              className="max-h-72 w-full object-contain rounded-lg"
            />
            <Text variant="caption" truncate>
              {receiptFileName} · Click to replace image
            </Text>
          </>
        ) : (
          <>
            <Text weight="semibold">Click to select receipt image</Text>
            <Text variant="secondary" size="xs">
              JPG, PNG, or WebP · maximum 5 MB
            </Text>
          </>
        )}

        {uploadingReceipt && (
          <Inline gap="xs" align="center">
            <Spinner size="sm" variant="primary" ariaHidden />
            <Text variant="caption">Extracting receipt details…</Text>
          </Inline>
        )}
      </div>

      <Button
        type="button"
        variant="secondary"
        fullWidth
        disabled={saving}
        onClick={handleScanPlaceholder}
      >
        Scan
      </Button>

      {scanNotice && (
        <Alert variant="info" role="status">
          <Text size="xs">{scanNotice}</Text>
        </Alert>
      )}
    </Stack>
  );

  const formContent = (
    <Stack gap="md">
      <CardHeader as="header">
        <Inline justify="between" align="start" fullWidth>
          <Stack gap="2xs">
            <Text variant="eyebrow">{isEditing ? 'EDIT TRANSACTION' : 'ADD TRANSACTION'}</Text>
            <CardTitle as="h2" id={titleId}>
              {isEditing ? 'Edit transaction' : 'Add transaction'}
            </CardTitle>
            <Text variant="secondary" size="xs">
              {isEditing
                ? 'Update confirmed transaction details in your ledger.'
                : 'Select a receipt image or enter details manually. Edits auto-save as a draft.'}
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

      {isEditing ? (
        formFieldsSection
      ) : (
        <Grid columns={2} gap="md" align="start">
          {pickerSection}
          {formFieldsSection}
        </Grid>
      )}

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
          <Button type="submit" variant="primary" disabled={saving} loading={submitting}>
            {isEditing ? 'Update transaction' : 'Confirm transaction'}
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
          size={isEditing ? 'lg' : 'xl'}
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
