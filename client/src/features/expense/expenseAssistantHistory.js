const MAX_CONVERSATIONS = 10;
const MAX_MESSAGES = 40;

function storageKey(userId) {
  return `spendwise:expense-assistant:${userId}`;
}

// localStorage only retains UI data for the active browser account.
// It contains no JWT and is never used for authentication or authorization decisions.
export function loadExpenseAssistantHistory(storage, userId) {
  if (!storage || !userId) return [];
  try {
    const parsed = JSON.parse(storage.getItem(storageKey(userId)) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => item?.id && Array.isArray(item.messages)).slice(0, MAX_CONVERSATIONS) : [];
  } catch { return []; }
}

export function saveExpenseAssistantHistory(storage, userId, conversations) {
  if (!storage || !userId) return;
  const safeConversations = conversations.slice(0, MAX_CONVERSATIONS).map((conversation) => ({
    id: conversation.id,
    title: String(conversation.title || 'New conversation').slice(0, 80),
    updatedAt: conversation.updatedAt,
    // Do not persist active proposals because they must be confirmed in the current session.
    messages: conversation.messages.slice(-MAX_MESSAGES).map(({ id, role, text, toolName, result }) => ({ id, role, text, toolName, result })),
  }));
  storage.setItem(storageKey(userId), JSON.stringify(safeConversations));
}

export function makeConversation() {
  return { id: crypto.randomUUID(), title: 'New conversation', updatedAt: new Date().toISOString(), messages: [] };
}
