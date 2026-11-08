import React from 'react';
import { formatMoney } from '../../shared/utils/formatters.js';
import { ASSISTANT_LABELS } from './expenseAssistantLabels.js';
import { Card, CardHeader, CardTitle } from '../../primitives/cards/index.js';
import { Grid, Inline, Stack } from '../../primitives/layout/index.js';
import { List, ListItem } from '../../primitives/lists/index.js';
import Text from '../../primitives/typography/Text.jsx';

/**
 * Renders get_spending_summary tool results inside the Expense Assistant chat stream.
 */
export default function ToolSpendingSummary({ result }) {
  return (
    <Card as="section" variant="glass" padding="none">
      <CardHeader as="header">
        <Inline justify="between" align="center" fullWidth>
          <CardTitle as="h3">{ASSISTANT_LABELS.SPENDING_SUMMARY_TITLE}</CardTitle>
          <Text variant="secondary" size="xs">{result?.period?.from} → {result?.period?.to}</Text>
        </Inline>
      </CardHeader>
      <Stack gap="md">
        <Grid columns={3} gap="sm">
          <Stack gap="2xs">
            <Text variant="secondary" size="xs">{ASSISTANT_LABELS.TOTAL_INCOME}</Text>
            <Text weight="bold" color="success">{formatMoney(result?.totalIncome || 0)}</Text>
          </Stack>
          <Stack gap="2xs">
            <Text variant="secondary" size="xs">{ASSISTANT_LABELS.TOTAL_EXPENSE}</Text>
            <Text weight="bold" color="error">{formatMoney(result?.totalExpense || 0)}</Text>
          </Stack>
          <Stack gap="2xs">
            <Text variant="secondary" size="xs">{ASSISTANT_LABELS.BALANCE}</Text>
            <Text weight="bold">{formatMoney(result?.balance || 0)}</Text>
          </Stack>
        </Grid>
        <List variant="divided">
          {(result?.topCategories || []).map((item) => (
            <ListItem key={item.category}>
              <Inline justify="between" align="center" fullWidth>
                <Text variant="secondary" size="xs">{item.category}</Text>
                <Text weight="bold">{formatMoney(item.amount)}</Text>
              </Inline>
            </ListItem>
          ))}
        </List>
      </Stack>
    </Card>
  );
}
