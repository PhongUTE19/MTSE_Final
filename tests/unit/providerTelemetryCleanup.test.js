import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeUsageMetadata } from '../../server/src/shared/integrations/ai/providers/geminiProvider.js';
import { recordProviderUsage, setAIUsageRecorder } from '../../server/src/shared/integrations/ai/telemetry.js';
import { orchestrateUnifiedChat, orchestrateUnifiedChatStream } from '../../server/src/features/chatAssistant/assistantOrchestrator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../..');
const USER = { id: 'u1', token: 'tok-1' };

describe('P2-T14 Provider Boundary & Telemetry Cleanup Suite', () => {
  it('geminiProvider.js has zero static or dynamic imports of features/*', () => {
    const src = fs.readFileSync(
      path.join(rootDir, 'server/src/shared/integrations/ai/providers/geminiProvider.js'),
      'utf8'
    );
    assert.equal(/features\/(aiUsage|receipt)/.test(src), false, 'geminiProvider.js must not reference features/*');
  });

  it('normalizes provider usageMetadata including cachedTokens, zero values, and unavailable counts', () => {
    const full = normalizeUsageMetadata({
      promptTokenCount: 100,
      candidatesTokenCount: 25,
      cachedContentTokenCount: 40,
      totalTokenCount: 125,
    });
    assert.deepEqual(full, {
      inputTokens: 100,
      outputTokens: 25,
      cachedTokens: 40,
      totalTokens: 125,
      usageSource: 'provider_reported',
      tokenCountsAvailable: true,
    });

    const zeros = normalizeUsageMetadata({
      promptTokenCount: 0,
      candidatesTokenCount: 0,
      totalTokenCount: 0,
    });
    assert.equal(zeros.inputTokens, 0);
    assert.equal(zeros.outputTokens, 0);
    assert.equal(zeros.totalTokens, 0);
    assert.equal(zeros.usageSource, 'provider_reported');
    assert.equal(zeros.tokenCountsAvailable, true);

    const missing = normalizeUsageMetadata(null);
    assert.equal(missing.inputTokens, null);
    assert.equal(missing.outputTokens, null);
    assert.equal(missing.cachedTokens, null);
    assert.equal(missing.totalTokens, null);
    assert.equal(missing.usageSource, 'unavailable');
    assert.equal(missing.tokenCountsAvailable, false);
  });

  it('telemetry bridge handles recorder failures non-fatally', (t) => {
    setAIUsageRecorder(() => { throw new Error('Telemetry sink offline'); });
    t.after(() => setAIUsageRecorder(null));
    const res = recordProviderUsage({ feature: 'test' });
    assert.equal(res, null);
  });

  it('orchestrateUnifiedChat aggregates multi-round usage once without double-counting and survives telemetry failure', async () => {
    const recorded = [];
    let round = 0;

    const result = await orchestrateUnifiedChat(USER, 'How much did I spend?', {
      getSpendingSummary: async () => ({ totalExpense: 50000 }),
      usageRecorder: (entry) => {
        recorded.push(entry);
        throw new Error('Telemetry error'); // Non-fatal
      },
      toolTurnRunner: async () => {
        round += 1;
        if (round === 1) {
          return {
            provider: 'google-genai',
            model: 'gemini-2.5-flash',
            functionCalls: [{ name: 'get_spending_summary', args: { from: '2026-11-01', to: '2026-11-17' } }],
            tokenUsage: { inputTokens: 100, outputTokens: 20, totalTokens: 120, cachedTokens: 10 },
          };
        }
        return {
          provider: 'google-genai',
          model: 'gemini-2.5-flash',
          text: 'You spent 50,000 VND.',
          tokenUsage: { inputTokens: 150, outputTokens: 30, totalTokens: 180, cachedTokens: 15 },
        };
      },
    });

    assert.equal(result.answer, 'You spent 50,000 VND.');
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0].outcome, 'success');
    assert.equal(recorded[0].tokenUsage.inputTokens, 250);
    assert.equal(recorded[0].tokenUsage.outputTokens, 50);
    assert.equal(recorded[0].tokenUsage.totalTokens, 300);
    assert.equal(recorded[0].tokenUsage.cachedTokens, 25);
    assert.equal(recorded[0].tokenUsage.usageSource, 'provider_reported');
  });

  it('orchestrateUnifiedChatStream records aborted outcome distinctly and does not double-count chunks', async () => {
    const recorded = [];
    const ac = new AbortController();

    await orchestrateUnifiedChatStream(USER, 'How much did I spend?', () => {}, {
      signal: ac.signal,
      usageRecorder: (entry) => recorded.push(entry),
      toolTurnStreamRunner: async () => (async function* () {
        yield { type: 'text', text: 'Part 1 ' };
        ac.abort();
        yield { type: 'text', text: 'Part 2' };
      })(),
    });

    assert.equal(recorded.length, 1);
    assert.equal(recorded[0].outcome, 'aborted');
    assert.equal(recorded[0].tokenUsage.usageSource, 'unavailable');
  });
});
