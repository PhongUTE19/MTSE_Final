import React from 'react';
import ToolProposalResult from './ToolProposalResult.jsx';
import ToolSearchResults from './ToolSearchResults.jsx';
import ToolSpendingSummary from './ToolSpendingSummary.jsx';

/**
 * Dispatches structured tool results returned by the Expense AI Agent
 * to the appropriate result presentation component.
 */
export default function ExpenseToolResult({
  message,
  drafts = [],
  draftsLoading = false,
  onCreateDraft,
  onConfirmDraft,
  onRejectDraft,
  onTransactionsChanged,
}) {
  const result = message?.result;
  const toolName = message?.toolName;

  if (!result && !toolName) return null;

  if (toolName === 'propose_transaction' || toolName === 'create_transaction' || result?.draftId) {
    return (
      <ToolProposalResult
        result={result}
        conversationId={message?.conversationId}
        drafts={drafts}
        draftsLoading={draftsLoading}
        onCreateDraft={onCreateDraft}
        onConfirmDraft={onConfirmDraft}
        onRejectDraft={onRejectDraft}
        onTransactionsChanged={onTransactionsChanged}
      />
    );
  }

  if (toolName === 'search_transactions') {
    return <ToolSearchResults result={result} />;
  }

  if (toolName === 'get_spending_summary') {
    return <ToolSpendingSummary result={result} />;
  }

  return null;
}
