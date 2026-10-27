import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RECEIPT_PROMPT_ID,
  RECEIPT_PROMPT_VERSION,
  getReceiptPrompt,
  getReceiptPromptDetails,
} from '../../server/src/features/expenses/receiptPrompt.js';
import {
  EXPENSE_AGENT_PROMPT_IDS,
  EXPENSE_AGENT_PROMPT_VERSION,
  getExpenseAgentPrompt,
  renderExpenseAgentPrompt,
  computeExpenseAgentPromptVersion,
  systemInstruction,
  summarySystemInstruction,
  createSystemInstruction,
  assistantSystemInstruction,
  formatConversationContext,
} from '../../server/src/features/expenseAgent/expenseAgentPrompt.js';
import {
  RAG_PROMPT_IDS,
  RAG_PROMPT_VERSION,
  getRagPrompt,
  getRagPromptDetails,
  renderRagPrompt,
  computeRagPromptVersion,
} from '../../server/src/features/knowledgeBase/ragPrompt.js';
import {
  buildGroundedPrompt,
  buildGroundedPromptDetails,
} from '../../server/src/features/knowledgeBase/promptBuilder.js';
import { orchestrateRAGChat } from '../../server/src/features/assistant/assistant.service.js';
import { runGeminiExpenseAgent } from '../../server/src/features/expenseAgent/geminiExpenseAgent.js';
import { getRecentUsageRecords } from '../../server/src/features/analytics/index.js';

