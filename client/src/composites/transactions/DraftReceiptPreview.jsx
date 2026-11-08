import React from 'react';
import { Card } from '../../primitives/cards/index.js';
import Stack from '../../primitives/layout/Stack.jsx';
import Text from '../../primitives/typography/Text.jsx';

/**
 * Default receipt image preview card used inside TransactionDraftReview
 * when no custom sourceSlot is provided.
 */
export default function DraftReceiptPreview({ previewUrl, fileName, fileSize }) {
  return (
    <Card variant="default" padding="lg">
      <Stack gap="xs">
        <Text variant="caption">Receipt image</Text>
        {previewUrl && (
          <img
            src={previewUrl}
            alt={fileName ? `Preview of ${fileName}` : 'Receipt preview'}
            className="max-h-96 object-contain w-full rounded-md bg-surface-subtle"
          />
        )}
        {fileName && <Text weight="bold" truncate>{fileName}</Text>}
        {fileSize != null && <Text variant="caption">{Math.round(fileSize / 1024)} KB</Text>}
      </Stack>
    </Card>
  );
}
