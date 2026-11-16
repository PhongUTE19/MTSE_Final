const MAX_CONVERSATIONS = 10;
const MAX_MESSAGES = 40;

function storageKey(userId, namespace = 'chat') {
  return `spendwise:${namespace}:${userId}`;
}

export function loadChatHistory(storage, userId, namespace = 'chat') {
  if (!storage || !userId) return [];
  try {
    const raw = storage.getItem(storageKey(userId, namespace));
    const parsed = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item?.id && Array.isArray(item.messages))
      .slice(0, MAX_CONVERSATIONS);
  } catch {
    return [];
  }
}

export function saveChatHistory(storage, userId, conversations, namespace = 'chat') {
  if (!storage || !userId) return;
  const safeConversations = (conversations || []).slice(0, MAX_CONVERSATIONS).map((conversation) => ({
    id: conversation.id,
    title: String(conversation.title || 'New conversation').slice(0, 80),
    updatedAt: conversation.updatedAt,
    persisted: Boolean(conversation.persisted),
    messages: (conversation.messages || [])
      .slice(-MAX_MESSAGES)
      .map(({ id, role, text, toolName, result, sources }) => ({
        id,
        role,
        text,
        toolName,
        result,
        sources,
      })),
  }));
  storage.setItem(storageKey(userId, namespace), JSON.stringify(safeConversations));
}

export function clearChatHistory(storage, userId, namespace = 'chat') {
  if (!storage || !userId) return;
  try {
    storage.removeItem?.(storageKey(userId, namespace));
  } catch {
    // Ignore storage removal errors
  }
}

export function makeConversation(title = 'New conversation') {
  return {
    id: crypto.randomUUID(),
    title,
    updatedAt: new Date().toISOString(),
    messages: [],
  };
}

/**
 * Prepares and validates recent messages for LLM/assistant history.
 * Ensures the items match schema expectations: only 'user' and 'assistant' roles,
 * non-empty trimmed text, capped at maxItems (default 8), and each turn clamped
 * to at most maxCharsPerItem (default 1000).
 */
export function buildHistoryPayload(messages, maxItems = 8, maxCharsPerItem = 1000) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((msg) => (msg.role === 'user' || msg.role === 'assistant') && typeof msg.text === 'string' && msg.text.trim())
    .slice(-maxItems)
    .map(({ role, text }) => {
      const trimmed = text.trim();
      const safeText = trimmed.length > maxCharsPerItem ? trimmed.slice(0, maxCharsPerItem) : trimmed;
      return { role, text: safeText };
    });
}

// Aliases for backwards compatibility
export const loadAssistantHistory = loadChatHistory;
export const saveAssistantHistory = saveChatHistory;
