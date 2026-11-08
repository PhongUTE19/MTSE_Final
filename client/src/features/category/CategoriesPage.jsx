import React from 'react';
import Card from '../../primitives/cards/Card.jsx';
import CardTitle from '../../primitives/cards/CardTitle.jsx';
import Stack from '../../primitives/layout/Stack.jsx';
import Text from '../../primitives/typography/Text.jsx';

export default function CategoriesPage() {
  return (
    <Card variant="glass" padding="lg">
      <Stack gap="xs">
        <CardTitle as="h2">Categories are a secondary flow</CardTitle>
        <Text variant="secondary">
          The final-project core is receipt-to-transaction and transaction CRUD.
          This page stays out of the primary demo flow until the core is validated.
        </Text>
      </Stack>
    </Card>
  );
}
