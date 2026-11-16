import { AppError, NotFoundError, handleDatabaseError } from '../../shared/errors/index.js';
import { HTTP_STATUS } from '../../constants/index.js';
import { createUserScopedSupabaseClient } from '../../shared/integrations/supabase.js';

const CONVERSATIONS_TABLE = 'chat_conversations';
const MESSAGES_TABLE = 'chat_messages';
let clientFactory = null;

/** @internal Test seam; production uses RLS-enforced user-scoped Supabase client. */
export function setChatHistoryClientFactoryForTests(factory) {
  clientFactory = factory || null;
}

function clientFor(user) {
  const client = clientFactory
    ? clientFactory(user)
    : createUserScopedSupabaseClient(user.token);
  if (!client) {
    throw new AppError('Chat history service is not configured.', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
  return client;
}

function dbError(operation, error) {
  return handleDatabaseError(
    'ChatHistoryRepository',
    operation,
    error,
    'Chat history persistence is temporarily unavailable.'
  );
}

export async function listUserConversations(user, limit = 20) {
  const { data, error } = await clientFor(user)
    .from(CONVERSATIONS_TABLE)
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) throw dbError('List conversations', error);
  return data || [];
}

export async function findOwnedConversation(user, conversationId) {
  const { data, error } = await clientFor(user)
    .from(CONVERSATIONS_TABLE)
    .select('*')
    .eq('id', conversationId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) throw dbError('Find conversation', error);
  if (!data) throw new NotFoundError('Conversation not found.');
  return data;
}

export async function listConversationMessages(user, conversationId) {
  const { data, error } = await clientFor(user)
    .from(MESSAGES_TABLE)
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (error) throw dbError('List conversation messages', error);
  return data || [];
}

export async function insertConversation(user, { id, title }) {
  const payload = {
    ...(id ? { id } : {}),
    user_id: user.id,
    title,
  };
  const { data, error } = await clientFor(user)
    .from(CONVERSATIONS_TABLE)
    .insert(payload)
    .select('*')
    .single();

  if (error) throw dbError('Create conversation', error);
  return data;
}

export async function updateConversationTitle(user, conversationId, title) {
  const { data, error } = await clientFor(user)
    .from(CONVERSATIONS_TABLE)
    .update({ title, updated_at: new Date().toISOString() })
    .eq('id', conversationId)
    .eq('user_id', user.id)
    .select('*')
    .maybeSingle();

  if (error) throw dbError('Update conversation', error);
  if (!data) throw new NotFoundError('Conversation not found.');
  return data;
}

export async function deleteOwnedConversation(user, conversationId) {
  const { data, error } = await clientFor(user)
    .from(CONVERSATIONS_TABLE)
    .delete()
    .eq('id', conversationId)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle();

  if (error) throw dbError('Delete conversation', error);
  if (!data) throw new NotFoundError('Conversation not found.');
  return data;
}

export async function insertConversationMessage(user, conversationId, message) {
  const payload = {
    ...(message.id ? { id: message.id } : {}),
    conversation_id: conversationId,
    user_id: user.id,
    role: message.role,
    content: message.text,
    tool_name: message.toolName ?? null,
    tool_result: message.result ?? null,
    sources: Array.isArray(message.sources) ? message.sources : [],
  };
  const { data, error } = await clientFor(user)
    .from(MESSAGES_TABLE)
    .insert(payload)
    .select('*')
    .single();

  if (error) throw dbError('Create chat message', error);
  return data;
}

export async function beginStreamTurn(
  user,
  { conversationId, title, userMessageId, userContent, assistantMessageId, requestId }
) {
  const { data, error } = await clientFor(user).rpc('begin_chat_stream_turn', {
    p_conversation_id: conversationId,
    p_title: title,
    p_user_message_id: userMessageId,
    p_user_content: userContent,
    p_assistant_message_id: assistantMessageId,
    p_request_id: requestId,
  });

  if (error) throw dbError('Begin chat stream turn', error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new AppError('Failed to register streaming chat turn.', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
  return row;
}

export async function updateStreamingCheckpoint(user, { messageId, requestId, content }) {
  const { data, error } = await clientFor(user)
    .from(MESSAGES_TABLE)
    .update({ content })
    .eq('id', messageId)
    .eq('user_id', user.id)
    .eq('request_id', requestId)
    .eq('status', 'streaming')
    .select('id, status')
    .maybeSingle();

  if (error) throw dbError('Checkpoint streaming message', error);
  return data;
}

export async function finalizeStreamMessage(
  user,
  {
    messageId,
    requestId,
    status,
    content,
    toolName = null,
    toolResult = null,
    sources = [],
    errorMessage = null,
  }
) {
  if (!['completed', 'aborted', 'failed'].includes(status)) {
    throw new AppError(`Invalid terminal message status "${status}".`, HTTP_STATUS.BAD_REQUEST);
  }

  const { data, error } = await clientFor(user)
    .from(MESSAGES_TABLE)
    .update({
      status,
      content: typeof content === 'string' ? content : '',
      tool_name: toolName,
      tool_result: toolResult,
      sources: Array.isArray(sources) ? sources : [],
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq('id', messageId)
    .eq('user_id', user.id)
    .eq('request_id', requestId)
    .eq('status', 'streaming')
    .select('*')
    .maybeSingle();

  if (error) throw dbError('Finalize streaming message', error);
  return data;
}

export async function findMessageByRequestId(user, requestId) {
  const { data, error } = await clientFor(user)
    .from(MESSAGES_TABLE)
    .select('*')
    .eq('user_id', user.id)
    .eq('request_id', requestId)
    .maybeSingle();

  if (error) throw dbError('Find message by requestId', error);
  return data;
}
