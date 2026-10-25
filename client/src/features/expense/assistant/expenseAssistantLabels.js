/**
 * Quick action shortcuts for the Expense Assistant chat interface.
 */
export const ASSISTANT_QUICK_ACTIONS = Object.freeze([
  ['⌕', 'Find transactions', 'Search for my recent transactions.'],
  ['◴', 'Spending summary', 'How much did I earn and spend this month?'],
  ['◌', 'Category breakdown', 'Which category did I spend the most on this month?'],
  ['＋', 'Add transaction', 'I spent $45 on groceries today.'],
]);

/**
 * Centrally organized labels, notices, and UI copy for the AI Expense Assistant.
 */
export const ASSISTANT_LABELS = Object.freeze({
  HEADER_TITLE: 'Spendwise Assistant',
  HEADER_SUBTITLE: 'Expense Assistant',
  WELCOME_QUESTION: 'How can I help you today?',
  INPUT_PLACEHOLDER: 'Type a message…',
  SEND_BUTTON: 'Send',
  ATTACH_RECEIPT: 'Upload receipt image',
  ADD_RECEIPT_LABEL: 'Add receipt',
  PROCESSING: 'Processing…',
  TAB_CHAT: 'Chat',
  TAB_HISTORY: 'History',
  NEW_CHAT_TOOLTIP: 'New conversation',
  HISTORY_TOOLTIP: 'History',
  CLOSE_TOOLTIP: 'Close',
  DELETE_CONVERSATION_LABEL: 'Delete conversation',
  DELETE_CONVERSATION_CONFIRM: 'Delete this conversation history? Saved transactions will not be deleted.',
  SEARCH_RESULTS_TITLE: 'Matching transactions',
  RESULTS_COUNT: (count) => `${count} result${count === 1 ? '' : 's'}`,
  EMPTY_SEARCH: 'No matching transactions found.',
  SPENDING_SUMMARY_TITLE: 'Spending summary',
  TOTAL_INCOME: 'Total income',
  TOTAL_EXPENSE: 'Total expenses',
  BALANCE: 'Net balance',
  PROPOSAL_TITLE: 'Review before saving',
  PROPOSAL_DISCLAIMER: 'This is a proposed transaction and has not yet been saved.',
  PROPOSAL_CANCEL: 'Cancel',
  PROPOSAL_CONFIRM: 'Confirm & save',
  PROPOSAL_SAVING: 'Saving…',
  DEFAULT_SUCCESS_ANSWER: 'Request completed successfully.',
  ERROR_GENERIC: 'Unable to process your request. Please try again.',
  TRANSACTION_SAVED: 'Transaction saved successfully.',
  PROPOSAL_CANCELLED: 'Proposal cancelled. No transaction was saved.',
  RECEIPT_RESTRICTION: 'Only JPG, PNG, or WebP up to 5 MB are accepted.',
  RECEIPT_SAVED: 'Receipt transaction confirmed and saved.',
  RECEIPT_DISCARDED: 'Receipt draft discarded.',
  AMOUNT_POSITIVE_ERROR: 'Amount must be greater than zero.',
});
