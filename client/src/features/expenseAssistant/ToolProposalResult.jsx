import React, { useState } from 'react';
import { ASSISTANT_LABELS } from './expenseAssistantLabels.js';
import { Card } from '../../primitives/cards/index.js';
import { Stack } from '../../primitives/layout/index.js';
import Text from '../../primitives/typography/Text.jsx';
import Alert from '../../composites/feedback/Alert.jsx';
import { TransactionDraftReview } from '../../composites/transactions/index.js';

/**
 * Renders the create_transaction AI proposal draft review and its confirmed/rejected states.
 */
export default function ToolProposalResult({
  result,
  conversationId,
  onConfirmDraft,
  onRejectDraft,
  onTransactionsChanged,
}) {
  const [localStatus, setLocalStatus] = useState(() => {
    return result?.draft?.status || result?.status || 'pending_review';
  });
  const [actionError, setActionError] = useState('');

  const draftId = result?.draftId;
  const draftData = result?.draft?.originalData
    ? result.draft
    : { originalData: result?.draft };

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
          if (onConfirmDraft && draftId) {
            await onConfirmDraft(draftId, reviewedValues);
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
          if (onRejectDraft && draftId) {
            await onRejectDraft(draftId);
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
