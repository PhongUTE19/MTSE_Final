import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadExpenseAssistantHistory, makeConversation, saveExpenseAssistantHistory } from '../../client/src/components/expense/expenseAssistantHistory.js';

function memoryStorage() { const values = new Map(); return { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) }; }

test('expense assistant history is scoped to a browser user and excludes proposal data', () => {
  const storage = memoryStorage();
  const conversation = makeConversation();
  conversation.messages.push({ id: 'm1', role: 'assistant', text: 'Kết quả', toolName: 'search_transactions', result: { total: 0 }, proposal: { id: 'must-not-save' } });
  saveExpenseAssistantHistory(storage, 'user-a', [conversation]);
  assert.equal(loadExpenseAssistantHistory(storage, 'user-a').length, 1);
  assert.equal(loadExpenseAssistantHistory(storage, 'user-b').length, 0);
  assert.equal(loadExpenseAssistantHistory(storage, 'user-a')[0].messages[0].proposal, undefined);
});
