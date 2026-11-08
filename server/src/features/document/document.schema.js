import { z } from 'zod';
import { SERVER_MESSAGES } from '../../constants/index.js';

/**
 * Schema for document filename parameter and payload.
 * Ensures trimming, .md extension enforcement, path traversal rejection,
 * and alphanumeric/hyphen/underscore format without silently transforming
 * malicious paths into valid filenames.
 */
export const filenameSchema = z.string({
  error: SERVER_MESSAGES.ERRORS.FILENAME_REQUIRED,
})
.trim()
.min(1, { error: SERVER_MESSAGES.ERRORS.FILENAME_REQUIRED })
.refine((val) => !val.includes('/') && !val.includes('\\') && !val.includes('..'), {
  error: SERVER_MESSAGES.ERRORS.INVALID_FILENAME,
})
.transform((val) => (val.endsWith('.md') ? val : `${val}.md`))
.refine((name) => /^[a-zA-Z0-9_\-.]+\.md$/.test(name), {
  error: SERVER_MESSAGES.ERRORS.INVALID_FILENAME,
});

/**
 * Schema for markdown document content.
 * Requires non-empty string and at least one Level-2 section header ('## ').
 */
export const documentContentSchema = z.string({
  error: SERVER_MESSAGES.ERRORS.DOC_CONTENT_EMPTY,
})
.trim()
.min(1, { error: SERVER_MESSAGES.ERRORS.DOC_CONTENT_EMPTY })
.refine((content) => content.split('\n').some((line) => line.startsWith('## ')), {
  error: SERVER_MESSAGES.ERRORS.MISSING_SECTION_HEADER,
});

/**
 * Schema for creating a new document (POST /api/admin/documents).
 */
export const createDocumentSchema = z.object({
  filename: filenameSchema,
  content: documentContentSchema,
  overwrite: z.boolean().optional().default(false),
});

/**
 * Schema for updating an existing document (PUT /api/admin/documents/:filename).
 */
export const updateDocumentSchema = z.object({
  content: documentContentSchema,
});

/**
 * Schema for document path parameters (:filename).
 */
export const documentParamsSchema = z.object({
  filename: filenameSchema,
});
