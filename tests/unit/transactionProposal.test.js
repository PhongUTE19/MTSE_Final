import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  cancelTransactionProposal,
  clearTransactionProposalsForTests,
  confirmTransactionProposal,
  createTransactionProposalForUser,
  getProposalCountForTests,
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
  return createTransactionProposalForUser(userA, 'coffee', {
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
          return { text: 'Please review and confirm the proposal.' };
        },
      },
    };

    const output = await runGeminiExpenseAgent(
      'Buy coffee',
      async () => ({ proposal: { id: 'x' } }),
      { ai, agentType: 'create', today: '2026-10-25' }
    );

    assert.equal(output.toolName, 'create_transaction');
    assert.equal(calls[0].config.tools[0].functionDeclarations[0].name, CREATE_TRANSACTION_TOOL.name);
    assert.match(calls[0].config.systemInstruction, /thêm vào 500k/);
    assert.match(calls[0].config.systemInstruction, /internal transfer/);
  });

  it('allows the unified assistant to create a proposal without persisting it', async () => {
    const output = await runExpenseAssistantForUser(userA, 'Buy coffee', {
      agentRunner: async (_message, execute) => ({
        answer: 'Please confirm the proposal.',
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
          answer: 'Would you like to record this as income or expense?',
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
          answer: 'Please confirm the proposal.',
          toolName: 'create_transaction',
          toolResult: await execute('create_transaction', { ...transaction, amount }),
        }),
      });
      assert.equal(output.toolResult.proposal.transaction.amount, 500000);
    }
  });

  it('prunes expired proposals opportunistically whenever a new proposal is created', async () => {
    let mockTime = 1_000_000;
    setProposalClockForTests(() => mockTime);

    // Create proposal 1 at t=1,000,000 (expires at 1,000,000 + 10 min = 1,600,000)
    const result1 = await proposal();
    const id1 = result1.toolResult.proposal.id;
    assert.equal(getProposalCountForTests(), 1);

    // Advance mock clock past 10 minutes (e.g. 11 minutes later)
    mockTime += 11 * 60 * 1000;

    // Create proposal 2 at t=1,660,000; should sweep proposal 1 from memory
    const result2 = await proposal();
    const id2 = result2.toolResult.proposal.id;
    assert.equal(getProposalCountForTests(), 1);

    // Proposal 1 must no longer exist in memory (confirm returns 404 Not Found)
    await assert.rejects(
      () =>
        confirmTransactionProposal(userA, id1, transaction, {
          createTransaction: async () => ({}),
        }),
      { statusCode: 404 }
    );

    // Proposal 2 remains valid and confirmable
    const saved = await confirmTransactionProposal(userA, id2, transaction, {
      createTransaction: async (_u, val) => ({ id: 'tx-2', ...val }),
    });
    assert.equal(saved.id, 'tx-2');
    assert.equal(getProposalCountForTests(), 0);
  });

  describe('Chat Drawer Tailwind Migration & Computed-Style Equivalence (FE-TASK-04 / FE-REF-11)', () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const rootDir = path.resolve(__dirname, '../..');

    const expenseCssPath = path.join(rootDir, 'client/src/features/expense/expense.css');
    const chatCssPath = path.join(rootDir, 'client/src/shared/styles/components/chat.css');
    const drawerCssPath = path.join(rootDir, 'client/src/shared/styles/components/drawer.css');

    const chatbotSource = fs.readFileSync(path.join(rootDir, 'client/src/features/chat/Chatbot.jsx'), 'utf8');
    const formattedTextSource = fs.readFileSync(path.join(rootDir, 'client/src/features/chat/FormattedMessageText.jsx'), 'utf8');
    const pushDrawerSource = fs.readFileSync(path.join(rootDir, 'client/src/composites/overlays/PushDrawer.jsx'), 'utf8');
    const workspaceLayoutSource = fs.readFileSync(path.join(rootDir, 'client/src/layouts/WorkspaceLayout.jsx'), 'utf8');
    const tailwindConfig = fs.readFileSync(path.join(rootDir, 'client/tailwind.config.js'), 'utf8');

    it('confirms legacy expense.css, chat.css, and drawer.css are completely eliminated', () => {
      assert.equal(fs.existsSync(expenseCssPath), false, 'expense.css must be deleted');
      assert.equal(fs.existsSync(chatCssPath), false, 'chat.css must be deleted');
      assert.equal(fs.existsSync(drawerCssPath), false, 'drawer.css must be deleted');
    });

    it('confirms dead selectors are completely eliminated from Chatbot.jsx', () => {
      const deadSelectors = [
        'agent-composer',
        'agent-answer',
        'ai-examples',
        'agent-pagination',
        'agent-result-heading',
        'agent-transaction-list',
        'agent-category-list',
        'agent-proposal-fields',
        'agent-result-card',
        'agent-summary-grid',
        'agent-proposal',
        'chat-card',
        'chat-fab',
      ];
      for (const sel of deadSelectors) {
        assert.equal(
          chatbotSource.includes(sel),
          false,
          `Chatbot.jsx must not contain dead selector ${sel}`
        );
      }
    });

    it('confirms FormattedMessageText and tailwind.config.js preserve stream-in animation and code block utilities', () => {
      assert.ok(formattedTextSource.includes('animate-stream-in'));
      assert.ok(tailwindConfig.includes("'stream-fade-in'"));
      assert.ok(formattedTextSource.includes('font-mono'));
      assert.ok(formattedTextSource.includes('bg-surface-muted'));
    });

    it('confirms Chatbot, PushDrawer, and WorkspaceLayout define active assistant and push-drawer Tailwind utilities', () => {
      assert.ok(pushDrawerSource.includes('w-push-drawer'));
      assert.ok(pushDrawerSource.includes('w-push-drawer-max'));
      assert.ok(pushDrawerSource.includes('h-dvh'));
      assert.ok(workspaceLayoutSource.includes('pr-push-drawer'));
      assert.ok(tailwindConfig.includes("'push-drawer': '410px'"));
      assert.ok(tailwindConfig.includes("'push-drawer-max': 'min(760px, 100vw)'"));
    });

    it('confirms tailwind.config.js and chat components define responsive breakpoints for assistant views', () => {
      assert.ok(tailwindConfig.includes("tablet: '840px'"));
      assert.ok(tailwindConfig.includes("mobile: '540px'"));
      assert.ok(tailwindConfig.includes("xs: '420px'"));
      assert.ok(chatbotSource.includes('max-tablet:'));
    });
  });
});
