import React from 'react';
import { formatMoney } from '../../shared/utils/formatters.js';
import Button from '../../primitives/buttons/Button.jsx';
import Card from '../../primitives/cards/Card.jsx';
import { Inline, Stack } from '../../primitives/layout/index.js';
import Text from '../../primitives/typography/Text.jsx';

function formatDraftSummary(draft) {
  const data = draft.reviewedData || draft.originalData || {};
  const amountText = data.totalAmount || data.amount
    ? `${formatMoney(data.totalAmount || data.amount)} · `
    : '';
  const dateText = data.date || data.transactionDate || 'No date';
  const createdText = draft.createdAt
    ? new Date(draft.createdAt).toLocaleDateString()
    : 'Pending';
  return `${amountText}${dateText} · ${createdText}`;
}

/**
 * Lists pending receipt drafts and failed receipt extractions available for resume, discard, or retry.
 */
export default function PendingReceiptList({
  pendingDrafts = [],
  failedReceipts = [],
  pendingAction,
  onResumeDraft,
  onDiscardDraft,
  onRetryFailed,
}) {
  if (pendingDrafts.length === 0 && failedReceipts.length === 0) {
    return null;
  }

  const isBusy = Boolean(pendingAction);

  return (
    <Card as="section" variant="outlined" padding="md" aria-label="Pending receipt reviews">
      <Stack gap="xs">
        <Stack gap="2xs">
          <Text weight="semibold">Finish a previous receipt</Text>
          <Text variant="secondary">
            Your extracted receipt drafts are saved until you confirm or discard them.
          </Text>
        </Stack>
        <Stack as="ul" gap="xs">
          {pendingDrafts.map((draft) => {
            const data = draft.reviewedData || draft.originalData || {};
            return (
              <Card as="li" key={draft.id} variant="default" padding="sm">
                <Inline justify="between" align="center" fullWidth wrap>
                  <Stack gap="2xs">
                    <Text weight="bold">{data.merchant || 'Receipt draft'}</Text>
                    <Text variant="secondary" size="xs">
                      {formatDraftSummary(draft)}
                    </Text>
                  </Stack>
                  <Inline gap="sm">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => onDiscardDraft(draft)}
                      disabled={isBusy}
                      loading={pendingAction?.id === draft.id && pendingAction?.type === 'discard'}
                    >
                      Discard
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      onClick={() => onResumeDraft(draft)}
                      disabled={isBusy}
                      loading={pendingAction?.id === draft.id && pendingAction?.type === 'resume'}
                    >
                      Resume review
                    </Button>
                  </Inline>
                </Inline>
              </Card>
            );
          })}

          {failedReceipts.map((failed) => (
            <Card as="li" key={failed.id} variant="default" padding="sm">
              <Inline justify="between" align="center" fullWidth wrap>
                <Stack gap="2xs">
                  <Text weight="bold">{failed.filename || 'Receipt'}</Text>
                  <Text variant="secondary" size="xs">
                    Extraction timed out or failed · Ready to retry
                  </Text>
                </Stack>
                <Inline gap="sm">
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => onRetryFailed(failed)}
                    disabled={isBusy}
                    loading={pendingAction?.id === failed.id && pendingAction?.type === 'retry'}
                  >
                    Retry extraction
                  </Button>
                </Inline>
              </Inline>
            </Card>
          ))}
        </Stack>
      </Stack>
    </Card>
  );
}
