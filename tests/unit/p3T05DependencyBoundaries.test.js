import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getVietnamDate } from '../../server/src/shared/validation/date.js';
import {
  createTransactionArgsSchema,
  searchTransactionsArgsSchema,
  spendingSummaryArgsSchema,
} from '../../server/src/features/transaction/transaction.schema.js';
import {
  createTransactionArgsSchema as legacyCreateSchema,
  searchTransactionsArgsSchema as legacySearchSchema,
  spendingSummaryArgsSchema as legacySummarySchema,
} from '../../server/src/features/expenseAssistant/expenseAssistant.schema.js';
import { runUnifiedExpenseAssistant } from '../../server/src/features/expenseAssistant/expenseAssistant.service.js';

const SERVER_SRC = path.resolve(process.cwd(), 'server/src');

function collectJsFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectJsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      results.push(full);
    }
  }
  return results;
}

function extractRelativeImports(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const imports = [];
  const pattern = /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"](\.[^'"]+)['"]/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const resolved = path.resolve(path.dirname(filePath), match[1]);
    imports.push(resolved);
  }
  return imports;
}

describe('P3-T05 Feature Dependency Boundary & Architecture Cleanup Suite', () => {
  it('eliminates bidirectional imports and circular dependencies between chatAssistant and expenseAssistant', () => {
    const chatFiles = collectJsFiles(path.join(SERVER_SRC, 'features/chatAssistant'));
    const expenseFiles = collectJsFiles(path.join(SERVER_SRC, 'features/expenseAssistant'));

    // 1. chatAssistant must have zero imports from expenseAssistant
    for (const file of chatFiles) {
      const deps = extractRelativeImports(file);
      for (const dep of deps) {
        assert.ok(
          !dep.includes(`${path.sep}expenseAssistant${path.sep}`),
          `${path.relative(SERVER_SRC, file)} must not import from expenseAssistant (${path.relative(SERVER_SRC, dep)})`
        );
      }
    }

    // 2. expenseAssistant.controller.js must not import from chatAssistant
    const controllerPath = path.join(SERVER_SRC, 'features/expenseAssistant/expenseAssistant.controller.js');
    const controllerDeps = extractRelativeImports(controllerPath);
    for (const dep of controllerDeps) {
      assert.ok(
        !dep.includes(`${path.sep}chatAssistant${path.sep}`),
        `expenseAssistant.controller.js must not import from chatAssistant (${path.relative(SERVER_SRC, dep)})`
      );
    }

    // 3. Full static cycle check across chatAssistant + expenseAssistant
    const allFiles = [...chatFiles, ...expenseFiles];
    const graph = new Map(allFiles.map((f) => [f, extractRelativeImports(f).filter((d) => allFiles.includes(d))]));

    const visiting = new Set();
    const visited = new Set();
    function hasCycle(node) {
      if (visiting.has(node)) return true;
      if (visited.has(node)) return false;
      visiting.add(node);
      for (const next of graph.get(node) || []) {
        if (hasCycle(next)) return true;
      }
      visiting.delete(node);
      visited.add(node);
      return false;
    }

    for (const file of allFiles) {
      assert.equal(hasCycle(file), false, `Circular dependency detected involving ${path.relative(SERVER_SRC, file)}`);
    }
  });

  it('exposes shared date helper and transaction tool schemas from canonical owners with legacy re-exports', () => {
    assert.match(getVietnamDate(new Date('2026-11-17T18:00:00.000Z')), /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(searchTransactionsArgsSchema, legacySearchSchema);
    assert.equal(spendingSummaryArgsSchema, legacySummarySchema);
    assert.equal(createTransactionArgsSchema, legacyCreateSchema);
  });

  it('preserves legacy /api/expense-assistant create_transaction compatibility via runUnifiedExpenseAssistant', async () => {
    const res = await runUnifiedExpenseAssistant(
      { id: 'u1', token: 'tok1' },
      'Log 50k coffee at Highlands today',
      {
        conversationId: 'conv-legacy-1',
        usageRecorder: () => {},
        toolTurnRunner: async ({ prompt }) => {
          const hasToolResp = prompt.some((m) => m.parts?.some((p) => p.functionResponse));
          if (!hasToolResp) {
            return {
              provider: 'google-genai',
              model: 'test-model',
              text: '',
              functionCalls: [
                {
                  id: 'c1',
                  name: 'propose_transaction',
                  args: {
                    type: 'expense',
                    amount: 50000,
                    date: '2026-11-17',
                    category: 'Food & Dining',
                    merchant: 'Highlands',
                    note: '',
                  },
                },
              ],
              tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            };
          }
          return {
            provider: 'google-genai',
            model: 'test-model',
            text: 'Prepared a 50,000 VND coffee proposal for review.',
            functionCalls: [],
            tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          };
        },
      }
    );

    assert.equal(res.strategy, 'unified');
    assert.equal(res.toolName, 'create_transaction');
    assert.equal(res.toolResult.sourceType, 'assistant_proposal');
    assert.equal(res.toolResult.sourceRef, 'conv-legacy-1');
    assert.equal(res.toolResult.draft.amount, 50000);
  });
});
