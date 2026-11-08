import fs from 'fs';
import path from 'path';
import { config } from '../../config.js';
import { SERVER_MESSAGES, HTTP_STATUS } from '../../constants/index.js';
import { AppError } from '../../shared/errors/index.js';

export class DocumentServiceError extends AppError {
  constructor(message, statusCode = HTTP_STATUS.BAD_REQUEST) {
    super(message, statusCode);
  }
}

/**
 * Validates and sanitizes document filenames.
 * 
 * @param {string} rawName - Raw input filename
 * @returns {string} Sanitized base filename ending in .md
 */
export function sanitizeFilename(rawName) {
  if (!rawName || typeof rawName !== 'string') {
    throw new DocumentServiceError(SERVER_MESSAGES.ERRORS.FILENAME_REQUIRED, HTTP_STATUS.BAD_REQUEST);
  }
  let name = rawName.trim();
  if (name.includes('/') || name.includes('\\') || name.includes('..')) {
    throw new DocumentServiceError(
      SERVER_MESSAGES.ERRORS.INVALID_FILENAME,
      HTTP_STATUS.BAD_REQUEST
    );
  }
  if (!name.endsWith('.md')) {
    name = `${name}.md`;
  }
  const base = path.basename(name);
  if (base !== name || !/^[a-zA-Z0-9_\-.]+\.md$/.test(base)) {
    throw new DocumentServiceError(
      SERVER_MESSAGES.ERRORS.INVALID_FILENAME,
      HTTP_STATUS.BAD_REQUEST
    );
  }
  return base;
}

/**
 * Validates that markdown content has at least one ## section header.
 * 
 * @param {string} content - Markdown content
 */
export function validateMarkdownContent(content) {
  if (content === undefined || content === null || typeof content !== 'string' || !content.trim()) {
    throw new DocumentServiceError(SERVER_MESSAGES.ERRORS.DOC_CONTENT_EMPTY, HTTP_STATUS.BAD_REQUEST);
  }

  const hasHeader = content.split('\n').some((line) => line.startsWith('## '));
  if (!hasHeader) {
    throw new DocumentServiceError(
      SERVER_MESSAGES.ERRORS.MISSING_SECTION_HEADER,
      HTTP_STATUS.BAD_REQUEST
    );
  }
}

/**
 * Lists all markdown documents in the knowledge directory with metadata.
 * 
 * @returns {Promise<Array<{ filename: string, size: number, modifiedAt: string, sectionCount: number }>>}
 */
export async function listDocuments() {
  if (!fs.existsSync(config.knowledgeDir)) {
    return [];
  }

  const files = fs.readdirSync(config.knowledgeDir).filter((f) => f.endsWith('.md'));
  return files.map((file) => {
    const filePath = path.join(config.knowledgeDir, file);
    const stat = fs.statSync(filePath);
    const content = fs.readFileSync(filePath, 'utf-8');
    const sectionCount = content.split('\n').filter((l) => l.startsWith('## ')).length;

    return {
      filename: file,
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      sectionCount,
    };
  });
}

/**
 * Reads the content of a single markdown document.
 * 
 * @param {string} rawFilename - Filename
 * @returns {Promise<{ filename: string, content: string }>}
 */
export async function readDocument(rawFilename) {
  const filename = sanitizeFilename(rawFilename);
  const filePath = path.join(config.knowledgeDir, filename);

  if (!fs.existsSync(filePath)) {
    throw new DocumentServiceError(SERVER_MESSAGES.ERRORS.DOC_NOT_FOUND(filename), HTTP_STATUS.NOT_FOUND);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  return { filename, content };
}

/**
 * Saves a new document or writes an uploaded file.
 * 
 * @param {object} params
 * @param {string} params.filename - Raw filename
 * @param {string} params.content - Markdown content
 * @param {boolean} [params.overwrite=false] - Whether to overwrite existing file
 * @returns {Promise<{ filename: string, message: string }>}
 */
export async function saveDocument({ filename: rawFilename, content, overwrite = false }) {
  const filename = sanitizeFilename(rawFilename);
  validateMarkdownContent(content);

  if (!fs.existsSync(config.knowledgeDir)) {
    fs.mkdirSync(config.knowledgeDir, { recursive: true });
  }

  const filePath = path.join(config.knowledgeDir, filename);
  if (fs.existsSync(filePath) && !overwrite) {
    throw new DocumentServiceError(
      SERVER_MESSAGES.ERRORS.DOC_ALREADY_EXISTS(filename),
      HTTP_STATUS.CONFLICT
    );
  }

  fs.writeFileSync(filePath, content.trim(), 'utf-8');
  return {
    filename,
    message: SERVER_MESSAGES.SUCCESS.DOC_SAVED(filename),
  };
}

/**
 * Updates an existing document's content.
 * 
 * @param {string} rawFilename - Target filename
 * @param {string} content - New markdown content
 * @returns {Promise<{ filename: string, message: string }>}
 */
export async function updateDocument(rawFilename, content) {
  const filename = sanitizeFilename(rawFilename);
  validateMarkdownContent(content);

  const filePath = path.join(config.knowledgeDir, filename);
  if (!fs.existsSync(filePath)) {
    throw new DocumentServiceError(SERVER_MESSAGES.ERRORS.DOC_DOES_NOT_EXIST(filename), HTTP_STATUS.NOT_FOUND);
  }

  fs.writeFileSync(filePath, content.trim(), 'utf-8');
  return {
    filename,
    message: SERVER_MESSAGES.SUCCESS.DOC_UPDATED(filename),
  };
}

/**
 * Deletes a document from the knowledge base directory.
 * 
 * @param {string} rawFilename - Target filename
 * @returns {Promise<{ filename: string, message: string }>}
 */
export async function removeDocument(rawFilename) {
  const filename = sanitizeFilename(rawFilename);
  const filePath = path.join(config.knowledgeDir, filename);

  if (!fs.existsSync(filePath)) {
    throw new DocumentServiceError(SERVER_MESSAGES.ERRORS.DOC_NOT_FOUND(filename), HTTP_STATUS.NOT_FOUND);
  }

  fs.unlinkSync(filePath);
  return {
    filename,
    message: SERVER_MESSAGES.SUCCESS.DOC_DELETED(filename),
  };
}
