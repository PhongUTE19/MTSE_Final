import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { orchestrateChat, orchestrateChatStream, ChatAssistantServiceError as ChatServiceError } from '../../server/src/features/chatAssistant/chatAssistant.service.js';
import {
  searchTransactionsForUser,
  getSpendingSummaryForUser,
  createTransactionProposalForUser,
  runExpenseAssistantForUser,
} from '../../server/src/features/expenseAssistant/expenseAssistant.service.js';
import { AppError } from '../../server/src/shared/errors/index.js';

describe('Central Chat Orchestrator Strategy & Normalization Suite', () => {
  describe('1. Default Strategy Selection & Normalized Contract', () => {
    it('selects agent strategy by default and normalizes response contract', async () => {
      const mockAgentRunner = async (user, message, options) => {
        return {
          answer: 'You spent 120,000 VND today.',
          toolName: 'get_spending_summary',
          toolResult: { total: 120000 },
        };
      };

      const result = await orchestrateChat('Today expenses', {
        agentRunner: mockAgentRunner,
        user: { id: 'u1' },
      });

      assert.equal(result.strategy, 'agent');
      assert.equal(result.answer, 'You spent 120,000 VND today.');
      assert.equal(result.toolName, 'get_spending_summary');
      assert.deepEqual(result.toolResult, { total: 120000 });
      assert.deepEqual(result.sources, []);
      assert.equal(result.retrieval, null);
    });

    it('preserves create_transaction draft toolResult in normalized response', async () => {
      const mockDraft = { amount: 50000 };
      const mockAgentRunner = async () => ({
        answer: 'Please confirm the transaction.',
        toolName: 'create_transaction',
        toolResult: { draftId: 'draft-123', draft: mockDraft },
      });

      const result = await orchestrateChat('Coffee 50k', {
        agentRunner: mockAgentRunner,
        user: { id: 'u1' },
      });

      assert.equal(result.strategy, 'agent');
      assert.equal(result.toolName, 'create_transaction');
      assert.equal(result.toolResult.draftId, 'draft-123');
      assert.deepEqual(result.toolResult.draft, mockDraft);
    });

    it('rejects empty or whitespace query at orchestration boundary', async () => {
      await assert.rejects(
        () => orchestrateChat(''),
        (err) => err instanceof ChatServiceError
      );
      await assert.rejects(
        () => orchestrateChat('   '),
        (err) => err instanceof ChatServiceError
      );
    });
  });

  describe('2. RAG Strategy Recoverability', () => {
    it('executes RAG workflow when explicitly selected via strategy: rag', async () => {
      const mockRagExecutor = async (query) => ({
        passedThreshold: true,
        sources: [{ id: 'doc1', title: 'Spending Policy', score: 0.9 }],
        retrieval: { similarityThreshold: 0.6, bestScore: 0.9 },
        prompt: `Prompt for ${query}`,
      });
      const mockLlmGenerator = async () => 'Keep receipts for all tax-deductible expenses.';

      const result = await orchestrateChat('Expense policy', {
        strategy: 'rag',
        ragExecutor: mockRagExecutor,
        llmGenerator: mockLlmGenerator,
      });

      assert.equal(result.strategy, 'rag');
      assert.equal(result.answer, 'Keep receipts for all tax-deductible expenses.');
      assert.equal(result.toolName, null);
      assert.equal(result.toolResult, null);
      assert.equal(result.sources.length, 1);
      assert.equal(result.sources[0].title, 'Spending Policy');
      assert.equal(result.retrieval.bestScore, 0.9);
    });
  });

  describe('3. Stream Orchestration Events', () => {
    it('emits metadata, delta, and done events in agent streaming mode', async () => {
      const events = [];
      const emit = (event, data) => events.push({ event, data });

      const mockAgentRunner = async () => ({
        answer: 'Hello, how can I help you?',
        toolName: null,
        toolResult: null,
      });

      await orchestrateChatStream('Hello', emit, {
        agentRunner: mockAgentRunner,
      });

      assert.equal(events.length, 3);
      assert.equal(events[0].event, 'metadata');
      assert.equal(events[0].data.strategy, 'agent');
      assert.equal(events[1].event, 'delta');
      assert.equal(events[1].data.text, 'Hello, how can I help you?');
      assert.equal(events[2].event, 'done');
      assert.equal(events[2].data.strategy, 'agent');
    });
  });

  describe('4. Embedding Call Isolation & Active Workflow Protection', () => {
    it('standard expense assistant requests route strictly to agent without invoking embeddings or RAG', async () => {
      let ragExecutorCalled = false;
      let embeddingCalls = 0;

      const mockRagExecutor = async () => {
        ragExecutorCalled = true;
        embeddingCalls++;
        return { passedThreshold: false, refusalText: 'rag called' };
      };

      let agentRunnerCalled = false;
      const mockAgentRunner = async () => {
        agentRunnerCalled = true;
        return {
          answer: 'You spent 50,000 VND on lunch.',
          toolName: 'get_spending_summary',
          toolResult: { total: 50000 },
        };
      };

      // When called with strategy: 'agent' (as configured in expenseAgent.controller)
      const res = await orchestrateChat('How much did I spend on lunch?', {
        strategy: 'agent',
        agentRunner: mockAgentRunner,
        ragExecutor: mockRagExecutor,
        user: { id: 'usr-1' },
      });

      assert.equal(agentRunnerCalled, true, 'Expense assistant must execute agent runner');
      assert.equal(ragExecutorCalled, false, 'Expense assistant must NEVER invoke RAG executor');
      assert.equal(embeddingCalls, 0, 'Expense assistant must generate zero embedding calls');
      assert.equal(res.strategy, 'agent');
      assert.deepEqual(res.sources, []);
      assert.equal(res.retrieval, null);
    });
  });

  describe('5. Expense Agent & Orchestrator Authentication Guards (P1-01)', () => {
    it('rejects unauthenticated default agent orchestration with HTTP 401 before invoking Gemini', async () => {
      for (const invalidUser of [undefined, null, {}, { id: 'u1' }, { token: 'tok-only' }]) {
        await assert.rejects(
          () => orchestrateChat('How much did I spend?', { strategy: 'agent', user: invalidUser }),
          (err) => err instanceof ChatServiceError && err.statusCode === 401
        );
        await assert.rejects(
          () => orchestrateChatStream('How much did I spend?', () => {}, { strategy: 'agent', user: invalidUser }),
          (err) => err instanceof ChatServiceError && err.statusCode === 401
        );
      }
    });

    it('rejects missing user id or token in all expenseAgent entrypoints with HTTP 401 before invoking agentRunner', async () => {
      const entrypoints = [
        runExpenseAssistantForUser,
        searchTransactionsForUser,
        getSpendingSummaryForUser,
        createTransactionProposalForUser,
      ];

      for (const fn of entrypoints) {
        for (const invalidUser of [undefined, null, {}, { id: 'u1' }, { token: 'tok-only' }]) {
          let runnerCalled = false;
          await assert.rejects(
            () =>
              fn(invalidUser, 'Show my expenses', {
                agentRunner: async () => {
                  runnerCalled = true;
                  return { answer: 'should not run', toolName: null, toolResult: null };
                },
              }),
            (err) => err instanceof AppError && err.statusCode === 401
          );
          assert.equal(runnerCalled, false, `${fn.name} must not call agentRunner when user is unauthenticated`);
        }
      }
    });
  });
});
