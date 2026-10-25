import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  TooManyRequestsError,
} from '../../server/src/shared/errors/index.js';
import { errorHandler } from '../../server/src/shared/middleware/errorHandler.js';
import { ChatServiceError } from '../../server/src/features/assistant/assistant.service.js';
import { KnowledgeServiceError, AdminServiceError } from '../../server/src/features/knowledgeBase/knowledgeBase.service.js';
import { DocumentServiceError } from '../../server/src/features/documents/documents.service.js';
import { PromptServiceError } from '../../server/src/features/systemPrompt/systemPrompt.service.js';
import * as chatController from '../../server/src/features/assistant/assistant.controller.js';

describe('Centralized Backend Error Handling & Operational Errors Suite', () => {
  it('AppError base class sets operational flag, status code, and captures stack trace', () => {
    const err = new AppError('Something bad', 400);
    assert.equal(err.message, 'Something bad');
    assert.equal(err.statusCode, 400);
    assert.equal(err.isOperational, true);
    assert.equal(err.name, 'AppError');
    assert.ok(err.stack);
  });

  it('domain error classes all inherit from AppError and Error', () => {
    const chatErr = new ChatServiceError('Chat issue', 400);
    assert.ok(chatErr instanceof AppError);
    assert.ok(chatErr instanceof Error);
    assert.equal(chatErr.isOperational, true);

    const knowledgeErr = new KnowledgeServiceError('Knowledge issue', 400);
    assert.ok(knowledgeErr instanceof AppError);

    const docErr = new DocumentServiceError('Doc issue', 404);
    assert.ok(docErr instanceof AppError);
    assert.equal(docErr.statusCode, 404);

    const promptErr = new PromptServiceError('Prompt issue', 400);
    assert.ok(promptErr instanceof AppError);

    const adminErr = new AdminServiceError('Admin issue', 409);
    assert.ok(adminErr instanceof AppError);
    assert.equal(adminErr.statusCode, 409);

    const valErr = new ValidationError('Validation issue');
    assert.ok(valErr instanceof AppError);
    assert.equal(valErr.statusCode, 400);

    const notFoundErr = new NotFoundError('Not found');
    assert.ok(notFoundErr instanceof AppError);
    assert.equal(notFoundErr.statusCode, 404);

    const unauthErr = new UnauthorizedError('Unauthorized');
    assert.ok(unauthErr instanceof AppError);
    assert.equal(unauthErr.statusCode, 401);

    const forbErr = new ForbiddenError('Forbidden');
    assert.ok(forbErr instanceof AppError);
    assert.equal(forbErr.statusCode, 403);

    const tmrErr = new TooManyRequestsError('Rate limit exceeded');
    assert.ok(tmrErr instanceof AppError);
    assert.equal(tmrErr.statusCode, 429);
  });

  it('errorHandler sends operational error status and { error: message } JSON payload', () => {
    let capturedStatus = null;
    let capturedJson = null;

    const mockRes = {
      headersSent: false,
      status(code) {
        capturedStatus = code;
        return this;
      },
      json(data) {
        capturedJson = data;
        return this;
      },
    };

    const operationalError = new DocumentServiceError('Document "test.md" not found.', 404);
    let nextCalled = false;
    errorHandler(operationalError, { method: 'GET', originalUrl: '/api/admin/documents/test.md' }, mockRes, () => {
      nextCalled = true;
    });

    assert.equal(capturedStatus, 404);
    assert.deepEqual(capturedJson, { error: 'Document "test.md" not found.' });
    assert.equal(nextCalled, false);
  });

  it('errorHandler masks unexpected internal errors (500) and preserves client confidentiality', () => {
    let capturedStatus = null;
    let capturedJson = null;

    const mockRes = {
      headersSent: false,
      status(code) {
        capturedStatus = code;
        return this;
      },
      json(data) {
        capturedJson = data;
        return this;
      },
    };

    const internalCrash = new Error('Database pool exhaustion at connection 10.0.0.4:5432');
    let nextCalled = false;
    errorHandler(internalCrash, { method: 'GET', originalUrl: '/api/admin/documents' }, mockRes, () => {
      nextCalled = true;
    });

    assert.equal(capturedStatus, 500);
    assert.deepEqual(capturedJson, { error: 'An unexpected error occurred.' });
    assert.equal(nextCalled, false);
  });

  it('errorHandler respects headersSent and delegates to next without writing to response', () => {
    let statusCalled = false;
    let jsonCalled = false;
    let nextError = null;

    const mockRes = {
      headersSent: true,
      status() {
        statusCalled = true;
        return this;
      },
      json() {
        jsonCalled = true;
        return this;
      },
    };

    const midStreamErr = new Error('Stream disconnect');
    errorHandler(midStreamErr, { method: 'POST', originalUrl: '/api/user/chat/stream' }, mockRes, (err) => {
      nextError = err;
    });

    assert.equal(statusCalled, false, 'Should not modify status when headers are already sent');
    assert.equal(jsonCalled, false, 'Should not send JSON when headers are already sent');
    assert.equal(nextError, midStreamErr, 'Should pass error to next()');
  });

  it('chatController.chatStream propagates pre-stream validation error to next()', async () => {
    let passedError = null;
    const req = { body: { message: '   ' } };
    const res = {
      setHeader() { },
      status() { return this; },
      json() { return this; },
    };

    await chatController.chatStream(req, res, (err) => {
      passedError = err;
    });

    assert.ok(passedError instanceof ChatServiceError);
    assert.equal(passedError.statusCode, 400);
    assert.equal(passedError.message, 'Query message is required.');
  });

  it('server/src/shared/errors/index.js exports foundational AppError and ValidationError without circular service dependencies', async () => {
    const errorsModule = await import('../../server/src/shared/errors/index.js');
    assert.ok(errorsModule.AppError, 'AppError must be exported');
    assert.ok(errorsModule.ValidationError, 'ValidationError must be exported');

    const valErr = new errorsModule.ValidationError('Test error');
    assert.ok(valErr instanceof errorsModule.AppError);
    assert.equal(valErr.statusCode, 400);
    assert.equal(valErr.isOperational, true);
  });
});