describe('Version-Controlled Prompt Management for Approved AI Capabilities', () => {
  describe('1. Multimodal Receipt Understanding Prompt Management', () => {
    it('defines stable ID and explicit active version for receipt extraction', () => {
      assert.equal(RECEIPT_PROMPT_ID, 'receipt_extraction');
      assert.equal(RECEIPT_PROMPT_VERSION, 'receipt-v3');
    });

    it('loads active receipt prompt from Git-tracked versioned file', () => {
      const prompt = getReceiptPrompt();
      assert.ok(prompt.length > 50);
      assert.match(prompt, /documentType/);
      assert.match(prompt, /Classify a non-receipt image as documentType "unknown"/);
      assert.match(prompt, /Food & dining/);
    });

    it('returns complete prompt details with deterministic version and content hash', () => {
      const details = getReceiptPromptDetails();
      assert.equal(details.id, 'receipt_extraction');
      assert.equal(details.baseVersion, 'receipt-v3');
      assert.ok(details.version.startsWith('receipt-v3:'));
      assert.equal(details.version.split(':').length, 2);
    });

    it('supports prior prompt versions and falls back gracefully when file is missing', () => {
      const v1 = getReceiptPrompt('receipt-v1');
      assert.match(v1, /Extract the receipt into the requested JSON schema/);

      // Requesting an unknown version falls back to active version safely
      const fallback = getReceiptPrompt('receipt-v999');
      assert.match(fallback, /documentType/);
    });

    it('rejects invalid receipt prompt version format', () => {
      assert.throws(() => getReceiptPrompt('invalid-version'), /Invalid receipt prompt version/);
    });
  });

  describe('2. Tool-Using Expense Agent Prompt Management', () => {
    it('defines stable IDs for all approved expense-agent workflows', () => {
      assert.equal(EXPENSE_AGENT_PROMPT_IDS.SEARCH, 'expense_agent_search');
      assert.equal(EXPENSE_AGENT_PROMPT_IDS.SUMMARY, 'expense_agent_summary');
      assert.equal(EXPENSE_AGENT_PROMPT_IDS.CREATE, 'expense_agent_create');
      assert.equal(EXPENSE_AGENT_PROMPT_IDS.ASSISTANT, 'expense_agent_assistant');
      assert.equal(EXPENSE_AGENT_PROMPT_IDS.CONTEXT, 'expense_agent_context');
    });

    it('loads and interpolates {{today}} in search prompt from Git-tracked file', () => {
      const today = '2026-10-26';
      const prompt = getExpenseAgentPrompt('search', { today });

      assert.equal(prompt.id, EXPENSE_AGENT_PROMPT_IDS.SEARCH);
      assert.equal(prompt.baseVersion, 'v1');
      assert.ok(prompt.text.includes(`Today is ${today}.`));
      assert.ok(!prompt.text.includes('{{today}}'));
      assert.match(prompt.text, /search_transactions/);
      assert.match(prompt.text, /hôm qua/);
    });

    it('loads spending summary prompt with time zone and category aggregation rules', () => {
      const today = '2026-10-26';
      const prompt = getExpenseAgentPrompt('summary', { today });

      assert.equal(prompt.id, EXPENSE_AGENT_PROMPT_IDS.SUMMARY);
      assert.ok(prompt.text.includes(`Today is ${today} in Asia/Ho_Chi_Minh.`));
      assert.match(prompt.text, /get_spending_summary/);
      assert.match(prompt.text, /tuần này/);
    });

    it('loads transaction proposal prompt requiring explicit user confirmation rules', () => {
      const today = '2026-10-26';
      const prompt = getExpenseAgentPrompt('create', { today });

      assert.equal(prompt.id, EXPENSE_AGENT_PROMPT_IDS.CREATE);
      assert.match(prompt.text, /create_transaction/);
      assert.match(prompt.text, /The tool only creates a proposal, never a saved transaction/);
      assert.match(prompt.text, /500k/);
      assert.match(prompt.text, /500000/);
    });

    it('loads unified assistant prompt orchestrating multi-tool selection', () => {
      const today = '2026-10-26';
      const prompt = getExpenseAgentPrompt('assistant', { today });

      assert.equal(prompt.id, EXPENSE_AGENT_PROMPT_IDS.ASSISTANT);
      assert.match(prompt.text, /search_transactions/);
      assert.match(prompt.text, /get_spending_summary/);
      assert.match(prompt.text, /create_transaction/);
      assert.match(prompt.text, /clearly tell the user to review and confirm it/);
    });

    it('provides backward-compatible helper functions matching previous contracts', () => {
      const today = '2026-10-26';
      assert.match(systemInstruction(today), /search_transactions/);
      assert.match(summarySystemInstruction(today), /get_spending_summary/);
      assert.match(createSystemInstruction(today), /create_transaction/);
      assert.match(assistantSystemInstruction(today), /search_transactions/);
    });

    it('formats conversation context with versioned template or passes raw message if empty', () => {
      const singleTurn = formatConversationContext('', 'Hello there');
      assert.equal(singleTurn, 'Hello there');

      const multiTurn = formatConversationContext('User: Hi\nAssistant: Hello', 'What did I spend?');
      assert.match(multiTurn, /Conversation context:\nUser: Hi\nAssistant: Hello/);
      assert.match(multiTurn, /Current user request: What did I spend\?/);
    });
  });

  describe('3. Version Resolution, Deterministic Hashing & Overrides', () => {
    it('computes deterministic version combining prompt ID, base version, and content hash', () => {
      const version = computeExpenseAgentPromptVersion('expense_agent_search', 'v1', 'instruction');
      assert.ok(version.startsWith('expense_agent_search:v1:'));
      assert.equal(version.split(':').length, 3);
    });

    it('guarantees prompt version changes when effective prompt content changes', () => {
      const p1 = getExpenseAgentPrompt('search', { today: '2026-10-01' });
      const p2 = getExpenseAgentPrompt('search', { today: '2026-10-02' });

      assert.notEqual(p1.version, p2.version, 'Different effective prompt content must yield different versions');
    });

    it('guarantees identical prompt version when effective content is unchanged', () => {
      const p1 = getExpenseAgentPrompt('search', { today: '2026-10-26' });
      const p2 = getExpenseAgentPrompt('search', { today: '2026-10-26' });

      assert.equal(p1.version, p2.version);
    });

    it('distinguishes source-controlled default from runtime override', () => {
      const defaultPrompt = getExpenseAgentPrompt('search', { today: '2026-10-26' });
      assert.equal(defaultPrompt.isOverride, false);

      const overridden = getExpenseAgentPrompt('search', {
        override: 'Custom override instruction for {{today}}',
        today: '2026-10-26',
      });
      assert.equal(overridden.isOverride, true);
      assert.equal(overridden.text, 'Custom override instruction for 2026-10-26');
    });

    it('falls back to default version when non-existent version is requested', () => {
      const fallbackPrompt = getExpenseAgentPrompt('search', {
        version: 'v999',
        today: '2026-10-26',
      });
      assert.equal(fallbackPrompt.baseVersion, 'v1');
      assert.match(fallbackPrompt.text, /search_transactions/);
    });

    it('renderExpenseAgentPrompt handles both {{key}} and ${key} syntax and edge cases', () => {
      assert.equal(renderExpenseAgentPrompt('Today: {{today}}', { today: '2026-10-26' }), 'Today: 2026-10-26');
      assert.equal(renderExpenseAgentPrompt('Today: ${today}', { today: '2026-10-26' }), 'Today: 2026-10-26');
      assert.equal(renderExpenseAgentPrompt('Static text', {}), 'Static text');
      assert.equal(renderExpenseAgentPrompt(null), '');
    });
  });

  describe('4. Request Execution & Telemetry Integration', () => {
    it('makes promptVersion available in agent result and telemetry records without logging private data', async () => {
      const fakeAi = {
        models: {
          generateContent: async () => ({
            text: 'Here is what you spent.',
            usageMetadata: { promptTokenCount: 25, candidatesTokenCount: 15, totalTokenCount: 40 },
          }),
        },
      };

      const startCount = getRecentUsageRecords(50).filter((r) => r.feature === 'expense_agent').length;

      const result = await runGeminiExpenseAgent('help search', async () => {}, {
        ai: fakeAi,
        today: '2026-10-26',
        agentType: 'search',
      });

      assert.equal(result.promptId, 'expense_agent_search');
      assert.equal(result.promptVersion, 'v1');
      assert.ok(result.promptHash && result.promptHash.length === 64, 'Agent result must expose promptHash');

      const records = getRecentUsageRecords(50).filter((r) => r.feature === 'expense_agent');
      assert.equal(records.length, startCount + 1);

      const latest = records[records.length - 1];
      assert.equal(latest.promptId, 'expense_agent_search');
      assert.equal(latest.promptVersion, 'v1');
      assert.equal(latest.promptHash, result.promptHash);
      assert.equal(latest.prompt, undefined, 'Telemetry must not log raw prompt content');
    });
  });

  describe('5. RAG / Knowledge Base Grounded Prompt Management', () => {
    it('defines stable IDs and version for knowledge base prompts', () => {
      assert.equal(RAG_PROMPT_IDS.GROUNDED, 'rag_grounded');
      assert.equal(RAG_PROMPT_IDS.SYSTEM, 'rag_system');
      assert.equal(RAG_PROMPT_VERSION, 'v1');
    });

    it('loads grounded prompt from version-controlled file and renders context and query delimiters', () => {
      const details = getRagPromptDetails('grounded', {
        variables: {
          systemPrompt: 'You are SpendWise Assistant.',
          context: '[Source 1: Doc A | Section: Policy | Chunk ID: c1]\nContent A',
          question: 'What is the limit?',
        },
      });

      assert.equal(details.id, 'rag_grounded');
      assert.equal(details.baseVersion, 'v1');
      assert.ok(details.version.startsWith('rag_grounded:v1:'));
      assert.match(details.text, /You are SpendWise Assistant\./);
      assert.match(details.text, /=== UNTRUSTED REFERENCE CONTEXT ===/);
      assert.match(details.text, /<retrieved_context>\nContext:\n\[Source 1: Doc A/);
      assert.match(details.text, /=== UNTRUSTED USER QUERY ===/);
      assert.match(details.text, /<student_question>\nUser Question:\nWhat is the limit\?/);
    });

    it('loads system prompt from version-controlled markdown file', () => {
      const prompt = getRagPrompt('system');
      assert.equal(prompt.id, 'rag_system');
      assert.match(prompt.text, /You are the SpendWise Assistant/);
      assert.match(prompt.text, /Strict rules:/);
      assert.match(prompt.text, /Security, Scope, and System Integrity:/);
    });

    it('buildGroundedPrompt and buildGroundedPromptDetails preserve grounding formatting and metadata', () => {
      const chunks = [
        { id: 'chunk-1', source: 'handbook.pdf', title: 'Tuition Policy', content: 'Tuition must be paid on time.' },
      ];
      const promptText = buildGroundedPrompt('How to pay?', chunks, 'Custom system instruction');
      assert.match(promptText, /Custom system instruction/);
      assert.match(promptText, /\[Source 1: Document: handbook\.pdf \| Section: Tuition Policy \| Chunk ID: chunk-1\]/);
      assert.match(promptText, /Tuition must be paid on time\./);

      const details = buildGroundedPromptDetails('How to pay?', chunks, 'Custom system instruction');
      assert.equal(details.id, 'rag_grounded');
      assert.equal(details.baseVersion, 'v1');
      assert.ok(details.hash && details.hash.length === 64);
      assert.equal(details.text, promptText);
    });

    it('propagates prompt metadata to llmGenerator and response in orchestrateRAGChat', async () => {
      let passedOptions = null;
      const fakeExecutor = async () => ({
        passedThreshold: true,
        sources: [{ id: 'c1', title: 'Section A' }],
        retrieval: { similarityThreshold: 0.6, bestScore: 0.8 },
        prompt: 'Grounded prompt content',
        promptId: 'rag_grounded',
        promptVersion: 'v1',
        promptHash: 'fakehash123',
      });
      const fakeGenerator = async (prompt, opts) => {
        passedOptions = opts;
        return 'Here is the answer from documentation.';
      };

      const result = await orchestrateRAGChat('What is the policy?', {
        ragExecutor: fakeExecutor,
        llmGenerator: fakeGenerator,
      });

      assert.equal(result.strategy, 'rag');
      assert.equal(result.answer, 'Here is the answer from documentation.');
      assert.equal(result.promptId, 'rag_grounded');
      assert.equal(result.promptVersion, 'v1');
      assert.equal(result.promptHash, 'fakehash123');
      assert.equal(passedOptions.promptId, 'rag_grounded');
      assert.equal(passedOptions.promptVersion, 'v1');
    });

    it('falls back gracefully when missing RAG prompt version is requested', () => {
      const fallback = getRagPrompt('grounded', {
        version: 'v999',
        variables: { systemPrompt: 'Sys', context: 'Ctx', question: 'Q' },
      });
      assert.equal(fallback.baseVersion, 'v1');
      assert.match(fallback.text, /Sys/);
      assert.match(fallback.text, /Ctx/);
    });

    it('renderRagPrompt handles both {{key}} and ${key} interpolation', () => {
      const rendered1 = renderRagPrompt('Hello {{name}}', { name: 'World' });
      const rendered2 = renderRagPrompt('Hello ${name}', { name: 'World' });
      assert.equal(rendered1, 'Hello World');
      assert.equal(rendered2, 'Hello World');
    });

    it('computeRagPromptVersion generates stable hash based version identifier', () => {
      const v = computeRagPromptVersion('rag_grounded', 'v1', 'sample content');
      assert.ok(v.startsWith('rag_grounded:v1:'));
      assert.equal(v.split(':').length, 3);
    });
  });
});
