import React from 'react';
import { formatMoney } from '../../shared/utils/formatters.js';
import { getDraftSourceLabel, isReceiptDraft } from './draftStorage.js';
import Button from '../../primitives/buttons/Button.jsx';
import Spinner from '../../primitives/feedback/Spinner.jsx';
import Badge from '../../primitives/labels/Badge.jsx';
import Text from '../../primitives/typography/Text.jsx';
import { Inline, Stack } from '../../primitives/layout/index.js';
import { Card, CardHeader, CardTitle } from '../../primitives/cards/index.js';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
} from '../../primitives/table/index.js';

function getDraftFields(draft) {
  return draft?.reviewedData || draft?.originalData || {};
}

/**
 * Unified drafts table matching TransactionTable's layout, typography, and controls.
 * Displays both Receipt and Manual drafts from IndexedDB.
 */
export default function DraftsTable({
  drafts = [],
  loading = false,
  busyDraftId = null,
  onEdit,
  onConfirm,
  onDiscard,
}) {
  return (
    <Card as="section" variant="glass" padding="md" aria-busy={loading}>
      <Stack gap="md">
        <CardHeader as="header">
          <Inline justify="between" align="center" fullWidth>
            <Stack gap="2xs">
              <CardTitle as="h2">Saved drafts</CardTitle>
              <Text variant="secondary">
                Review, edit, or confirm unconfirmed receipt and manual transaction drafts.
              </Text>
            </Stack>
          </Inline>
        </CardHeader>

        <Table variant="comfortable" responsive>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Transaction</TableHeaderCell>
              <TableHeaderCell>Source</TableHeaderCell>
              <TableHeaderCell>Category</TableHeaderCell>
              <TableHeaderCell>Date</TableHeaderCell>
              <TableHeaderCell>Amount (₫)</TableHeaderCell>
              <TableHeaderCell>Actions</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={6} variant="empty">
                  <Inline justify="center" align="center" gap="sm">
                    <Spinner size="sm" variant="primary" ariaHidden />
                    <span>Loading drafts…</span>
                  </Inline>
                </TableCell>
              </TableRow>
            )}
            {!loading && drafts.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} variant="empty">
                  No saved drafts yet. Use Add Transaction to create a manual or receipt draft.
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              drafts.map((draft) => {
                const data = getDraftFields(draft);
                const sourceLabel = getDraftSourceLabel(draft);
                const isReceipt = isReceiptDraft(draft);
                const title =
                  (typeof data.merchant === 'string' && data.merchant.trim()) ||
                  (isReceipt ? 'Receipt draft' : 'Manual draft');
                const subtitle =
                  (typeof data.note === 'string' && data.note.trim()) ||
                  data.type ||
                  '—';
                const dateValue = data.date || data.transactionDate || '—';
                const numericAmount = Number(data.amount);
                const hasAmount =
                  data.amount !== '' &&
                  data.amount !== null &&
                  data.amount !== undefined &&
                  Number.isFinite(numericAmount) &&
                  numericAmount > 0;
                const isRowBusy = busyDraftId === draft.id;

                return (
                  <TableRow key={draft.id}>
                    <TableCell>
                      <Stack gap="2xs">
                        <Text as="strong" variant="body-sm" weight="semibold" truncate>
                          {title}
                        </Text>
                        <Text as="small" variant="caption" truncate>
                          {subtitle}
                        </Text>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Badge size="sm" pill>
                        {sourceLabel}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {data.category ? (
                        <Badge size="sm" pill>
                          {data.category}
                        </Badge>
                      ) : (
                        <Text variant="secondary">—</Text>
                      )}
                    </TableCell>
                    <TableCell nowrap>{dateValue}</TableCell>
                    <TableCell
                      variant={
                        hasAmount
                          ? data.type === 'income'
                            ? 'positive'
                            : 'negative'
                          : undefined
                      }
                      nowrap
                    >
                      {hasAmount
                        ? `${data.type === 'income' ? '+' : '-'}${formatMoney(numericAmount)}`
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <Inline gap="xs">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={isRowBusy}
                          onClick={() => onEdit?.(draft)}
                          aria-label={`Edit ${title}`}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          disabled={isRowBusy}
                          loading={isRowBusy}
                          onClick={() => onConfirm?.(draft)}
                          aria-label={`Confirm ${title}`}
                        >
                          Confirm
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          disabled={isRowBusy}
                          onClick={() => onDiscard?.(draft)}
                          aria-label={`Discard ${title}`}
                        >
                          Discard
                        </Button>
                      </Inline>
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </Stack>
    </Card>
  );
}
