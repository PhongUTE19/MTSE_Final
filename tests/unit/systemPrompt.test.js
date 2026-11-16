import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import * as systemPromptService from '../../server/src/features/systemPrompt/systemPrompt.service.js';
import * as promptsController from '../../server/src/features/systemPrompt/systemPrompt.controller.js';
import systemPromptRouter from '../../server/src/features/systemPrompt/systemPrompt.route.js';
import { getRagPrompt } from '../../server/src/features/knowledgeBase/ragPrompt.js';

describe('System Prompt Service and Read-Only Route Unit Suite', () => {
  describe('1. Canonical Read-Only System Prompt Service', () => {
    it('getSystemPrompt returns the canonical Git-managed RAG system prompt', () => {
      const prompt = systemPromptService.getSystemPrompt();
      const canonical = getRagPrompt('system').text;
      assert.equal(prompt, canonical);
      assert.ok(prompt.length > 50, 'Prompt should have substantial content');
      assert.ok(prompt.includes('SpendWise'), 'Prompt should reference SpendWise');
    });

    it('does not expose mutable saveSystemPrompt or resetSystemPrompt operations', () => {
      assert.equal(systemPromptService.saveSystemPrompt, undefined);
      assert.equal(systemPromptService.resetSystemPrompt, undefined);
    });
  });

  describe('2. Read-Only Controller & Router Enforcement', () => {
    it('promptsController exposes getPrompt and removes mutation handlers', () => {
      let jsonBody = null;
      promptsController.getPrompt({}, { json: (body) => { jsonBody = body; } }, (err) => {
        assert.ifError(err);
      });
      assert.equal(jsonBody.prompt, getRagPrompt('system').text);
      assert.equal(promptsController.updatePrompt, undefined);
      assert.equal(promptsController.resetPrompt, undefined);
    });

    it('systemPromptRouter registers only GET / and no PUT or POST mutation routes', () => {
      const routeMethods = systemPromptRouter.stack
        .filter((layer) => layer.route)
        .flatMap((layer) => Object.keys(layer.route.methods).map((m) => `${m.toUpperCase()} ${layer.route.path}`));

      assert.deepEqual(routeMethods, ['GET /']);
    });
  });
});
