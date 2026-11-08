import React from 'react';
import Logo from '../../primitives/display/Logo.jsx';
import { CardTitle } from '../../primitives/cards/index.js';
import { Grid, Inline, Stack } from '../../primitives/layout/index.js';
import Text from '../../primitives/typography/Text.jsx';

/**
 * Left-hand SpendWise introduction panel displayed on the authentication page.
 */
export default function AuthShowcase() {
  return (
    <section
      className="p-6 max-tablet:p-2 bg-transparent border-0 shadow-none text-content-primary flex flex-col justify-center gap-4 max-tablet:hidden"
      aria-label="Spendwise introduction"
    >
      <Inline gap="sm" align="center">
        <Logo variant="dark" showText text="spendwise" />
      </Inline>
      <Stack gap="md">
        <Text variant="eyebrow">PERSONAL FINANCE, SIMPLIFIED</Text>
        <CardTitle as="h1">Make every money decision feel clearer.</CardTitle>
        <Text variant="secondary">
          One calm workspace for your spending, receipts, and the habits behind them.
        </Text>
        <Grid columns={2} gap="md">
          <Stack gap="2xs">
            <Text weight="bold" size="base">One view</Text>
            <Text variant="secondary" size="xs">for every transaction</Text>
          </Stack>
          <Stack gap="2xs">
            <Text weight="bold" size="base">Thoughtful</Text>
            <Text variant="secondary" size="xs">receipt review</Text>
          </Stack>
        </Grid>
      </Stack>
      <Text variant="caption">Built for deliberate financial habits.</Text>
    </section>
  );
}
