import React from 'react';
import { RECEIPT_ACCEPT_ATTR } from '../../shared/transactions/expenseConstants.js';
import Card from '../../primitives/cards/Card.jsx';
import FileInput from '../../primitives/inputs/FileInput.jsx';
import HelperText from '../../primitives/labels/HelperText.jsx';
import Label from '../../primitives/labels/Label.jsx';
import Text from '../../primitives/typography/Text.jsx';

/**
 * File upload prompt card for selecting a receipt image to scan.
 */
export default function ReceiptUploadCard({ onFileChange }) {
  return (
    <Card as="section" variant="outlined" padding="md" aria-label="Upload receipt image">
      <Label htmlFor="upload-receipt">
        <Text weight="semibold">Choose a receipt image</Text>
        <HelperText>JPG, PNG, or WebP · maximum 5 MB</HelperText>
        <FileInput
          id="upload-receipt"
          accept={RECEIPT_ACCEPT_ATTR}
          onChange={onFileChange}
        />
      </Label>
    </Card>
  );
}
