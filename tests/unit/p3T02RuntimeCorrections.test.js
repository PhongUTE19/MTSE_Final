import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { SERVER_CONFIG_DEFAULTS, SERVER_MESSAGES } from '../../server/src/constants/index.js';
import { config } from '../../server/src/config.js';
import { orchestrateChat, orchestrateChatStream } from '../../server/src/features/chatAssistant/chatAssistant.service.js';
import { finalizeAssistantResponse } from '../../server/src/features/chatAssistant/assistantResponse.js';

const execFileAsync = promisify(execFile);

async function resolveConfigChatStrategyInCleanEnv(envOverride = {}) {
  const env = { ...process.env, ...envOverride };
  if (!('CHAT_STRATEGY' in envOverride)) {
    delete env.CHAT_STRATEGY;
  }

  // Import config.js in an isolated process without relying on server/.env CHAT_STRATEGY.
  const script = `
    import { config } from './server/src/config.js';
    console.log(JSON.stringify({ chatStrategy: config.chatStrategy }));
  `;
  const { stdout } = await execFileAsync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: process.cwd(),
    env,
  });
  return JSON.parse(stdout.trim()).chatStrategy;
}

describe('P3-T02 Mandatory AI Runtime Corrections', () => {
  describe('P3-T02-A: Default CHAT_STRATEGY resolution & routing', () => {
    it('sets SERVER_CONFIG_DEFAULTS.CHAT_STRATEGY to unified', () => {
      assert.equal(SERVER_CONFIG_DEFAULTS.CHAT_STRATEGY, 'unified');
    });

    it('resolves config.chatStrategy to unified when CHAT_STRATEGY is unset or empty', async () => {
      const whenUnset = await resolveConfigChatStrategyInCleanEnv({});
      assert.equal(whenUnset, 'unified');

      const whenEmpty = await resolveConfigChatStrategyInCleanEnv({ CHAT_STRATEGY: '   ' });
      assert.equal(whenEmpty, 'unified');
    });

    it('preserves explicit CHAT_STRATEGY environment overrides', async () => {
      assert.equal(await resolveConfigChatStrategyInCleanEnv({ CHAT_STRATEGY: 'agent' }), 'agent');
      assert.equal(await resolveConfigChatStrategyInCleanEnv({ CHAT_STRATEGY: 'rag' }), 'rag');
      assert.equal(await resolveConfigChatStrategyInCleanEnv({ CHAT_STRATEGY: 'unified' }), 'unified');
    });

    it('routes both orchestrateChat and orchestrateChatStream to unified by default without env override', async () => {
      const prevEnv = process.env.CHAT_STRATEGY;
      const prevConfigStrategy = config.chatStrategy;
      delete process.env.CHAT_STRATEGY;
      config.chatStrategy = 'unified';

      const fakeUser = { id: 'u-p3-t02', token: 'tok-p3-t02' };
      const fakeToolTurnRunner = async () => ({
        provider: 'google-genai',
        model: 'test-model',
        text: 'Unified sync response.',
        functionCalls: [],
        tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      });
      const fakeToolTurnStreamRunner = async () =>
        (async function* () {
          yield { type: 'text', text: 'Unified stream response.' };
          yield {
            type: 'turn_complete',
            provider: 'google-genai',
            model: 'test-model',
            text: 'Unified stream response.',
            functionCalls: [],
            tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          };
        })();

      try {
        const syncResult = await orchestrateChat('How much did I spend today?', {
          user: fakeUser,
          toolTurnRunner: fakeToolTurnRunner,
          usageRecorder: () => {},
        });
        assert.equal(syncResult.strategy, 'unified');
        assert.equal(syncResult.answer, 'Unified sync response.');

        const events = [];
        await orchestrateChatStream(
          'How much did I spend today?',
          (type, data) => events.push({ type, data }),
          {
            user: fakeUser,
            enablePersistence: false,
            toolTurnStreamRunner: fakeToolTurnStreamRunner,
            usageRecorder: () => {},
          }
        );
        const done = events.find((e) => e.type === 'done');
        assert.ok(done);
        assert.equal(done.data.strategy, 'unified');
        assert.equal(done.data.answer, 'Unified stream response.');
      } finally {
        if (prevEnv === undefined) {
          delete process.env.CHAT_STRATEGY;
        } else {
          process.env.CHAT_STRATEGY = prevEnv;
        }
        config.chatStrategy = prevConfigStrategy;
      }
    });

    it('routes explicit CHAT_STRATEGY=agent override to agent strategy', async () => {
      const prevEnv = process.env.CHAT_STRATEGY;
      process.env.CHAT_STRATEGY = 'agent';
      try {
        const result = await orchestrateChat('Today expenses', {
          user: { id: 'u1', token: 't1' },
          agentRunner: async () => ({ answer: 'Agent answer.', toolName: null, toolResult: null }),
        });
        assert.equal(result.strategy, 'agent');
        assert.equal(result.answer, 'Agent answer.');
      } finally {
        if (prevEnv === undefined) {
          delete process.env.CHAT_STRATEGY;
        } else {
          process.env.CHAT_STRATEGY = prevEnv;
        }
      }
    });
  });

  describe('P3-T02-C: finalizeAssistantResponse Markdown & citation sanitization', () => {
    it('preserves multiple Markdown paragraphs and consecutive newlines', () => {
      const raw = 'First paragraph.\n\nSecond paragraph.\n\n\nThird paragraph.';
      const res = finalizeAssistantResponse({ rawAnswer: raw, policy: {}, state: {} });
      assert.equal(res.answer, raw);
    });

    it('preserves bulleted and numbered list formatting', () => {
      const raw = 'Summary:\n\n- Food: 100,000 VND\n- Transport: 50,000 VND\n\n1. Step one\n2. Step two';
      const res = finalizeAssistantResponse({ rawAnswer: raw, policy: {}, state: {} });
      assert.equal(res.answer, raw);
    });

    it('normalizes repeated horizontal spaces and tabs without collapsing newlines', () => {
      const raw = 'Hello   \t  world.\n\nNext   line.\nTrailing spaces   \nEnd.';
      const res = finalizeAssistantResponse({ rawAnswer: raw, policy: {}, state: {} });
      assert.equal(res.answer, 'Hello world.\n\nNext line.\nTrailing spaces\nEnd.');
    });

    it('preserves valid citations and strips invalid [S99] citations', () => {
      const s1 = { sourceId: 'S1', id: 'doc_sec1', title: 'Guide', sectionTitle: 'Intro', source: 'guide.md' };
      const sourcesMap = new Map([['S1', s1]]);
      const res = finalizeAssistantResponse({
        rawAnswer: 'Supported by guide [S1] and fabricated [S99] claim.',
        policy: {},
        state: { sourcesMap, consultedSources: [s1] },
      });
      assert.equal(res.answer, 'Supported by guide [S1] and fabricated claim.');
      assert.deepEqual(res.sources, [s1]);
    });

    it('never restores invalid citations when stripping leaves an empty response', () => {
      const res = finalizeAssistantResponse({
        rawAnswer: '[S99]',
        policy: {},
        state: { sourcesMap: new Map() },
      });
      assert.equal(res.answer, SERVER_MESSAGES.ERRORS.AI_RESPONSE_EMPTY);
      assert.ok(!res.answer.includes('[S99]'));
    });

    it('returns safe empty-response fallback for empty or whitespace-only output', () => {
      const emptyRes = finalizeAssistantResponse({ rawAnswer: '', policy: {}, state: {} });
      assert.equal(emptyRes.answer, SERVER_MESSAGES.ERRORS.AI_RESPONSE_EMPTY);

      const wsRes = finalizeAssistantResponse({ rawAnswer: '   \n\t  ', policy: {}, state: {} });
      assert.equal(wsRes.answer, SERVER_MESSAGES.ERRORS.AI_RESPONSE_EMPTY);
    });
  });
});
