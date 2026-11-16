import React, { useEffect, useId, useRef, useState } from 'react';
import { formatMoney } from '../../shared/utils/formatters.js';
import { transactionApi } from './transactionApi.js';
import { useModalAccessibility } from '../../shared/hooks/useModalAccessibility.js';
import TransactionReceiptSection from './TransactionReceiptSection.jsx';
import Button from '../../primitives/buttons/Button.jsx';
import IconButton from '../../primitives/buttons/IconButton.jsx';
import Badge from '../../primitives/labels/Badge.jsx';
import ErrorText from '../../primitives/labels/ErrorText.jsx';
import Text from '../../primitives/typography/Text.jsx';
import Spinner from '../../primitives/feedback/Spinner.jsx';
import { Inline, Stack, Divider } from '../../primitives/layout/index.js';
import { Card, CardHeader, CardTitle, CardFooter } from '../../primitives/cards/index.js';
import Backdrop from '../../primitives/Backdrop.jsx';
import Modal from '../../composites/overlays/Modal.jsx';

/**
 * TransactionDetails modal inspection dialog.
 * Displays full transaction fields, itemized breakdown, and linked receipt summary with preview access.
 */
export default function TransactionDetails({
  transaction,
  onClose,
  onEdit,
  onDelete,
  onPreviewReceipt,
}) {
  const [detail, setDetail] = useState(transaction);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewError, setPreviewError] = useState('');

  const titleId = useId();
  const modalRef = useRef(null);

  const { handleBackdropMouseDown } = useModalAccessibility({
    id: 'transaction-details',
    modalRef,
    onClose,
    initialFocusSelector: 'button',
  });

  useEffect(() => {
    let active = true;
    if (!transaction?.id) return;

    setLoading(true);
    setError('');
    transactionApi
      .get(transaction.id)
      .then((res) => {
        if (active && res?.transaction) {
          setDetail(res.transaction);
        }
      })
      .catch((err) => {
        if (active) setError(err.message || 'Failed to load transaction details.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [transaction?.id]);

  async function handlePreviewReceiptClick(receiptId) {
    if (!onPreviewReceipt) return;
    setPreviewLoading(true);
    setPreviewError('');
    try {
      const result = await onPreviewReceipt(receiptId);
      if (result?.url) {
        setPreviewUrl(result.url);
      }
    } catch (err) {
      setPreviewError(err.message || 'Failed to load receipt preview.');
    } finally {
      setPreviewLoading(false);
    }
  }

  const current = detail || transaction;
  const isIncome = current?.type === 'income';
  const hasItems = Array.isArray(current?.items) && current.items.length > 0;

  return (
    <Backdrop open={true} onDismiss={handleBackdropMouseDown} dismissible={true}>
      <Modal
        ref={modalRef}
        size="lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <Stack gap="md">
          <CardHeader as="header">
            <Inline justify="between" align="start" fullWidth>
              <Stack gap="2xs">
                <Text variant="eyebrow">TRANSACTION DETAILS</Text>
                <CardTitle as="h2" id={titleId}>
                  {current?.merchant || 'Transaction'}
                </CardTitle>
              </Stack>
              <IconButton
                type="button"
                variant="ghost"
                onClick={onClose}
                aria-label="Close details"
              >
                ×
              </IconButton>
            </Inline>
          </CardHeader>

          {error && <ErrorText as="p">{error}</ErrorText>}

          {loading ? (
            <Inline justify="center" align="center" gap="sm">
              <Spinner size="md" variant="primary" ariaHidden />
              <Text variant="secondary">Loading details…</Text>
            </Inline>
          ) : (
            <Stack gap="md">
              <Card variant="subtle" padding="md">
                <Inline justify="between" align="center" fullWidth>
                  <Stack gap="2xs">
                    <Text variant="caption" color="secondary">Amount</Text>
                    <Text size="2xl" weight="bold">
                      {isIncome ? '+' : '-'}
                      {formatMoney(current?.amount || 0)}
                    </Text>
                  </Stack>
                  <Inline gap="xs" align="center">
                    <Badge variant={isIncome ? 'success' : 'neutral'} pill>
                      {current?.type}
                    </Badge>
                    <Badge pill>{current?.category}</Badge>
                  </Inline>
                </Inline>
              </Card>

              <Stack gap="xs">
                <Inline justify="between" align="center">
                  <Text variant="caption" color="secondary">Transaction Date</Text>
                  <Text weight="medium">{current?.date}</Text>
                </Inline>
                {current?.note && (
                  <Stack gap="2xs">
                    <Text variant="caption" color="secondary">Note</Text>
                    <Text>{current.note}</Text>
                  </Stack>
                )}
              </Stack>

              {hasItems && (
                <Stack gap="xs">
                  <Divider />
                  <Text variant="eyebrow">ITEMIZED ITEMS</Text>
                  <Stack gap="2xs">
                    {current.items.map((item, index) => (
                      <Inline key={index} justify="between" align="center">
                        <Text>{item.name}</Text>
                        <Text weight="medium">{formatMoney(item.amount)}</Text>
                      </Inline>
                    ))}
                  </Stack>
                </Stack>
              )}

              <Divider />
              <TransactionReceiptSection
                linkedReceipt={current?.receipt}
                previewLoading={previewLoading}
                previewUrl={previewUrl}
                previewError={previewError}
                onPreviewReceipt={onPreviewReceipt ? handlePreviewReceiptClick : undefined}
              />
            </Stack>
          )}

          <CardFooter as="footer">
            <Inline gap="sm" justify="between" fullWidth>
              <Inline gap="sm">
                {onDelete && (
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      onClose();
                      onDelete(current);
                    }}
                  >
                    Delete
                  </Button>
                )}
                {onEdit && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      onClose();
                      onEdit(current);
                    }}
                  >
                    Edit
                  </Button>
                )}
              </Inline>
              <Button type="button" variant="primary" size="sm" onClick={onClose}>
                Close
              </Button>
            </Inline>
          </CardFooter>
        </Stack>
      </Modal>
    </Backdrop>
  );
}
