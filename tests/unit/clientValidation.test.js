import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateRequired,
  validateNonEmpty,
  validateStringLength,
  validateEmail,
  validateNumber,
  validateUrl,
  validateDate,
  validateDateRange,
  validateFile,
  validateChatMessage,
  validateDocumentFilename,
  validateDocumentContent,
  validateSystemPrompt,
  validatePagination,
  validateSearchQuery,
} from '../../client/src/utils/validation.js';

describe('Client-Side Validation Module Tests', () => {
  describe('1. Primitive Validators', () => {
    it('validateRequired: correctly validates presence of values', () => {
      assert.equal(validateRequired('hello').isValid, true);
      assert.equal(validateRequired(0).isValid, true);
      assert.equal(validateRequired(false).isValid, true);
      assert.equal(validateRequired('').isValid, false);
      assert.equal(validateRequired(null).isValid, false);
      assert.equal(validateRequired(undefined).isValid, false);
    });

    it('validateNonEmpty: rejects whitespace-only or empty strings', () => {
      assert.equal(validateNonEmpty('valid text').isValid, true);
      assert.equal(validateNonEmpty('   ').isValid, false);
      assert.equal(validateNonEmpty('').isValid, false);
      assert.equal(validateNonEmpty(null).isValid, false);
      assert.equal(validateNonEmpty(123).isValid, false);
    });

    it('validateStringLength: enforces min and max character limits', () => {
      assert.equal(validateStringLength('hello', { min: 2, max: 10 }).isValid, true);
      assert.equal(validateStringLength('a', { min: 2 }).isValid, false);
      assert.equal(validateStringLength('super long text', { max: 5 }).isValid, false);
    });

    it('validateEmail: validates email formats correctly', () => {
      assert.equal(validateEmail('student@hcmute.edu.vn').isValid, true);
      assert.equal(validateEmail('admin.tech@domain.org').isValid, true);
      assert.equal(validateEmail('plainaddress').isValid, false);
      assert.equal(validateEmail('@missingusername.com').isValid, false);
      assert.equal(validateEmail('username@.com').isValid, false);
      assert.equal(validateEmail('   ').isValid, false);
    });

    it('validateNumber: validates numbers, integers, and numeric ranges', () => {
      const valid = validateNumber(42, { min: 1, max: 100, integer: true });
      assert.equal(valid.isValid, true);
      assert.equal(valid.value, 42);

      const parsedStr = validateNumber('25', { min: 10, max: 50 });
      assert.equal(parsedStr.isValid, true);
      assert.equal(parsedStr.value, 25);

      assert.equal(validateNumber('not a number').isValid, false);
      assert.equal(validateNumber(3.14, { integer: true }).isValid, false);
      assert.equal(validateNumber(150, { max: 100 }).isValid, false);
      assert.equal(validateNumber(-5, { min: 0 }).isValid, false);
    });

    it('validateUrl: accepts http/https URLs and rejects invalid protocols', () => {
      assert.equal(validateUrl('https://example.com/api').isValid, true);
      assert.equal(validateUrl('http://localhost:3000').isValid, true);
      assert.equal(validateUrl('ftp://server.com').isValid, false);
      assert.equal(validateUrl('javascript:alert(1)').isValid, false);
      assert.equal(validateUrl('not a url').isValid, false);
    });

    it('validateDate & validateDateRange: validates ISO dates and ranges', () => {
      assert.equal(validateDate('2026-10-20T00:00:00Z').isValid, true);
      assert.equal(validateDate('invalid-date').isValid, false);

      const validRange = validateDateRange('2026-01-01', '2026-01-10');
      assert.equal(validRange.isValid, true);

      const invalidRange = validateDateRange('2026-02-01', '2026-01-01');
      assert.equal(invalidRange.isValid, false);
    });

    it('validateFile: checks file extensions and size constraints', () => {
      const validFile = { name: 'handbook.md', size: 1024 * 50 }; // 50KB
      assert.equal(validateFile(validFile).isValid, true);

      const wrongType = { name: 'virus.exe', size: 1024 };
      assert.equal(validateFile(wrongType).isValid, false);

      const oversized = { name: 'giant.md', size: 10 * 1024 * 1024 }; // 10MB > 5MB limit
      assert.equal(validateFile(oversized).isValid, false);

      assert.equal(validateFile(null).isValid, false);
    });
  });

  describe('2. Domain-Specific Application Validators', () => {
    it('validateChatMessage: validates chat query length and non-emptiness', () => {
      const valid = validateChatMessage('What is the tuition fee?');
      assert.equal(valid.isValid, true);
      assert.equal(valid.value, 'What is the tuition fee?');

      assert.equal(validateChatMessage('   ').isValid, false);
      assert.equal(validateChatMessage('').isValid, false);

      const oversized = 'a'.repeat(2001);
      assert.equal(validateChatMessage(oversized).isValid, false);
    });

    it('validateDocumentFilename: protects against path traversal and enforces .md', () => {
      const validWithExt = validateDocumentFilename('regulations.md');
      assert.equal(validWithExt.isValid, true);
      assert.equal(validWithExt.value, 'regulations.md');

      const validWithoutExt = validateDocumentFilename('scholarships');
      assert.equal(validWithoutExt.isValid, true);
      assert.equal(validWithoutExt.value, 'scholarships.md');

      // Traversal attacks
      assert.equal(validateDocumentFilename('../secret.md').isValid, false);
      assert.equal(validateDocumentFilename('sub/dir/doc.md').isValid, false);
      assert.equal(validateDocumentFilename('c:\\windows\\system.md').isValid, false);

      // Invalid characters
      assert.equal(validateDocumentFilename('invalid*char?.md').isValid, false);
      assert.equal(validateDocumentFilename('').isValid, false);
    });

    it('validateDocumentContent: enforces presence of Level-2 section headers', () => {
      const validContent = '## Admission Requirements\n\nStudents must have completed high school.';
      assert.equal(validateDocumentContent(validContent).isValid, true);

      const invalidNoHeader = '# Level 1 Title Only\n\nNo level two header present.';
      assert.equal(validateDocumentContent(invalidNoHeader).isValid, false);

      assert.equal(validateDocumentContent('   ').isValid, false);
    });

    it('validateSystemPrompt: enforces 20–10,000 char boundaries matching server schema', () => {
      const validPrompt = 'You are the helpful SpendWise Assistant answering questions accurately.';
      assert.equal(validateSystemPrompt(validPrompt).isValid, true);

      const tooShort = 'Too short';
      assert.equal(validateSystemPrompt(tooShort).isValid, false);

      const tooLong = 'x'.repeat(10001);
      assert.equal(validateSystemPrompt(tooLong).isValid, false);

      assert.equal(validateSystemPrompt('   ').isValid, false);
    });

    it('validatePagination: validates page and limit bounds', () => {
      const valid = validatePagination(2, 20);
      assert.equal(valid.isValid, true);
      assert.equal(valid.page, 2);
      assert.equal(valid.limit, 20);

      assert.equal(validatePagination(0, 20).isValid, false);
      assert.equal(validatePagination(1, 101).isValid, false);
      assert.equal(validatePagination('abc', 20).isValid, false);
    });

    it('validateSearchQuery: respects maximum query length', () => {
      assert.equal(validateSearchQuery('tuition fee').isValid, true);
      assert.equal(validateSearchQuery('').isValid, true);
      assert.equal(validateSearchQuery('a'.repeat(201)).isValid, false);
    });
  });
});
