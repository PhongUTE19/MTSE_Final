import React from 'react';
import { CardTitle } from '../../primitives/cards/index.js';
import Inline from '../../primitives/layout/Inline.jsx';
import Stack from '../../primitives/layout/Stack.jsx';
import { List, ListItem } from '../../primitives/lists/index.js';
import Text from '../../primitives/typography/Text.jsx';
import { formatMoney } from '../../shared/utils/formatters.js';

/**
 * Extracted line items breakdown section inside TransactionDraftReview.
 */
export default function DraftLineItems({ items }) {
  if (!items || items.length === 0) return null;

  return (
    <section aria-label="Extracted line items">
      <Stack gap="xs">
        <CardTitle as="h3">Extracted items</CardTitle>
        <List variant="divided">
          {items.map((item, index) => (
            <ListItem key={`${item.name}-${index}`}>
              <Inline justify="between" align="center" fullWidth>
                <Text>{item.name}</Text>
                <Text weight="medium">{item.amount == null ? '—' : formatMoney(item.amount)}</Text>
              </Inline>
            </ListItem>
          ))}
        </List>
      </Stack>
    </section>
  );
}
