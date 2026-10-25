import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { getSpendingSummary, setExpenseClientFactoryForTests } from '../../server/src/features/expenses/expenses.service.js';
import { spendingSummaryArgsSchema } from '../../server/src/features/expenseAgent/expenseAgent.schemas.js';
import { getSpendingSummaryForUser } from '../../server/src/features/expenseAgent/expenseAgent.service.js';
import { runGeminiExpenseAgent, SPENDING_SUMMARY_TOOL } from '../../server/src/features/expenseAgent/geminiExpenseAgent.js';

const user = { id: 'user-a', token: 'verified-token' };
const period = { from: '2026-10-01', to: '2026-10-31' };

function summaryClient(rows, calls) {
  return {
    from() {
      const query = {
        select(...args) { calls.push(['select', ...args]); return this; },
        eq(...args) { calls.push(['eq', ...args]); return this; },
        gte(...args) { calls.push(['gte', ...args]); return this; },
        lte(...args) { calls.push(['lte', ...args]); return this; },
        order(...args) { calls.push(['order', ...args]); return this; },
        range(start, end) {
          calls.push(['range', start, end]);
          return Promise.resolve({ data: rows.slice(start, end + 1), count: rows.length, error: null });
        },
      };
      return query;
    },
  };
}

after(() => setExpenseClientFactoryForTests(null));

describe('get_spending_summary', () => {
  it('validates an inclusive period and rejects malformed or reversed dates', () => {
    assert.deepEqual(spendingSummaryArgsSchema.parse(period), period);
    assert.throws(() => spendingSummaryArgsSchema.parse({ from: '2026-10-32', to: '2026-11-01' }));
    assert.throws(() => spendingSummaryArgsSchema.parse({ from: '2026-11-01', to: '2026-10-31' }));
  });

  it('calculates income, expense, balance and descending expense categories without float errors', async () => {
    const calls = [];
    const rows = [
      { type: 'income', amount: 100.2, category: 'Salary' },
      { type: 'income', amount: 0.1, category: 'Other' },
      { type: 'expense', amount: 20.1, category: 'Food' },
      { type: 'expense', amount: 20.2, category: 'Food' },
      { type: 'expense', amount: 40, category: 'Transport' },
    ];
    setExpenseClientFactoryForTests(() => summaryClient(rows, calls));
    const result = await getSpendingSummary(user, period);
    assert.deepEqual(result, {
      period, totalIncome: 100.3, totalExpense: 80.3, balance: 20,
      topCategories: [{ category: 'Food', amount: 40.3 }, { category: 'Transport', amount: 40 }],
    });
    assert.ok(calls.some((call) => call[0] === 'eq' && call[1] === 'user_id' && call[2] === 'user-a'));
    assert.ok(calls.some((call) => call[0] === 'gte' && call[1] === 'transaction_date' && call[2] === period.from));
    assert.ok(calls.some((call) => call[0] === 'lte' && call[1] === 'transaction_date' && call[2] === period.to));
  });

  it('loads every internal batch instead of calculating only the first page', async () => {
    const calls = [];
    const rows = [
      ...Array.from({ length: 1000 }, () => ({ type: 'expense', amount: 0.1, category: 'Food' })),
      { type: 'income', amount: 100, category: 'Salary' },
    ];
    setExpenseClientFactoryForTests(() => summaryClient(rows, calls));
    const result = await getSpendingSummary(user, period);
    assert.equal(result.totalIncome, 100);
    assert.equal(result.totalExpense, 100);
    assert.equal(result.balance, 0);
    assert.deepEqual(calls.filter((call) => call[0] === 'range'), [['range', 0, 999], ['range', 1000, 1999]]);
  });

  it('returns zero values and empty categories when the user has no matching transactions', async () => {
    setExpenseClientFactoryForTests(() => summaryClient([], []));
    const result = await getSpendingSummary(user, period);
    assert.deepEqual(result, { period, totalIncome: 0, totalExpense: 0, balance: 0, topCategories: [] });
  });

  it('rejects unknown tool calls and Supabase failures without trusting model input', async () => {
    await assert.rejects(() => getSpendingSummaryForUser(user, 'summary', {
      agentRunner: (_message, executeTool) => executeTool('search_transactions', period),
    }), { statusCode: 400 });
    await assert.rejects(() => getSpendingSummaryForUser(user, 'summary', {
      agentRunner: (_message, executeTool) => executeTool('get_spending_summary', { from: 'wrong', to: '2026-10-01' }),
    }), { statusCode: 400 });
    await assert.rejects(() => getSpendingSummaryForUser(user, 'summary', {
      agentRunner: (_message, executeTool) => executeTool('get_spending_summary', period),
      getSpendingSummary: async () => { throw new Error('Supabase unavailable'); },
    }), { statusCode: 500, message: 'Expense summary is temporarily unavailable.' });
  });

  it('uses real Gemini function-call protocol for the summary tool', async () => {
    const calls = [];
    const fakeAi = { models: { generateContent: async (request) => {
      calls.push(request);
      if (calls.length === 1) return {
        functionCalls: [{ name: 'get_spending_summary', args: period }],
        candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'get_spending_summary', args: period } }] } }],
      };
      return { text: 'You spent 80,300 VND.' };
    } } };
    const output = await runGeminiExpenseAgent('How much did I spend this month?', async (name, args) => {
      assert.equal(name, 'get_spending_summary');
      assert.deepEqual(args, period);
      return { totalExpense: 80300, totalIncome: 0, balance: -80300, topCategories: [] };
    }, { ai: fakeAi, agentType: 'summary', today: '2026-10-25' });
    assert.equal(output.toolName, 'get_spending_summary');
    assert.equal(calls[0].config.tools[0].functionDeclarations[0].name, SPENDING_SUMMARY_TOOL.name);
    assert.match(calls[0].config.systemInstruction, /Asia\/Ho_Chi_Minh/);
    assert.equal(calls[1].contents[2].parts[0].functionResponse.name, 'get_spending_summary');
  });

  it('asks for a period instead of inventing one when Gemini returns clarification text', async () => {
    const fakeAi = { models: { generateContent: async () => ({ text: 'Which time period would you like summary for?' }) } };
    const output = await runGeminiExpenseAgent('How much did I spend?', async () => assert.fail('Tool must not execute'), {
      ai: fakeAi, agentType: 'summary', today: '2026-10-25',
    });
    assert.equal(output.toolName, null);
    assert.match(output.answer, /time period/);
  });
});
