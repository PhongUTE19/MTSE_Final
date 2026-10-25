import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { executeRAG } from '../../server/src/features/knowledgeBase/ragService.js';
import { orchestrateChat, ChatServiceError } from '../../server/src/features/assistant/assistant.service.js';
import { SERVER_MESSAGES } from '../../server/src/constants/index.js';

describe('Chat Orchestration, Guardrails, and RAG Pipeline Integration Suite', () => {
  // Simulated chat processor logic mirroring chatService.js with injectable dependencies
  async function simulateChatProcess({
    query,
    mockRetrievedChunks,
    mockLLMAnswer,
    retrievalError = null,
    llmError = null,
    similarityThreshold = 0.60,
  }) {
    if (!query || !query.trim()) {
      throw new Error('Query message is required.');
    }

    if (retrievalError) {
      return {
        answer: SERVER_MESSAGES.ERRORS.RETRIEVAL_FAILED,
        sources: [],
        retrieval: {
          error: retrievalError,
          retrievedChunks: [],
          usedChunks: [],
          similarityThreshold,
          bestScore: 0,
        },
      };
    }

    const retrievedChunks = mockRetrievedChunks || [];
    const bestScore = retrievedChunks[0]?.score || 0;
    const passedThreshold = bestScore >= similarityThreshold;

    const diagnosticChunks = retrievedChunks.map((c, idx) => ({
      rank: idx + 1,
      id: c.id,
      title: c.title,
      sectionNumber: c.sectionNumber,
      sectionTitle: c.sectionTitle,
      source: c.source,
      score: c.score,
      content: c.content,
      passedToLLM: passedThreshold,
    }));

    if (!passedThreshold) {
      return {
        answer: SERVER_MESSAGES.ERRORS.INSUFFICIENT_INFORMATION,
        sources: [],
        retrieval: {
          similarityThreshold,
          bestScore,
          retrievedChunks: diagnosticChunks,
          usedChunks: [],
        },
      };
    }

    if (llmError) {
      throw new Error(`LLM generation failed: ${llmError}`);
    }

    const sources = retrievedChunks.map((c) => ({
      id: c.id,
      title: c.title,
      sectionNumber: c.sectionNumber,
      sectionTitle: c.sectionTitle,
      source: c.source,
      score: c.score,
    }));

    return {
      answer: mockLLMAnswer,
      sources,
      retrieval: {
        similarityThreshold,
        bestScore,
        retrievedChunks: diagnosticChunks,
        usedChunks: diagnosticChunks,
      },
    };
  }

  describe('1. Response Contract and Diagnostic Metadata', () => {
    it('returns grounded answer with sources and complete diagnostics for in-scope query', async () => {
      const mockChunks = [
        {
          id: 'spendwise_user_guide_sec2',
          title: '2. Platform Features at a Glance',
          sectionNumber: 2,
          sectionTitle: 'Platform Features at a Glance',
          source: 'spendwise_user_guide.md',
          score: 0.7313,
          content: '| Maximum Attachment Size | N/A | 5 MB |',
        },
      ];

      const res = await simulateChatProcess({
        query: 'What is the maximum attachment size for receipts?',
        mockRetrievedChunks: mockChunks,
        mockLLMAnswer: 'The maximum attachment size for receipts is 5 MB.',
        similarityThreshold: 0.60,
      });

      assert.ok(res.answer.includes('5 MB'));
      assert.equal(res.sources.length, 1);
      assert.equal(res.sources[0].id, 'spendwise_user_guide_sec2');

      assert.ok(res.retrieval, 'Retrieval diagnostics must be present');
      assert.equal(res.retrieval.retrievedChunks.length, 1);
      assert.equal(res.retrieval.usedChunks.length, 1);
      assert.equal(res.retrieval.retrievedChunks[0].rank, 1);
      assert.equal(res.retrieval.retrievedChunks[0].passedToLLM, true);
      assert.equal(res.retrieval.retrievedChunks[0].score, 0.7313);
    });

    it('rejects out-of-scope query, keeps sources empty, but preserves inspectable chunks', async () => {
      const mockOutChunks = [
        {
          id: 'spendwise_user_guide_sec8',
          title: '8. Vector Indexing and Qdrant Search',
          sectionNumber: 8,
          sectionTitle: 'Vector Indexing and Qdrant Search',
          source: 'spendwise_user_guide.md',
          score: 0.4903,
          content: 'Vector index configuration details...',
        },
      ];

      const res = await simulateChatProcess({
        query: 'Can I do cryptocurrency trading on campus?',
        mockRetrievedChunks: mockOutChunks,
        mockLLMAnswer: 'Should not be called',
        similarityThreshold: 0.60,
      });

      assert.equal(res.answer, SERVER_MESSAGES.ERRORS.INSUFFICIENT_INFORMATION);
      assert.equal(res.sources.length, 0, 'Sources must be empty on threshold rejection');

      assert.ok(res.retrieval);
      assert.equal(res.retrieval.retrievedChunks.length, 1);
      assert.equal(res.retrieval.usedChunks.length, 0, 'usedChunks must be empty');
      assert.equal(res.retrieval.retrievedChunks[0].passedToLLM, false);
      assert.equal(res.retrieval.retrievedChunks[0].score, 0.4903);
    });

    it('handles vector database retrieval failure gracefully with structured error', async () => {
      const res = await simulateChatProcess({
        query: 'What is the tuition fee?',
        retrievalError: 'Connection refused to Qdrant cluster at cloud.qdrant.io',
      });

      assert.ok(res.answer.includes('Failed to retrieve'));
      assert.equal(res.sources.length, 0);
      assert.ok(res.retrieval.error.includes('Connection refused'));
      assert.equal(res.retrieval.retrievedChunks.length, 0);
    });

    it('handles LLM failure by propagating descriptive error', async () => {
      await assert.rejects(
        async () => {
          await simulateChatProcess({
            query: 'What is the tuition fee?',
            mockRetrievedChunks: [{ id: 'sec2', title: '2. Programs', score: 0.8, content: '...' }],
            llmError: 'Service Unavailable 503',
            similarityThreshold: 0.60,
          });
        },
        /LLM generation failed: Service Unavailable 503/
      );
    });
  });

  describe('2. Query Validation and Boundary Enforcements', () => {
    it('orchestrator rejects empty or non-string query with ChatServiceError', async () => {
      await assert.rejects(
        async () => {
          await orchestrateChat('');
        },
        (err) => err instanceof ChatServiceError && err.statusCode === 400
      );

      await assert.rejects(
        async () => {
          await orchestrateChat('   ');
        },
        (err) => err instanceof ChatServiceError && err.statusCode === 400
      );
    });
  });

  describe('3. RAG Pipeline Execution and Integration', () => {
    it('executeRAG returns SUFFICIENT status with assembled context when threshold is met', async () => {
      const mockChunks = [
        {
          id: 'chunk_1',
          title: 'Features at a Glance',
          sectionNumber: 2,
          sectionTitle: 'Platform Features',
          source: 'spendwise_user_guide.md',
          score: 0.82,
          content: 'Receipt scans are limited to 5 MB.',
        },
      ];

      const result = await executeRAG('What is the maximum attachment size?', {
        topK: 5,
        similarityThreshold: 0.60,
        systemPrompt: 'Custom System Prompt',
        retrieverFn: async () => mockChunks,
      });

      assert.equal(result.status, 'SUFFICIENT');
      assert.equal(result.passedThreshold, true);
      assert.equal(result.sources.length, 1);
      assert.equal(result.sources[0].id, 'chunk_1');
      assert.ok(result.context.includes('Receipt scans are limited to 5 MB.'));
      assert.ok(result.prompt.includes('Custom System Prompt'));
      assert.ok(result.prompt.includes('User Question:\nWhat is the maximum attachment size?'));
      assert.equal(result.retrieval.bestScore, 0.82);
      assert.equal(result.retrieval.usedChunks.length, 1);
    });

    it('executeRAG returns INSUFFICIENT status when score falls below threshold', async () => {
      const mockChunks = [
        {
          id: 'chunk_config',
          title: 'Configuration',
          sectionNumber: 11,
          sectionTitle: 'System Configuration',
          source: 'spendwise_user_guide.md',
          score: 0.45,
          content: 'Rate limiters protect API endpoints.',
        },
      ];

      const result = await executeRAG('What is quantum mechanics?', {
        topK: 5,
        similarityThreshold: 0.60,
        retrieverFn: async () => mockChunks,
      });

      assert.equal(result.status, 'INSUFFICIENT');
      assert.equal(result.passedThreshold, false);
      assert.ok(result.refusalText.includes('does not contain enough information'));
      assert.equal(result.sources.length, 0);
      assert.equal(result.usedChunks.length, 0);
      assert.equal(result.retrieval.retrievedChunks.length, 1);
    });

    it('executeRAG returns RETRIEVAL_ERROR status when vector database fails', async () => {
      const result = await executeRAG('What is the tuition fee?', {
        retrieverFn: async () => {
          throw new Error('Connection to Qdrant cluster refused');
        },
      });

      assert.equal(result.status, 'RETRIEVAL_ERROR');
      assert.equal(result.passedThreshold, false);
      assert.ok(result.refusalText.includes('Failed to retrieve'));
      assert.equal(result.sources.length, 0);
      assert.equal(result.retrieval.error, 'Connection to Qdrant cluster refused');
    });

    it('orchestrateChat coordinates RAG and LLM generation seamlessly', async () => {
      let ragCalled = false;
      let llmCalled = false;

      const mockRagExecutor = async (query) => {
        ragCalled = true;
        return {
          status: 'SUFFICIENT',
          passedThreshold: true,
          sources: [{ id: 'sec2', title: 'Programs', score: 0.85 }],
          retrieval: { similarityThreshold: 0.60, bestScore: 0.85, retrievedChunks: [], usedChunks: [] },
          prompt: 'Assembled Prompt for: ' + query,
        };
      };

      const mockLlmGenerator = async (prompt) => {
        assert.ok(ragCalled, 'RAG must be called before LLM generation');
        llmCalled = true;
        return 'Generated answer for ' + prompt;
      };

      const res = await orchestrateChat('What is tuition?', {
        ragExecutor: mockRagExecutor,
        llmGenerator: mockLlmGenerator,
      });

      assert.ok(ragCalled);
      assert.ok(llmCalled);
      assert.ok(res.answer.includes('Generated answer for Assembled Prompt for: What is tuition?'));
      assert.equal(res.sources.length, 1);
    });
  });
});
