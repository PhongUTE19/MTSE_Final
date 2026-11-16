import React, { useState } from 'react';
import { ASSISTANT_LABELS } from './expenseAssistantLabels.js';
import { Card } from '../../primitives/cards/index.js';
import { Inline, Stack } from '../../primitives/layout/index.js';
import Text from '../../primitives/typography/Text.jsx';
import Button from '../../primitives/buttons/Button.jsx';
import Alert from '../../composites/feedback/Alert.jsx';
import { TransactionDraftReview } from '../../composites/transactions/index.js';
import { formatMoney } from '../../shared/utils/formatters.js';

/**
 * Renders the create_transaction AI proposal draft review and its
 * confirmed, rejected, and historical/expired states.
 */
export default function ToolProposalResult({
  result,
  conversationId,
  drafts = [],
  draftsLoading = false,
  onCreateDraft,
  onConfirmDraft,
  onRejectDraft,
  onTransactionsChanged,
}) {
  const [localStatus, setLocalStatus] = useState(() => {
    return result?.draft?.status || result?.status || 'pending_review';
  });
  const [restagedDraftId, setRestagedDraftId] = useState(null);
  const [restaging, setRestaging] = useState(false);
  const [actionError, setActionError] = useState('');

  const activeDraftId = restagedDraftId || result?.draftId;
  const matchingDraft = activeDraftId ? drafts.find((d) => d.id === activeDraftId) : null;
  const rawFields = result?.draft?.originalData || result?.draft || {};
  const draftData = matchingDraft || (result?.draft?.originalData ? result.draft : { originalData: rawFields });

  if (localStatus === 'confirmed') {
    return (
      <Alert variant="success" role="status">
        <Text>{ASSISTANT_LABELS.TRANSACTION_SAVED || 'Transaction confirmed and saved.'}</Text>
      </Alert>
    );
  }

  if (localStatus === 'rejected') {
    return (
      <Alert variant="neutral" role="status">
        <Text>{ASSISTANT_LABELS.PROPOSAL_CANCELLED || 'Transaction proposal discarded.'}</Text>
      </Alert>
    );
  }

  // Historical proposal whose local IndexedDB draft no longer exists:
  // never auto-confirm or treat as a confirmed transaction; render read-only with explicit re-stage.
  const isHistoricalExpired = Boolean(
    activeDraftId && !draftsLoading && !matchingDraft && onCreateDraft
  );
  if (isHistoricalExpired) {
    const amountText = rawFields.amount ? formatMoney(rawFields.amount) : '—';
    return (
      <Card variant="outlined" padding="md" role="region" aria-label="Historical transaction proposal">
        <Stack gap="sm">
          <Text variant="caption">Historical proposal (read-only)</Text>
          <Text size="sm" weight="semibold">
            {rawFields.merchant || 'Proposed transaction'} · {amountText}
          </Text>
          <Text variant="secondary" size="xs">
            {rawFields.category || 'Uncategorized'} · {rawFields.date || 'No date'}
          </Text>
          <Text variant="secondary" size="xs">
            This proposal is no longer an active local draft and was not automatically saved.
          </Text>
          {actionError && (
            <Alert variant="error" role="alert">
              <Text size="xs">{actionError}</Text>
            </Alert>
          )}
          <Inline gap="sm">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={restaging}
              disabled={restaging}
              onClick={async () => {
                setActionError('');
                setRestaging(true);
                try {
                  const newDraft = await onCreateDraft({
                    sourceType: 'assistant_proposal',
                    sourceRef: conversationId || null,
                    originalData: rawFields,
                    reviewedData: rawFields,
                  });
                  setRestagedDraftId(newDraft.id);
                } catch (err) {
                  setActionError(err?.message || 'Failed to re-stage proposal.');
                } finally {
                  setRestaging(false);
                }
              }}
            >
              Re-stage as new draft
            </Button>
          </Inline>
        </Stack>
      </Card>
    );
  }

  return (
    <TransactionDraftReview
      draft={draftData}
      error={actionError}
      title="Review transaction proposal"
      subtitle="AI proposed this transaction. Check every field before saving."
      sourceSlot={
        <Card variant="default" padding="lg">
          <Stack gap="xs">
            <Text variant="caption">Source</Text>
            <Text variant="secondary" size="xs">
              Proposed by AI Assistant from your conversation.
            </Text>
            {conversationId && (
              <Text variant="secondary" size="2xs">
                Conversation: {conversationId}
              </Text>
            )}
          </Stack>
        </Card>
      }
      onConfirm={async (reviewedValues) => {
        setActionError('');
        try {
          if (onConfirmDraft && activeDraftId) {
            await onConfirmDraft(activeDraftId, reviewedValues);
          }
          setLocalStatus('confirmed');
          await onTransactionsChanged?.();
        } catch (err) {
          setActionError(err?.message || 'Failed to confirm transaction.');
          throw err;
        }
      }}
      onReject={async () => {
        setActionError('');
        try {
          if (onRejectDraft && activeDraftId) {
            await onRejectDraft(activeDraftId);
          }
          setLocalStatus('rejected');
          await onTransactionsChanged?.();
        } catch (err) {
          setActionError(err?.message || 'Failed to discard proposal.');
          throw err;
        }
      }}
    />
  );
}
