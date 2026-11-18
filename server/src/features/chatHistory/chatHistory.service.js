import {
  setChatHistoryClientFactoryForTests,
  listUserConversations,
  findOwnedConversation,
  listConversationMessages,
  insertConversation,
  updateConversationTitle,
  deleteOwnedConversation,
  insertConversationMessage,
  beginStreamTurn,
  updateStreamingCheckpoint,
  finalizeStreamMessage,
  findMessageByRequestId,
} from './chatHistory.repository.js';

export {
  setChatHistoryClientFactoryForTests,
  beginStreamTurn,
  updateStreamingCheckpoint,
  finalizeStreamMessage,
  findMessageByRequestId,
};

function toPublicConversation(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title || 'New conversation',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toPublicMessage(row) {
  if (!row) return null;
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    text: row.content,
    ...(row.status ? { status: row.status } : {}),
    ...(row.reply_to ? { replyTo: row.reply_to } : {}),
    ...(row.request_id ? { requestId: row.request_id } : {}),
    ...(row.error_message ? { errorMessage: row.error_message } : {}),
    ...(row.completed_at ? { completedAt: row.completed_at } : {}),
    ...(row.tool_name ? { toolName: row.tool_name } : {}),
    ...(row.tool_result !== null && row.tool_result !== undefined ? { result: row.tool_result } : {}),
    ...(Array.isArray(row.sources) && row.sources.length > 0 ? { sources: row.sources } : {}),
    createdAt: row.created_at,
  };
}

export async function listConversations(user) {
  const rows = await listUserConversations(user, 20);
  return rows.map(toPublicConversation);
}

export function orderConversationMessages(rows = []) {
  if (!Array.isArray(rows) || rows.length <= 1) {
    return Array.isArray(rows) ? rows : [];
  }

  const compareBase = (a, b) => {
    const timeA = Date.parse(a?.created_at || a?.createdAt || '') || 0;
    const timeB = Date.parse(b?.created_at || b?.createdAt || '') || 0;
    if (timeA !== timeB) return timeA - timeB;
    if (a?.role !== b?.role) {
      if (a?.role === 'user') return -1;
      if (b?.role === 'user') return 1;
    }
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  };

  const sorted = [...rows].sort(compareBase);
  const byId = new Map(sorted.map((row) => [row.id, row]));
  const repliesByParent = new Map();
  const roots = [];

  for (const row of sorted) {
    const parentId = row?.reply_to || row?.replyTo || null;
    if (parentId && parentId !== row.id && byId.has(parentId)) {
      const list = repliesByParent.get(parentId) || [];
      list.push(row);
      repliesByParent.set(parentId, list);
    } else {
      roots.push(row);
    }
  }

  const ordered = [];
  const visited = new Set();
  const visit = (row) => {
    if (!row || visited.has(row.id)) return;
    visited.add(row.id);
    ordered.push(row);
    const replies = repliesByParent.get(row.id);
    if (replies) {
      for (const reply of replies) {
        visit(reply);
      }
    }
  };

  for (const root of roots) {
    visit(root);
  }
  for (const row of sorted) {
    visit(row);
  }

  return ordered;
}

export async function getConversationWithMessages(user, conversationId) {
  const conversation = await findOwnedConversation(user, conversationId);
  const messages = await listConversationMessages(user, conversationId);
  return {
    conversation: toPublicConversation(conversation),
    messages: orderConversationMessages(messages).map(toPublicMessage),
  };
}

export async function createConversation(user, input) {
  const row = await insertConversation(user, {
    id: input.id,
    title: input.title,
  });
  return toPublicConversation(row);
}

export async function updateConversation(user, conversationId, input) {
  const row = await updateConversationTitle(user, conversationId, input.title);
  return toPublicConversation(row);
}

export async function deleteConversation(user, conversationId) {
  await deleteOwnedConversation(user, conversationId);
  return { deleted: true, id: conversationId };
}

export async function appendMessage(user, conversationId, input) {
  // Verify ownership before inserting a message into the conversation.
  await findOwnedConversation(user, conversationId);
  const row = await insertConversationMessage(user, conversationId, input);
  return toPublicMessage(row);
}
