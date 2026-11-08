import React from 'react';
import {
  describeUnavailablePricing,
  formatUsd,
  resolveTokenCounts,
} from './aiUsageRecordDisplay';
import { Card } from '../../primitives/cards/index.js';
import { Stack } from '../../primitives/layout/index.js';
import { TableRow, TableCell } from '../../primitives/table/index.js';
import { List, ListItem } from '../../primitives/lists/index.js';
import Text from '../../primitives/typography/Text.jsx';

/**
 * Local detail item row in the Request Inspector.
 * Strictly controlled props (label, children) with zero className escape hatch.
 */
function AnalyticsDetailItem({ label, children }) {
  return (
    <div>
      {label && <Text as="strong" size="xs" weight="semibold">{label}:</Text>} {children}
    </div>
  );
}

function TokenUsageDetail({ record }) {
  const tokens = resolveTokenCounts(record);

  if (tokens.source === 'actual') {
    return (
      <span>
        Actual: {tokens.input} in / {tokens.output} out ({tokens.total} total)
      </span>
    );
  }

  if (tokens.source === 'estimated') {
    return (
      <span>
        Estimated: ~{tokens.input} in / ~{tokens.output} out (~{tokens.total} total){' '}
        <Text as="span" variant="caption" color="muted">(Deterministic backfill estimate)</Text>
      </span>
    );
  }

  return <Text as="span" size="xs" color="muted">Unavailable from provider</Text>;
}

function CostDetail({ record }) {
  if (record.estimatedCost == null) {
    return (
      <Text as="span" size="xs" color="muted">
        Pricing unavailable ({describeUnavailablePricing(record).detail})
      </Text>
    );
  }

  const isBackfilled = record.costStatus === 'estimated_backfill';
  return (
    <span>
      {isBackfilled ? '~' : ''}{formatUsd(record.estimatedCost, 6)} USD ({record.cost?.pricingModel || record.model}){' '}
      <Text as="span" variant="caption" color="muted">
        {isBackfilled ? '(Estimated from backfilled tokens)' : '(Calculated from actual tokens)'}
      </Text>
    </span>
  );
}

/**
 * Renders expanded details for a request including tool calls, cost details, and attempt history.
 */
export default function AIUsageHistoryDetailRow({ record, colSpan = 10 }) {
  const hasExplicitPromptVersion =
    record.promptVersion && !/^[a-f0-9]{64}$/i.test(record.promptVersion.trim());

  return (
    <TableRow>
      <TableCell colSpan={colSpan}>
        <Card variant="outlined" padding="sm">
          <Stack gap="2xs">
            {record.toolsExecuted && record.toolsExecuted.length > 0 && (
              <AnalyticsDetailItem label={`Tools Executed (${record.toolsExecuted.length})`}>
                <Text as="span" variant="code" color="highlight">{record.toolsExecuted.join(', ')}</Text>
              </AnalyticsDetailItem>
            )}

            {record.promptId && (
              <AnalyticsDetailItem label="Prompt ID">
                <Text as="span" variant="code">{record.promptId}</Text>
              </AnalyticsDetailItem>
            )}

            <AnalyticsDetailItem label="Prompt Version">
              {hasExplicitPromptVersion ? (
                <Text as="span" variant="code">{record.promptVersion}</Text>
              ) : (
                <Text as="span" size="xs" color="muted">Legacy / unknown</Text>
              )}
            </AnalyticsDetailItem>

            {record.promptHash && (
              <AnalyticsDetailItem label="Prompt Hash (SHA-256)">
                <Text as="span" variant="code">{record.promptHash}</Text>
              </AnalyticsDetailItem>
            )}

            <AnalyticsDetailItem label="Token Usage">
              <TokenUsageDetail record={record} />
            </AnalyticsDetailItem>

            <AnalyticsDetailItem label="Estimated Cost">
              <CostDetail record={record} />
            </AnalyticsDetailItem>

            {record.isRefusal && (
              <AnalyticsDetailItem label="Refusal Reason">
                <span>{record.refusalReason || 'Provider refused prompt'}</span>
              </AnalyticsDetailItem>
            )}

            {record.error && (
              <AnalyticsDetailItem label="Error Message">
                <Text as="span" size="xs" color="error">
                  {record.error.message || String(record.error)}
                </Text>
                {record.error.category && (
                  <Text as="span" variant="caption" color="muted">
                    {' '}(Category: {record.error.category})
                  </Text>
                )}
              </AnalyticsDetailItem>
            )}

            {record.attempts && record.attempts.length > 0 && (
              <Stack gap="2xs">
                <Text variant="body-sm" size="xs" weight="semibold">
                  Attempt History ({record.attempts.length}):
                </Text>
                <List variant="divided" gap="xs">
                  {record.attempts.map((att, i) => (
                    <ListItem key={i}>
                      <Text variant="secondary" size="xs">
                        Attempt #{att.attemptNumber}: {att.status} ({att.durationMs} ms){' '}
                        {att.error ? `— ${att.error.message}` : ''}
                      </Text>
                    </ListItem>
                  ))}
                </List>
              </Stack>
            )}
          </Stack>
        </Card>
      </TableCell>
    </TableRow>
  );
}
