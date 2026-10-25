const MAX_CONVERSATIONS = 10;
const MAX_MESSAGES = 40;

export function storageKey(userId, namespace = 'chat') {
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

export function makeConversation(title = 'New conversation') {
  return {
    id: crypto.randomUUID(),
    title,
    updatedAt: new Date().toISOString(),
    messages: [],
  };
}

// Aliases for backwards compatibility
export const loadAssistantHistory = loadChatHistory;
export const saveAssistantHistory = saveChatHistory;
