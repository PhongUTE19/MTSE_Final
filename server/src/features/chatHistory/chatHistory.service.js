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

export async function getConversationWithMessages(user, conversationId) {
  const conversation = await findOwnedConversation(user, conversationId);
  const messages = await listConversationMessages(user, conversationId);
  return {
    conversation: toPublicConversation(conversation),
    messages: messages.map(toPublicMessage),
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
