import React from 'react';
import Card from '../../primitives/cards/Card.jsx';
import CardTitle from '../../primitives/cards/CardTitle.jsx';
import Spinner from '../../primitives/feedback/Spinner.jsx';
import { Inline, Stack } from '../../primitives/layout/index.js';
import Text from '../../primitives/typography/Text.jsx';

/**
 * Status card displayed while uploading and extracting a receipt image with Gemini.
 */
export default function ReceiptProcessingCard({ processingReceipt }) {
  if (!processingReceipt) return null;

  return (
    <Card as="section" variant="outlined" padding="md" role="status" aria-live="polite">
      <Inline gap="md" align="center" justify="between" fullWidth wrap>
        <Inline gap="md" align="center">
          {processingReceipt.previewUrl && (
            <img
              src={processingReceipt.previewUrl}
              alt={`Selected receipt: ${processingReceipt.file?.name || 'Receipt'}`}
              className="w-36 h-36 rounded-md object-cover bg-surface-subtle shrink-0"
            />
          )}
          <Stack gap="2xs">
            <Text variant="eyebrow">PROCESSING RECEIPT</Text>
            <CardTitle as="h3">
              Reading {processingReceipt.file?.name || 'receipt image'}
            </CardTitle>
            <Text variant="secondary">
              Uploading the image and extracting its details with Gemini. Please wait before
              choosing another receipt.
            </Text>
          </Stack>
        </Inline>
        <Spinner size="md" ariaHidden />
      </Inline>
    </Card>
  );
}
