const MAX_CONVERSATIONS = 10;
const MAX_MESSAGES = 40;

function storageKey(userId) {
  return `spendwise:expense-assistant:${userId}`;
}

// localStorage chỉ giữ dữ liệu UI cho đúng tài khoản trên trình duyệt này.
// Nó không chứa JWT và không bao giờ được dùng để xác thực/quyết định quyền.
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
    title: String(conversation.title || 'Cuộc trò chuyện mới').slice(0, 80),
    updatedAt: conversation.updatedAt,
    // Không lưu proposal còn hiệu lực vì proposal phải được xác nhận trong phiên hiện tại.
    messages: conversation.messages.slice(-MAX_MESSAGES).map(({ id, role, text, toolName, result }) => ({ id, role, text, toolName, result })),
  }));
  storage.setItem(storageKey(userId), JSON.stringify(safeConversations));
}

export function makeConversation() {
  return { id: crypto.randomUUID(), title: 'Cuộc trò chuyện mới', updatedAt: new Date().toISOString(), messages: [] };
}
