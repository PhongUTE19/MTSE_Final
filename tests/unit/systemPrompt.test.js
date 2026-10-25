import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getSystemPrompt,
  saveSystemPrompt,
  PromptServiceError,
} from '../../server/src/features/systemPrompt/systemPrompt.service.js';
import * as promptsController from '../../server/src/features/systemPrompt/systemPrompt.controller.js';
import { validate } from '../../server/src/shared/middleware/validateRequest.js';
import { updateSystemPromptSchema } from '../../server/src/features/systemPrompt/systemPrompt.schemas.js';
import { ValidationError } from '../../server/src/shared/errors/index.js';
import { SERVER_MESSAGES } from '../../server/src/constants/index.js';

describe('System Prompt Service and Schemas Unit Suite', () => {
  describe('1. System Prompt Service Operations', () => {
    it('promptService provides default system prompt and validates prompt length', () => {
      const prompt = getSystemPrompt();
      assert.ok(prompt.length > 50, 'Prompt should have substantial content');
      assert.ok(prompt.includes('SpendWise'), 'Prompt should reference SpendWise');

      assert.throws(
        () => saveSystemPrompt('Too short'),
        (err) => err instanceof PromptServiceError && err.statusCode === 400
      );

      assert.throws(
        () => saveSystemPrompt(''),
        (err) => err instanceof PromptServiceError && err.statusCode === 400
      );
    });

    it('feature services provide clean interfaces for prompt operations', () => {
      assert.equal(typeof getSystemPrompt, 'function');
      const directPrompt = getSystemPrompt();
      assert.ok(directPrompt && directPrompt.length > 0);
    });
  });

  describe('2. System Prompt Zod Schema Validation', () => {
    it('valid inputs pass validation for system prompt schema', () => {
      const validPrompt = 'You are an intelligent SpendWise assistant helping users manage finances.';
      const promptParsed = validate(updateSystemPromptSchema, { prompt: validPrompt });
      assert.equal(promptParsed.prompt, validPrompt);
    });

    it('updatePromptSchema validates 20-10,000 char boundary values accurately', () => {
      // Empty prompt
      assert.throws(
        () => validate(updateSystemPromptSchema, { prompt: '' }),
        (err) => err instanceof ValidationError && err.message === SERVER_MESSAGES.ERRORS.PROMPT_EMPTY
      );
      assert.throws(
        () => validate(updateSystemPromptSchema, { prompt: '   ' }),
        (err) => err instanceof ValidationError && err.message === SERVER_MESSAGES.ERRORS.PROMPT_EMPTY
      );

      // Boundary: 19 characters -> TOO_SHORT
      const nineteenChars = 'a'.repeat(19);
      assert.throws(
        () => validate(updateSystemPromptSchema, { prompt: nineteenChars }),
        (err) => err instanceof ValidationError && err.message === SERVER_MESSAGES.ERRORS.PROMPT_TOO_SHORT
      );

      // Boundary: 20 characters -> valid (min length)
      const twentyChars = 'a'.repeat(20);
      const lowerBoundResult = validate(updateSystemPromptSchema, { prompt: twentyChars });
      assert.equal(lowerBoundResult.prompt, twentyChars);

      // Boundary: 10,000 characters -> valid (max length)
      const tenThousandChars = 'a'.repeat(10000);
      const upperBoundResult = validate(updateSystemPromptSchema, { prompt: tenThousandChars });
      assert.equal(upperBoundResult.prompt, tenThousandChars);

      // Boundary: 10,001 characters -> TOO_LONG
      const tenThousandOneChars = 'a'.repeat(10001);
      assert.throws(
        () => validate(updateSystemPromptSchema, { prompt: tenThousandOneChars }),
        (err) => err instanceof ValidationError && err.message === SERVER_MESSAGES.ERRORS.PROMPT_TOO_LONG
      );
    });
  });

  describe('3. Prompts Controller Validation and Error Handling', () => {
    it('promptsController validates payloads before invoking business logic', () => {
      let passedError = null;
      promptsController.updatePrompt({ body: { prompt: 'too short' } }, {}, (err) => {
        passedError = err;
      });
      assert.ok(passedError instanceof PromptServiceError);
      assert.equal(passedError.statusCode, 400);
      assert.equal(passedError.message, SERVER_MESSAGES.ERRORS.PROMPT_TOO_SHORT);
    });
  });
});
