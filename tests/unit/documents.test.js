import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  sanitizeFilename,
  validateMarkdownContent,
  DocumentServiceError,
} from '../../server/src/features/documents/documents.service.js';
import * as documentsController from '../../server/src/features/documents/documents.controller.js';
import { validate } from '../../server/src/shared/middleware/validateRequest.js';
import {
  filenameSchema,
  documentContentSchema,
  createDocumentSchema,
  updateDocumentSchema,
  documentParamsSchema,
} from '../../server/src/features/documents/documents.schemas.js';
import { ValidationError } from '../../server/src/shared/errors/index.js';
import { SERVER_MESSAGES } from '../../server/src/constants/index.js';

describe('Document Service and Schemas Unit Suite', () => {
  describe('1. Document Service Sanitization and Content Validation', () => {
    it('documentService validates filename sanitization and markdown section headers', () => {
      assert.equal(sanitizeFilename('expense_policies'), 'expense_policies.md');
      assert.equal(sanitizeFilename('user_guide.md'), 'user_guide.md');

      assert.throws(
        () => sanitizeFilename(''),
        (err) => err instanceof DocumentServiceError && err.statusCode === 400
      );

      assert.throws(
        () => sanitizeFilename('invalid*name?.md'),
        (err) => err instanceof DocumentServiceError && err.statusCode === 400
      );

      assert.throws(
        () => validateMarkdownContent('No section headers here'),
        (err) => err instanceof DocumentServiceError && err.statusCode === 400
      );

      assert.doesNotThrow(() => {
        validateMarkdownContent('## Valid Section\nContent here.');
      });
    });

    it('feature services provide clean interfaces for document operations', () => {
      assert.equal(typeof sanitizeFilename, 'function');
      assert.equal(sanitizeFilename('test_doc'), 'test_doc.md');
    });
  });

  describe('2. Document Zod Schemas Validation', () => {
    it('valid inputs pass validation across document schemas', () => {
      const fn1 = validate(filenameSchema, 'policies');
      assert.equal(fn1, 'policies.md');
      const fn2 = validate(filenameSchema, 'user_guide.md');
      assert.equal(fn2, 'user_guide.md');
      const fn3 = validate(filenameSchema, 'valid_doc-1.2');
      assert.equal(fn3, 'valid_doc-1.2.md');

      const content = '## Section 1\nSome valid markdown body.';
      assert.equal(validate(documentContentSchema, content), content);

      const docCreate = validate(createDocumentSchema, {
        filename: 'spendwise_guide',
        content: '## Overview\nValid documentation text.',
        overwrite: true,
      });
      assert.equal(docCreate.filename, 'spendwise_guide.md');
      assert.equal(docCreate.overwrite, true);

      const docUpdate = validate(updateDocumentSchema, {
        content: '## New Section\nRevised guide text.',
      });
      assert.ok(docUpdate.content.startsWith('## New Section'));

      const docParams = validate(documentParamsSchema, { filename: 'test_doc' });
      assert.equal(docParams.filename, 'test_doc.md');
    });

    it('filenameSchema and sanitizeFilename strictly reject path traversal and malicious paths without silent transformation', () => {
      assert.throws(
        () => validate(filenameSchema, ''),
        (err) => err instanceof ValidationError && err.message === SERVER_MESSAGES.ERRORS.FILENAME_REQUIRED
      );
      assert.throws(
        () => validate(filenameSchema, '   '),
        (err) => err instanceof ValidationError && err.message === SERVER_MESSAGES.ERRORS.FILENAME_REQUIRED
      );
      assert.throws(
        () => validate(filenameSchema, null),
        (err) => err instanceof ValidationError && err.message === SERVER_MESSAGES.ERRORS.FILENAME_REQUIRED
      );

      const maliciousPaths = [
        '../academic.md',
        '..\\academic.md',
        '/etc/passwd',
        'C:\\foo\\bar',
        'sub/dir/notes.md',
        '..',
        './test.md',
      ];
      for (const badPath of maliciousPaths) {
        assert.throws(
          () => validate(filenameSchema, badPath),
          (err) => err instanceof ValidationError && err.message === SERVER_MESSAGES.ERRORS.INVALID_FILENAME,
          `Expected filenameSchema to reject path traversal: ${badPath}`
        );
        assert.throws(
          () => sanitizeFilename(badPath),
          (err) => err instanceof DocumentServiceError && err.message === SERVER_MESSAGES.ERRORS.INVALID_FILENAME,
          `Expected sanitizeFilename to reject path traversal: ${badPath}`
        );
      }

      const illegalFilenames = [
        'invalid*name.md',
        'bad name with spaces.md',
        'doc?question.md',
        'colon:test.md',
        'quote"test.md',
        'less<test.md',
      ];
      for (const bad of illegalFilenames) {
        assert.throws(
          () => validate(filenameSchema, bad),
          (err) => err instanceof ValidationError && err.message === SERVER_MESSAGES.ERRORS.INVALID_FILENAME
        );
      }
    });

    it('documentContentSchema enforces non-empty and Level-2 section header rules', () => {
      assert.throws(
        () => validate(documentContentSchema, ''),
        (err) => err instanceof ValidationError && err.message === SERVER_MESSAGES.ERRORS.DOC_CONTENT_EMPTY
      );
      assert.throws(
        () => validate(documentContentSchema, '   \n  \t  '),
        (err) => err instanceof ValidationError && err.message === SERVER_MESSAGES.ERRORS.DOC_CONTENT_EMPTY
      );

      const noHeaderContent = '# Level 1 Title Only\n### Level 3 Only\nPlain text without level 2 header';
      assert.throws(
        () => validate(documentContentSchema, noHeaderContent),
        (err) => err instanceof ValidationError && err.message === SERVER_MESSAGES.ERRORS.MISSING_SECTION_HEADER
      );
    });
  });

  describe('3. Documents Controller Error Propagation and Fallback Validation', () => {
    it('documentsController handlers catch and propagate domain errors to next()', async () => {
      let passedError = null;
      const req = { params: { filename: 'nonexistent.md' } };
      const res = {
        json() { },
      };

      await documentsController.getDocument(req, res, (err) => {
        passedError = err;
      });

      assert.ok(passedError instanceof DocumentServiceError);
      assert.equal(passedError.statusCode, 404);
    });

    it('documentsController validates payloads and parameters before invoking business logic', async () => {
      let passedError = null;
      await documentsController.getDocument({ params: { filename: '' } }, {}, (err) => {
        passedError = err;
      });
      assert.ok(passedError instanceof DocumentServiceError);
      assert.equal(passedError.statusCode, 400);
      assert.equal(passedError.message, SERVER_MESSAGES.ERRORS.FILENAME_REQUIRED);

      passedError = null;
      await documentsController.updateDocument(
        { params: { filename: 'valid.md' }, body: { content: 'No level 2 header here' } },
        {},
        (err) => {
          passedError = err;
        }
      );
      assert.ok(passedError instanceof DocumentServiceError);
      assert.equal(passedError.statusCode, 400);
      assert.equal(passedError.message, SERVER_MESSAGES.ERRORS.MISSING_SECTION_HEADER);
    });
  });
});
