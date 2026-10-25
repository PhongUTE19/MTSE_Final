import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  cancelTransactionProposal,
  clearTransactionProposalsForTests,
  confirmTransactionProposal,
  createTransactionProposalForUser,
  runExpenseAssistantForUser,
  setProposalClockForTests,
} from '../../server/src/features/expenseAgent/expenseAgent.service.js';
import {
  CREATE_TRANSACTION_TOOL,
  runGeminiExpenseAgent,
} from '../../server/src/features/expenseAgent/geminiExpenseAgent.js';

const userA = { id: 'user-a', token: 'a' };
const userB = { id: 'user-b', token: 'b' };
const transaction = {
  type: 'expense',
  amount: 45000,
  date: '2026-10-25',
  category: 'Food & dining',
  merchant: 'Highlands',
  note: '',
  items: [],
};

async function proposal() {
  return createTransactionProposalForUser(userA, 'cà phê', {
    agentRunner: async (_m, execute) => ({
      answer: 'Review proposal.',
      toolResult: await execute('create_transaction', transaction),
    }),
  });
}

afterEach(() => {
  clearTransactionProposalsForTests();
  setProposalClockForTests(null);
});

describe('create_transaction proposal confirmation', () => {
  it('creates a proposal but does not persist before confirmation', async () => {
    const result = await proposal();
    assert.ok(result.toolResult.proposal.id);
    assert.equal(result.toolResult.proposal.transaction.amount, 45000);
  });

  it('allows cancel without calling persistence', async () => {
    const result = await proposal();
    const cancelled = cancelTransactionProposal(userA, result.toolResult.proposal.id);
    assert.equal(cancelled.cancelled, true);

    await assert.rejects(
      () =>
        confirmTransactionProposal(userA, result.toolResult.proposal.id, transaction, {
          createTransaction: async () => assert.fail(),
        }),
      { statusCode: 404 }
    );
  });

  it('confirms exactly once and revalidates edited transaction', async () => {
    const result = await proposal();
    let creates = 0;
    const saved = await confirmTransactionProposal(
      userA,
      result.toolResult.proposal.id,
      { ...transaction, amount: 46000 },
      {
        createTransaction: async (_u, value) => {
          creates++;
          return { id: 'tx-1', ...value };
        },
      }
    );
    assert.equal(saved.amount, 46000);
    assert.equal(creates, 1);

    await assert.rejects(
      () =>
        confirmTransactionProposal(userA, result.toolResult.proposal.id, transaction, {
          createTransaction: async () => ({}),
        }),
      { statusCode: 404 }
    );
  });

  it('rejects another user, expired proposals, and invalid confirmation data', async () => {
    const result = await proposal();

    await assert.rejects(
      () =>
        confirmTransactionProposal(userB, result.toolResult.proposal.id, transaction, {
          createTransaction: async () => ({}),
        }),
      { statusCode: 404 }
    );

    await assert.rejects(
      () =>
        confirmTransactionProposal(userA, result.toolResult.proposal.id, { ...transaction, amount: 0 }, {
          createTransaction: async () => ({}),
        }),
      { statusCode: 400 }
    );

    setProposalClockForTests(() => Date.now() + 11 * 60 * 1000);

    await assert.rejects(
      () =>
        confirmTransactionProposal(userA, result.toolResult.proposal.id, transaction, {
          createTransaction: async () => ({}),
        }),
      { statusCode: 400 }
    );
  });

  it('rejects zero, negative, and invalid-calendar amounts or dates at confirmation', async () => {
    const result = await proposal();
    const id = result.toolResult.proposal.id;

    await assert.rejects(
      () =>
        confirmTransactionProposal(userA, id, { ...transaction, amount: 0 }, {
          createTransaction: async () => ({}),
        }),
      { statusCode: 400 }
    );
    await assert.rejects(
      () =>
        confirmTransactionProposal(userA, id, { ...transaction, amount: -500000 }, {
          createTransaction: async () => ({}),
        }),
      { statusCode: 400 }
    );
    await assert.rejects(
      () =>
        confirmTransactionProposal(userA, id, { ...transaction, date: '2026-02-30' }, {
          createTransaction: async () => ({}),
        }),
      { statusCode: 400 }
    );
  });

  it('handles Gemini function calling and does not accept unknown tool names', async () => {
    await assert.rejects(
      () =>
        createTransactionProposalForUser(userA, 'x', {
          agentRunner: (_m, execute) => execute('delete_transaction', {}),
        }),
      { statusCode: 400 }
    );

    const calls = [];
    const ai = {
      models: {
        generateContent: async (request) => {
          calls.push(request);
          if (calls.length === 1) {
            return {
              functionCalls: [{ name: 'create_transaction', args: transaction }],
              candidates: [{ content: { role: 'model', parts: [] } }],
            };
          }
          return { text: 'Hãy xác nhận proposal.' };
        },
      },
    };

    const output = await runGeminiExpenseAgent(
      'Mua cà phê',
      async () => ({ proposal: { id: 'x' } }),
      { ai, agentType: 'create', today: '2026-10-25' }
    );

    assert.equal(output.toolName, 'create_transaction');
    assert.equal(calls[0].config.tools[0].functionDeclarations[0].name, CREATE_TRANSACTION_TOOL.name);
    assert.match(calls[0].config.systemInstruction, /thêm vào 500k/);
    assert.match(calls[0].config.systemInstruction, /internal transfer/);
  });

  it('allows the unified assistant to create a proposal without persisting it', async () => {
    const output = await runExpenseAssistantForUser(userA, 'Mua cà phê', {
      agentRunner: async (_message, execute) => ({
        answer: 'Hãy xác nhận.',
        toolName: 'create_transaction',
        toolResult: await execute('create_transaction', transaction),
      }),
    });
    assert.equal(output.toolName, 'create_transaction');
    assert.equal(output.toolResult.proposal.transaction.merchant, 'Highlands');
  });

  it('asks for clarification instead of creating a proposal when type is ambiguous or is an internal transfer', async () => {
    for (const message of ['thêm vào 500k', 'nạp tiền vào ví 500.000đ']) {
      const output = await createTransactionProposalForUser(userA, message, {
        agentRunner: async () => ({
          answer: 'Bạn muốn ghi là thu nhập hay chi tiêu?',
          toolName: null,
          toolResult: null,
        }),
      });
      assert.equal(output.toolName, null);
      assert.equal(output.toolResult, null);
    }
  });

  it('accepts Gemini-normalized 500k and 500.000đ as positive VND amounts', async () => {
    for (const amount of [500000, 500000]) {
      const output = await createTransactionProposalForUser(userA, 'thêm khoản chi', {
        agentRunner: async (_message, execute) => ({
          answer: 'Hãy xác nhận.',
          toolName: 'create_transaction',
          toolResult: await execute('create_transaction', { ...transaction, amount }),
        }),
      });
      assert.equal(output.toolResult.proposal.transaction.amount, 500000);
    }
  });
});
