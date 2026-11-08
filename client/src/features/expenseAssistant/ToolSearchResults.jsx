import React from 'react';
import { formatMoney } from '../../shared/utils/formatters.js';
import { ASSISTANT_LABELS } from './expenseAssistantLabels.js';
import { Card, CardHeader, CardTitle } from '../../primitives/cards/index.js';
import { Inline, Stack } from '../../primitives/layout/index.js';
import { List, ListItem } from '../../primitives/lists/index.js';
import Text from '../../primitives/typography/Text.jsx';

/**
 * Renders search_transactions tool results inside the Expense Assistant chat stream.
 */
export default function ToolSearchResults({ result }) {
  const transactions = result?.transactions || [];

  return (
    <Card as="section" variant="glass" padding="none">
      <CardHeader as="header">
        <Inline justify="between" align="center" fullWidth>
          <CardTitle as="h3">{ASSISTANT_LABELS.SEARCH_RESULTS_TITLE}</CardTitle>
          <Text variant="secondary" size="xs">{ASSISTANT_LABELS.RESULTS_COUNT(result?.total || 0)}</Text>
        </Inline>
      </CardHeader>
      {!transactions.length ? (
        <Text variant="secondary" color="muted" align="center">
          {ASSISTANT_LABELS.EMPTY_SEARCH}
        </Text>
      ) : (
        <List variant="divided">
          {transactions.map((item) => (
            <ListItem key={item.id}>
              <Inline justify="between" align="center" fullWidth>
                <Stack gap="2xs">
                  <Text weight="bold">{item.merchant}</Text>
                  <Text variant="secondary" size="xs">{item.date} · {item.category}</Text>
                </Stack>
                <Text weight="bold" color={item.type === 'income' ? 'success' : 'error'}>
                  {item.type === 'income' ? '+' : '-'}{formatMoney(item.amount)}
                </Text>
              </Inline>
            </ListItem>
          ))}
        </List>
      )}
    </Card>
  );
}
