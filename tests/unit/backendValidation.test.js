import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { validate, validateRequest } from '../../server/src/shared/middleware/validateRequest.js';
import { chatRequestSchema } from '../../server/src/features/chat/chat.schemas.js';
import { paginationQuerySchema } from '../../server/src/features/knowledgeBase/knowledgeBase.schemas.js';
import { filenameSchema, documentContentSchema, createDocumentSchema, documentParamsSchema } from '../../server/src/features/documents/documents.schemas.js';
import { AppError, ValidationError } from '../../server/src/shared/errors/index.js';
import { errorHandler } from '../../server/src/shared/middleware/errorHandler.js';
import * as chatController from '../../server/src/features/chat/chat.controller.js';
import { SERVER_MESSAGES, PAGINATION_LIMITS } from '../../server/src/constants/index.js';

describe('Centralized Backend Input Validation with Zod Suite', () => {
  it('chatRequestSchema validates message and optional stream parameter', () => {
    const chatParsed = validate(chatRequestSchema, { message: 'What is the tuition fee?' });
    assert.equal(chatParsed.message, 'What is the tuition fee?');

    const streamChat = validate(chatRequestSchema, { message: '  Hello World  ', stream: true });
    assert.equal(streamChat.message, 'Hello World');
    assert.equal(streamChat.stream, true);
  });

  it('chatRequestSchema rejects missing, empty, whitespace-only, wrong-type, and malformed queries', () => {
    const invalidInputs = [
      {},
      { message: '' },
      { message: '   ' },
      { message: null },
      { message: 12345 },
      { message: ['invalid'] },
      { message: { text: 'invalid' } },
    ];

    for (const input of invalidInputs) {
      assert.throws(
        () => validate(chatRequestSchema, input),
        (err) => err instanceof ValidationError && err.message === SERVER_MESSAGES.ERRORS.QUERY_REQUIRED
      );
    }
  });

  it('paginationQuerySchema parses numeric strings, decimals, partial numerics, repeated params, and clamps bounds', () => {
    // Defaults on empty query
    const defaultParsed = validate(paginationQuerySchema, {});
    assert.equal(defaultParsed.limit, PAGINATION_LIMITS.DEFAULT_LIMIT);
    assert.equal(defaultParsed.offset, PAGINATION_LIMITS.DEFAULT_OFFSET);
    assert.equal(defaultParsed.search, '');

    // Coercion from valid numeric strings
    const stringParsed = validate(paginationQuerySchema, { limit: '25', offset: '10' });
    assert.equal(stringParsed.limit, 25);
    assert.equal(stringParsed.offset, 10);

    // Zero limit (< 1) -> default; zero offset (>= 0) -> 0
    const zeroParsed = validate(paginationQuerySchema, { limit: '0', offset: '0' });
    assert.equal(zeroParsed.limit, PAGINATION_LIMITS.DEFAULT_LIMIT);
    assert.equal(zeroParsed.offset, 0);

    // Negative values -> clamp to defaults
    const negativeParsed = validate(paginationQuerySchema, { limit: '-5', offset: '-10' });
    assert.equal(negativeParsed.limit, PAGINATION_LIMITS.DEFAULT_LIMIT);
    assert.equal(negativeParsed.offset, PAGINATION_LIMITS.DEFAULT_OFFSET);

    // Values above maximum -> clamp limit to MAX_LIMIT (50)
    const clampedUpper = validate(paginationQuerySchema, { limit: '999', offset: '50' });
    assert.equal(clampedUpper.limit, PAGINATION_LIMITS.MAX_LIMIT);
    assert.equal(clampedUpper.offset, 50);

    // Decimal strings (parseInt truncation preserves pre-Phase-4 behavior)
    const decimalParsed = validate(paginationQuerySchema, { limit: '12.5', offset: '10.8' });
    assert.equal(decimalParsed.limit, 12);
    assert.equal(decimalParsed.offset, 10);

    // Partially numeric strings ("12abc" -> 12, "25xyz" -> 25)
    const partialParsed = validate(paginationQuerySchema, { limit: '12abc', offset: '25xyz' });
    assert.equal(partialParsed.limit, 12);
    assert.equal(partialParsed.offset, 25);

    // Repeated query parameters from Express (arrays)
    const repeatedParsed = validate(paginationQuerySchema, {
      limit: ['15', '30'],
      offset: ['5', '10'],
      q: ['scholarship', 'exam'],
    });
    assert.equal(repeatedParsed.limit, 15);
    assert.equal(repeatedParsed.offset, 5);
    assert.equal(repeatedParsed.search, 'scholarship');

    // Search query fallback (prefers q over search if both provided, trims string)
    const qSearch = validate(paginationQuerySchema, { q: ' tuition fees ' });
    assert.equal(qSearch.search, 'tuition fees');

    const directSearch = validate(paginationQuerySchema, { search: '  library  ' });
    assert.equal(directSearch.search, 'library');

    // Malformed NaN strings fallback to defaults
    const nanParsed = validate(paginationQuerySchema, { limit: 'not_a_num', offset: 'invalid' });
    assert.equal(nanParsed.limit, PAGINATION_LIMITS.DEFAULT_LIMIT);
    assert.equal(nanParsed.offset, PAGINATION_LIMITS.DEFAULT_OFFSET);
  });

  it('validate helper distinguishes unexpected programming bugs from input validation failures', () => {
    assert.throws(
      () => validate(null, { test: 123 }),
      (err) => err instanceof TypeError && err.message.includes('[Validator]')
    );

    assert.throws(
      () => validate({}, { test: 123 }),
      (err) => err instanceof TypeError && err.message.includes('[Validator]')
    );
  });

  it('validate helper converts Zod errors to AppError/ValidationError with status 400 and preserves client compatibility', () => {
    let capturedErr = null;
    try {
      validate(chatRequestSchema, { message: '' });
    } catch (err) {
      capturedErr = err;
    }

    assert.ok(capturedErr instanceof ValidationError);
    assert.ok(capturedErr instanceof AppError);
    assert.equal(capturedErr.statusCode, 400);
    assert.equal(capturedErr.isOperational, true);
    assert.equal(capturedErr.message, SERVER_MESSAGES.ERRORS.QUERY_REQUIRED);

    // Verify compatibility with centralized errorHandler
    let sentStatus = null;
    let sentJson = null;
    const mockRes = {
      headersSent: false,
      status(code) {
        sentStatus = code;
        return this;
      },
      json(data) {
        sentJson = data;
        return this;
      },
    };

    errorHandler(capturedErr, { method: 'POST', originalUrl: '/api/user/chat' }, mockRes, () => { });
    assert.equal(sentStatus, 400);
    assert.deepEqual(sentJson, { error: SERVER_MESSAGES.ERRORS.QUERY_REQUIRED });
  });

  it('chatController pre-stream validation catches invalid chat queries before headers are sent', async () => {
    let setHeaderCalls = 0;
    let passedError = null;

    const req = { body: { message: '   ' } };
    const res = {
      headersSent: false,
      setHeader() {
        setHeaderCalls++;
      },
      flushHeaders() { },
      on() { },
    };

    await chatController.chatStream(req, res, (err) => {
      passedError = err;
    });

    assert.equal(setHeaderCalls, 0, 'No headers should be set when validation fails');
    assert.ok(passedError);
    assert.equal(passedError.statusCode, 400);
    assert.equal(passedError.message, SERVER_MESSAGES.ERRORS.QUERY_REQUIRED);
  });

  it('validateRequest middleware validates body/params/query and stores results canonically on res.locals.validated', () => {
    const middleware = validateRequest({
      params: documentParamsSchema,
      body: createDocumentSchema,
      query: paginationQuerySchema,
    });

    const req = {
      params: { filename: 'guide' },
      body: { filename: 'guide', content: '## Handbook\nDetails', overwrite: true },
      query: { limit: '20', offset: '5', q: 'exam' },
    };
    const res = { locals: {} };
    let nextCalled = false;
    let nextError = null;

    middleware(req, res, (err) => {
      nextCalled = true;
      nextError = err;
    });

    assert.equal(nextCalled, true);
    assert.equal(nextError, undefined);
    assert.equal(res.locals.validated.params.filename, 'guide.md');
    assert.equal(res.locals.validated.body.filename, 'guide.md');
    assert.equal(res.locals.validated.body.overwrite, true);
    assert.deepEqual(res.locals.validated.query, { limit: 20, offset: 5, search: 'exam' });
    assert.equal(req.validated, undefined, 'req.validated duplicate storage must be removed');
  });

  it('validateRequest middleware is compatible with Express 5 getter-only req.query without mutating req.query', () => {
    const middleware = validateRequest({ query: paginationQuerySchema });

    // Emulate Express 5 getter-only req.query property
    const req = {};
    const queryValue = Object.freeze({ limit: '30', offset: '10' });
    Object.defineProperty(req, 'query', {
      get() {
        return queryValue;
      },
      configurable: false,
      enumerable: true,
    });

    const res = { locals: {} };
    let nextError = null;

    assert.doesNotThrow(() => {
      middleware(req, res, (err) => {
        nextError = err;
      });
    });

    assert.equal(nextError, undefined);
    assert.equal(res.locals.validated.query.limit, 30);
    assert.equal(res.locals.validated.query.offset, 10);
    assert.equal(req.validated, undefined, 'req.validated duplicate storage must be removed');
    assert.equal(req.query.limit, '30', 'req.query getter object must not be mutated');
  });
});
