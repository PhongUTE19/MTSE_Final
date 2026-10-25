import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { orchestrateChat, orchestrateChatStream, ChatServiceError } from '../../server/src/features/assistant/assistant.service.js';

describe('Central Chat Orchestrator Strategy & Normalization Suite', () => {
  describe('1. Default Strategy Selection & Normalized Contract', () => {
    it('selects agent strategy by default and normalizes response contract', async () => {
      const mockAgentRunner = async (user, message, options) => {
        return {
          answer: 'Bạn đã chi 120.000 VND hôm nay.',
          toolName: 'get_spending_summary',
          toolResult: { total: 120000 },
        };
      };

      const result = await orchestrateChat('Chi tiêu hôm nay', {
        agentRunner: mockAgentRunner,
        user: { id: 'u1' },
      });

      assert.equal(result.strategy, 'agent');
      assert.equal(result.answer, 'Bạn đã chi 120.000 VND hôm nay.');
      assert.equal(result.toolName, 'get_spending_summary');
      assert.deepEqual(result.toolResult, { total: 120000 });
      assert.equal(result.proposal, null);
      assert.deepEqual(result.sources, []);
      assert.equal(result.retrieval, null);
    });

    it('extracts proposal shortcut when create_transaction proposal is generated', async () => {
      const mockProposal = { id: 'prop-123', transaction: { amount: 50000 } };
      const mockAgentRunner = async () => ({
        answer: 'Vui lòng xác nhận giao dịch.',
        toolName: 'create_transaction',
        toolResult: { proposal: mockProposal },
      });

      const result = await orchestrateChat('Cà phê 50k', {
        agentRunner: mockAgentRunner,
        user: { id: 'u1' },
      });

      assert.equal(result.strategy, 'agent');
      assert.equal(result.toolName, 'create_transaction');
      assert.deepEqual(result.proposal, mockProposal);
      assert.deepEqual(result.toolResult.proposal, mockProposal);
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
        sources: [{ id: 'doc1', title: 'Quy chế', score: 0.9 }],
        retrieval: { similarityThreshold: 0.6, bestScore: 0.9 },
        prompt: `Prompt for ${query}`,
      });
      const mockLlmGenerator = async () => 'Sinh viên cần tích lũy tối thiểu 120 tín chỉ.';

      const result = await orchestrateChat('Điều kiện tốt nghiệp', {
        strategy: 'rag',
        ragExecutor: mockRagExecutor,
        llmGenerator: mockLlmGenerator,
      });

      assert.equal(result.strategy, 'rag');
      assert.equal(result.answer, 'Sinh viên cần tích lũy tối thiểu 120 tín chỉ.');
      assert.equal(result.toolName, null);
      assert.equal(result.toolResult, null);
      assert.equal(result.proposal, null);
      assert.equal(result.sources.length, 1);
      assert.equal(result.sources[0].title, 'Quy chế');
      assert.equal(result.retrieval.bestScore, 0.9);
    });
  });

  describe('3. Stream Orchestration Events', () => {
    it('emits metadata, delta, and done events in agent streaming mode', async () => {
      const events = [];
      const emit = (event, data) => events.push({ event, data });

      const mockAgentRunner = async () => ({
        answer: 'Chào bạn, tôi có thể giúp gì?',
        toolName: null,
        toolResult: null,
      });

      await orchestrateChatStream('Xin chào', emit, {
        agentRunner: mockAgentRunner,
      });

      assert.equal(events.length, 3);
      assert.equal(events[0].event, 'metadata');
      assert.equal(events[0].data.strategy, 'agent');
      assert.equal(events[1].event, 'delta');
      assert.equal(events[1].data.text, 'Chào bạn, tôi có thể giúp gì?');
      assert.equal(events[2].event, 'done');
      assert.equal(events[2].data.strategy, 'agent');
    });
  });
});
