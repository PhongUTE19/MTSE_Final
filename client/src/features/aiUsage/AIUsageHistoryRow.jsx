import React from 'react';
import { UI_LABELS } from '../../shared/constants';
import { formatTimestamp } from '../../shared/utils/formatters';
import {
  MISSING_VALUE,
  describeUnavailablePricing,
  formatUsd,
  getExplicitPromptVersion,
  resolveTokenCounts,
} from './aiUsageRecordDisplay';
import AIUsageHistoryDetailRow from './AIUsageHistoryDetailRow.jsx';
import Button from '../../primitives/buttons/Button.jsx';
import Badge from '../../primitives/labels/Badge.jsx';
import { Stack } from '../../primitives/layout/index.js';
import { TableRow, TableCell } from '../../primitives/table/index.js';
import Text from '../../primitives/typography/Text.jsx';

const OUTCOME_BADGE_VARIANTS = Object.freeze({ success: 'success', failure: 'error' });

function hasExpandableDetails(record) {
  return (
    record.outcome === 'failure' ||
    record.outcome === 'refusal' ||
    Boolean(record.error) ||
    Boolean(record.toolsExecuted?.length) ||
    Boolean(record.promptId) ||
    Boolean(record.promptHash) ||
    record.costStatus === 'estimated_backfill' ||
    Boolean(record.estimatedTokens) ||
    record.estimatedCost == null
  );
}

function TokenUsageCell({ record }) {
  const tokens = resolveTokenCounts(record);

  if (tokens.source === 'actual') {
    return (
      <span>
        {tokens.input} / {tokens.output}
        <Text as="strong" weight="semibold"> ({tokens.total})</Text>
      </span>
    );
  }

  if (tokens.source === 'estimated') {
    return (
      <span title="Estimated tokens derived deterministically from request context">
        {tokens.input} / {tokens.output}
        <Text as="strong" weight="semibold"> ({tokens.total})</Text>
        <Text as="small" variant="caption" color="warning">~Est</Text>
      </span>
    );
  }

  return (
    <Text as="span" size="xs" color="muted" title="Token counts unavailable from provider">
      {MISSING_VALUE}
    </Text>
  );
}

function CostCell({ record }) {
  if (record.estimatedCost == null) {
    const { tooltip } = describeUnavailablePricing(record);
    return (
      <Text as="span" size="xs" color="muted" title={`Pricing unavailable: ${tooltip}`}>
        {MISSING_VALUE}
      </Text>
    );
  }

  if (record.costStatus === 'estimated_backfill') {
    return (
      <span title={`Estimated cost based on deterministic token estimates (~${formatUsd(record.estimatedCost, 6)} USD)`}>
        {formatUsd(record.estimatedCost, 5)}
        <Text as="small" variant="caption" color="warning">~Est</Text>
      </span>
    );
  }

  return formatUsd(record.estimatedCost, 5);
}

function getPromptTitle(record, promptVersion) {
  if (record.promptHash) return `Hash: ${record.promptHash}`;
  if (promptVersion) return `Version: ${promptVersion}`;
  return undefined;
}

/**
 * Renders a single AI usage history table row and its optional expandable inspector row.
 */
export default function AIUsageHistoryRow({ record, isExpanded, onToggle, colSpan = 10 }) {
  const promptVersion = getExplicitPromptVersion(record);

  return (
    <>
      <TableRow>
        <TableCell nowrap>{formatTimestamp(record.timestamp)}</TableCell>
        <TableCell>
          <Stack gap="2xs">
            <Badge size="sm">{record.feature}</Badge>
            {record.operation && record.operation !== record.feature && (
              <Text as="small" variant="caption">{record.operation}</Text>
            )}
          </Stack>
        </TableCell>
        <TableCell truncate title={record.model}>
          {record.model || MISSING_VALUE}
        </TableCell>
        <TableCell>
          <Badge size="sm" pill variant={OUTCOME_BADGE_VARIANTS[record.outcome] ?? 'warning'}>
            {record.outcome}
          </Badge>
        </TableCell>
        <TableCell nowrap>
          {record.durationMs != null ? `${record.durationMs} ms` : MISSING_VALUE}
        </TableCell>
        <TableCell nowrap>
          <TokenUsageCell record={record} />
        </TableCell>
        <TableCell mono title={getPromptTitle(record, promptVersion)}>
          {promptVersion ?? <Text as="span" size="xs" color="muted">Legacy / unknown</Text>}
        </TableCell>
        <TableCell nowrap mono>
          <CostCell record={record} />
        </TableCell>
        <TableCell align="center">{record.totalAttempts || 1}</TableCell>
        <TableCell>
          {hasExpandableDetails(record) ? (
            <Button
              type="button"
              variant="chip"
              size="sm"
              onClick={() => onToggle(record.id)}
              aria-expanded={isExpanded}
              aria-label={`Toggle details for request ${record.id}`}
            >
              {isExpanded ? UI_LABELS.COMMON.COLLAPSE : UI_LABELS.COMMON.EXPAND}
            </Button>
          ) : (
            <Text as="span" size="xs" color="muted">{MISSING_VALUE}</Text>
          )}
        </TableCell>
      </TableRow>

      {isExpanded && <AIUsageHistoryDetailRow record={record} colSpan={colSpan} />}
    </>
  );
}
