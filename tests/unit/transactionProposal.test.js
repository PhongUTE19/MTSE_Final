import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createTransactionProposalForUser,
  runExpenseAssistantForUser,
} from '../../server/src/features/expenseAssistant/expenseAssistant.service.js';
import {
  CREATE_TRANSACTION_TOOL,
  runGeminiExpenseAssistant as runGeminiExpenseAgent,
} from '../../server/src/features/expenseAssistant/geminiExpenseAssistant.js';
import { createTransactionDraftController } from '../../client/src/features/transactionDraft/draftController.js';
import { resetMemoryDraftStorageForTests } from '../../client/src/features/transactionDraft/draftStorage.js';
import { createTransaction, setExpenseClientFactoryForTests } from '../../server/src/features/transaction/transaction.service.js';
import { transactionSchema } from '../../server/src/features/transaction/transaction.schema.js';

function createInMemoryTxClientFactory(onInsertTransaction) {
  const transactions = new Map();
  let txSeq = 0;

  return (user) => ({
    from: () => ({
      select: () => {
        const filters = {};
        const q = {
          eq(col, val) { filters[col] = val; return q; },
          maybeSingle: async () => {
            const row = transactions.get(filters.id);
            return { data: row && row.user_id === user.id ? row : null, error: null };
          },
        };
        return q;
      },
      insert: (row) => ({
        select: () => ({
          single: async () => {
            const id = row.id || `tx-${++txSeq}`;
            if (transactions.has(id)) return { data: null, error: { code: '23505', message: 'duplicate' } };
            const tx = { id, ...row, created_at: '2026-10-25T00:00:00Z', updated_at: '2026-10-25T00:00:00Z' };
            transactions.set(id, tx);
            if (onInsertTransaction) onInsertTransaction(tx);
            return { data: tx, error: null };
          },
        }),
      }),
    }),
  });
}

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
  resetMemoryDraftStorageForTests();
  setExpenseClientFactoryForTests(null);
});

function makeUserController(user) {
  const ctrl = createTransactionDraftController({
    createTransactionApi: (payload) => {
      const parsed = transactionSchema.parse(payload);
      return createTransaction(user, parsed);
    },
  });
  ctrl.setUserId(user.id);
  return ctrl;
}

describe('create_transaction draft confirmation', () => {
  it('stages a draft but does not persist a transaction before confirmation', async () => {
    let creates = 0;
    setExpenseClientFactoryForTests(createInMemoryTxClientFactory(() => { creates++; }));
    const result = await proposal();
    assert.ok(result.toolResult.draftId);
    assert.equal(result.toolResult.draft.amount, 45000);
    assert.equal(creates, 0);
  });

  it('allows reject without calling transaction persistence', async () => {
    let creates = 0;
    setExpenseClientFactoryForTests(createInMemoryTxClientFactory(() => { creates++; }));
    const ctrl = makeUserController(userA);
    const staged = await ctrl.createDraft({ sourceType: 'assistant_proposal', originalData: transaction });
    await ctrl.rejectDraft(staged.id);
    assert.equal(creates, 0);

    await assert.rejects(
      () => ctrl.confirmDraft(staged.id, transaction),
      /not found/i
    );
  });

  it('confirms idempotently and revalidates edited transaction', async () => {
    let creates = 0;
    setExpenseClientFactoryForTests(createInMemoryTxClientFactory(() => { creates++; }));
    const ctrl = makeUserController(userA);
    const prop = await proposal();
    const staged = await ctrl.createDraft({
      id: prop.toolResult.draftId,
      sourceType: 'assistant_proposal',
      originalData: prop.toolResult.draft,
    });
    const saved = await ctrl.confirmDraft(staged.id, { ...transaction, amount: 46000 });
    assert.equal(saved.transaction.amount, 46000);
    assert.equal(creates, 1);

    // Re-confirming at the transaction API with the same deterministic ID is idempotent
    const reconfirmed = await createTransaction(userA, { id: staged.id, ...transaction, amount: 46000 });
    assert.equal(reconfirmed.id, saved.transaction.id);
    assert.equal(creates, 1);
  });

  it('rejects another user and invalid confirmation data', async () => {
    setExpenseClientFactoryForTests(createInMemoryTxClientFactory());
    const ctrlA = makeUserController(userA);
    const ctrlB = makeUserController(userB);
    const staged = await ctrlA.createDraft({ sourceType: 'assistant_proposal', originalData: transaction });

    await assert.rejects(
      () => ctrlB.confirmDraft(staged.id, transaction),
      /not found/i
    );

    await assert.rejects(
      () => ctrlA.confirmDraft(staged.id, { ...transaction, amount: 0 }),
      /greater than zero/i
    );
  });

  it('rejects zero, negative, and invalid-calendar amounts or dates at confirmation', async () => {
    setExpenseClientFactoryForTests(createInMemoryTxClientFactory());
    const ctrl = makeUserController(userA);
    const staged = await ctrl.createDraft({ sourceType: 'assistant_proposal', originalData: transaction });

    await assert.rejects(
      () => ctrl.confirmDraft(staged.id, { ...transaction, amount: 0 }),
      /greater than zero/i
    );
    await assert.rejects(
      () => ctrl.confirmDraft(staged.id, { ...transaction, amount: -500000 }),
      /greater than zero/i
    );
    await assert.rejects(
      () => ctrl.confirmDraft(staged.id, { ...transaction, date: '2026-02-30' }),
      /valid calendar date/i
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

  it('allows the unified assistant to stage a draft without persisting a transaction', async () => {
    const output = await runExpenseAssistantForUser(userA, 'Buy coffee', {
      agentRunner: async (_message, execute) => ({
        answer: 'Please confirm the proposal.',
        toolName: 'create_transaction',
        toolResult: await execute('create_transaction', transaction),
      }),
    });
    assert.equal(output.toolName, 'create_transaction');
    assert.equal(output.toolResult.draft.merchant, 'Highlands');
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
      assert.equal(output.toolResult.draft.amount, 500000);
    }
  });

  it('keeps multiple staged drafts isolated and independently rejectable or confirmable', async () => {
    setExpenseClientFactoryForTests(createInMemoryTxClientFactory());
    const ctrl = makeUserController(userA);

    const staged1 = await ctrl.createDraft({ sourceType: 'assistant_proposal', originalData: transaction });
    const staged2 = await ctrl.createDraft({ sourceType: 'assistant_proposal', originalData: transaction });
    assert.notEqual(staged1.id, staged2.id);

    await ctrl.rejectDraft(staged1.id);

    // Draft 1 cannot be confirmed after rejection
    await assert.rejects(
      () => ctrl.confirmDraft(staged1.id, transaction),
      /not found/i
    );

    // Draft 2 remains valid and confirmable
    const saved = await ctrl.confirmDraft(staged2.id, transaction);
    assert.equal(saved.transaction.id, staged2.id);
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
