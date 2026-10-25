import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  loadAssistantHistory,
  makeConversation,
  saveAssistantHistory,
} from '../../client/src/features/chat/chatHistory.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };
}

test('assistant history is scoped to a browser user and excludes proposal data', () => {
  const storage = memoryStorage();
  const conversation = makeConversation();
  conversation.messages.push({
    id: 'm1',
    role: 'assistant',
    text: 'Kết quả',
    toolName: 'search_transactions',
    result: { total: 0 },
    proposal: { id: 'must-not-save' },
  });
  saveAssistantHistory(storage, 'user-a', [conversation], 'expense-assistant');
  assert.equal(loadAssistantHistory(storage, 'user-a', 'expense-assistant').length, 1);
  assert.equal(loadAssistantHistory(storage, 'user-b', 'expense-assistant').length, 0);
  assert.equal(loadAssistantHistory(storage, 'user-a', 'expense-assistant')[0].messages[0].proposal, undefined);
});
