import React from 'react';
import Button from '../../primitives/buttons/Button.jsx';
import Badge from '../../primitives/labels/Badge.jsx';
import ErrorText from '../../primitives/labels/ErrorText.jsx';
import Text from '../../primitives/typography/Text.jsx';
import { Inline, Stack } from '../../primitives/layout/index.js';
import { Card } from '../../primitives/cards/index.js';

/**
 * Linked receipt attachment section inside TransactionDetails.
 * Displays receipt status, preview trigger, error feedback, and image preview.
 */
export default function TransactionReceiptSection({
  linkedReceipt,
  previewLoading,
  previewUrl,
  previewError,
  onPreviewReceipt,
}) {
  return (
    <Stack gap="xs">
      <Text variant="eyebrow">RECEIPT ATTACHMENT</Text>
      {linkedReceipt ? (
        <Card variant="subtle" padding="sm">
          <Stack gap="xs">
            <Inline justify="between" align="center" fullWidth>
              <Inline gap="xs" align="center">
                <Text weight="medium">Linked Receipt</Text>
                <Badge size="sm" pill>
                  {linkedReceipt.status}
                </Badge>
              </Inline>
              {onPreviewReceipt && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => onPreviewReceipt(linkedReceipt.id)}
                  disabled={previewLoading}
                  loading={previewLoading}
                >
                  View receipt
                </Button>
              )}
            </Inline>

            {previewError && <ErrorText as="p">{previewError}</ErrorText>}

            {previewUrl && (
              <div className="mt-2 rounded-lg overflow-hidden border border-border bg-surface-subtle p-2">
                <img
                  src={previewUrl}
                  alt="Receipt preview"
                  className="max-h-72 w-auto object-contain mx-auto rounded"
                />
              </div>
            )}
          </Stack>
        </Card>
      ) : (
        <Text variant="secondary" size="sm">
          No receipt linked. This transaction was recorded manually.
        </Text>
      )}
    </Stack>
  );
}
