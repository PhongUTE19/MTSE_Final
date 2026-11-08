import { useState, useEffect, useMemo } from 'react';
import Button from '../../primitives/buttons/Button.jsx';
import Inline from '../../primitives/layout/Inline.jsx';
import Grid from '../../primitives/layout/Grid.jsx';
import Stack from '../../primitives/layout/Stack.jsx';
import ErrorText from '../../primitives/labels/ErrorText.jsx';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../../primitives/cards/index.js';
import { List, ListItem } from '../../primitives/lists/index.js';
import Text from '../../primitives/typography/Text.jsx';
import Alert from '../feedback/Alert.jsx';
import TransactionFields from './TransactionFields.jsx';
import DraftReceiptPreview from './DraftReceiptPreview.jsx';
import DraftLineItems from './DraftLineItems.jsx';
import {
  buildReceiptReviewForm,
  getForeignCurrencyContext,
  validateTransactionData,
} from '../../shared/transactions/transactionFieldsUtils.js';

/**
 * Extracts normalized transaction form fields from any draft shape
 * (server transaction_draft row, receipt extraction draft, or assistant proposal).
 */
function extractDraftData(draft) {
  if (!draft) return {};
  return draft.reviewedData || draft.originalData || draft;
}

/**
 * Unified Transaction Draft Review component.
 * Supports controlled/uncontrolled editing, validation, foreign currency warnings,
 * receipt image preview / source notes, extracted line items, and confirm/reject actions.
 */
export default function TransactionDraftReview({
  draft,
  onChange,
  onConfirm,
  onReject,
  busy = false,
  error: externalError = '',
  isConfirming = false,
  isRejecting = false,
  sourceSlot = null,
  previewUrl = null,
  fileName = '',
  fileSize = null,
  title = '',
  subtitle = '',
  stepLabel = '',
  confirmLabel = 'Confirm and save transaction',
  rejectLabel = 'Discard',
}) {
  const extracted = useMemo(() => extractDraftData(draft), [draft]);
  const [form, setForm] = useState(() => buildReceiptReviewForm(extracted));
  const [validationError, setValidationError] = useState('');
  const [internalAction, setInternalAction] = useState('');

  const isSaving = isConfirming || internalAction === 'saving' || (busy && !isRejecting);
  const isDiscarding = isRejecting || internalAction === 'rejecting';
  const isAnyBusy = isSaving || isDiscarding;

  useEffect(() => {
    const next = buildReceiptReviewForm(extractDraftData(draft));
    setForm(next);
    setValidationError('');
    setInternalAction('');
  }, [draft]);

  const activeValues = onChange ? (extractDraftData(draft) || form) : form;

  function handleFieldChange(nextValues) {
    if (onChange) {
      onChange(nextValues);
    } else {
      setForm(nextValues);
    }
    setValidationError('');
  }

  const warnings = useMemo(() => {
    return draft?.warnings || draft?.originalData?.warnings || [];
  }, [draft]);

  const foreignCurrency = useMemo(() => {
    return getForeignCurrencyContext(extracted);
  }, [extracted]);

  async function handleConfirm() {
    if (isAnyBusy) return;

    const validation = validateTransactionData(activeValues, { locale: 'en' });
    if (!validation.isValid) {
      const isMissingForeignAmount = foreignCurrency && !(Number(activeValues?.amount) > 0);
      setValidationError(
        isMissingForeignAmount
          ? `Enter the amount in VND for this ${foreignCurrency.currency} receipt before saving.`
          : validation.error
      );
      return;
    }

    try {
      setInternalAction('saving');
      setValidationError('');
      const payload = {
        ...activeValues,
        amount: validation.amount,
        merchant: (activeValues.merchant || '').trim(),
        items: activeValues.items || [],
      };
      await onConfirm?.(payload);
    } catch (err) {
      setValidationError(err?.message || 'Failed to confirm transaction.');
    } finally {
      setInternalAction('');
    }
  }

  async function handleReject() {
    if (isAnyBusy) return;
    try {
      setInternalAction('rejecting');
      setValidationError('');
      await onReject?.();
    } catch (err) {
      setValidationError(err?.message || 'Failed to reject transaction.');
    } finally {
      setInternalAction('');
    }
  }

  const displayError = externalError || validationError;
  const hasPreviewColumn = Boolean(sourceSlot || previewUrl);
  const resolvedTitle = title || (hasPreviewColumn ? 'Review extracted details' : 'Review transaction proposal');
  const resolvedSubtitle = subtitle || 'AI extraction is a draft. Check every field before saving.';

  return (
    <Card as="section" variant="glass" padding="xl">
      <Stack gap="md">
        <CardHeader as="header">
          <Inline justify="between" align="start" fullWidth>
            <Stack gap="2xs">
              {stepLabel && <Text variant="eyebrow">{stepLabel}</Text>}
              <CardTitle as="h2">{resolvedTitle}</CardTitle>
              {resolvedSubtitle && <Text variant="secondary">{resolvedSubtitle}</Text>}
            </Stack>
            {onReject && (
              <Button
                type="button"
                variant="secondary"
                onClick={handleReject}
                disabled={isAnyBusy}
                loading={isDiscarding}
              >
                {rejectLabel}
              </Button>
            )}
          </Inline>
        </CardHeader>

        {displayError && (
          <ErrorText as="p">
            {displayError}
          </ErrorText>
        )}

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

        <CardContent>
          {hasPreviewColumn ? (
            <Grid columns={2} gap="md">
              {sourceSlot || (
                <DraftReceiptPreview
                  previewUrl={previewUrl}
                  fileName={fileName}
                  fileSize={fileSize}
                />
              )}
              <TransactionFields
                values={activeValues}
                onChange={handleFieldChange}
                disabled={isAnyBusy}
                showType
                labels={{ amount: 'Total amount', merchant: 'Merchant' }}
              />
            </Grid>
          ) : (
            <TransactionFields
              values={activeValues}
              onChange={handleFieldChange}
              disabled={isAnyBusy}
              showType
            />
          )}
        </CardContent>

        <DraftLineItems items={activeValues?.items} />

        <CardFooter as="footer">
          <Inline gap="sm" justify="end" wrap fullWidth>
            {onReject && (
              <Button
                type="button"
                variant="secondary"
                onClick={handleReject}
                disabled={isAnyBusy}
                loading={isDiscarding}
              >
                {rejectLabel}
              </Button>
            )}
            <Button
              type="button"
              variant="primary"
              onClick={handleConfirm}
              disabled={isAnyBusy}
              loading={isSaving}
            >
              {confirmLabel}
            </Button>
          </Inline>
        </CardFooter>
      </Stack>
    </Card>
  );
}
