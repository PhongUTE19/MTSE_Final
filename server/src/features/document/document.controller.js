import * as documentsService from './document.service.js';
import { HTTP_STATUS } from '../../constants/index.js';
import {
  createDocumentSchema,
  updateDocumentSchema,
  documentParamsSchema,
} from './document.schema.js';
import { getValidatedData } from '../../shared/middleware/index.js';


/**
 * GET /api/admin/documents
 */
export async function getDocuments(req, res, next) {
  try {
    const documents = await documentsService.listDocuments();
    res.json({ documents });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/documents/:filename
 */
export async function getDocument(req, res, next) {
  try {
    const { filename } = getValidatedData(res, 'params', documentParamsSchema, req.params, documentsService.DocumentServiceError);
    const result = await documentsService.readDocument(filename);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/admin/documents
 */
export async function createDocument(req, res, next) {
  try {
    const { filename, content, overwrite } = getValidatedData(res, 'body', createDocumentSchema, req.body, documentsService.DocumentServiceError);
    const result = await documentsService.saveDocument({ filename, content, overwrite });
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      filename: result.filename,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/admin/documents/:filename
 */
export async function updateDocument(req, res, next) {
  try {
    const { filename } = getValidatedData(res, 'params', documentParamsSchema, req.params, documentsService.DocumentServiceError);
    const { content } = getValidatedData(res, 'body', updateDocumentSchema, req.body, documentsService.DocumentServiceError);
    const result = await documentsService.updateDocument(filename, content);
    res.json({
      success: true,
      filename: result.filename,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/admin/documents/:filename
 */
export async function deleteDocument(req, res, next) {
  try {
    const { filename } = getValidatedData(res, 'params', documentParamsSchema, req.params, documentsService.DocumentServiceError);
    const result = await documentsService.removeDocument(filename);
    res.json({
      success: true,
      filename: result.filename,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
}
