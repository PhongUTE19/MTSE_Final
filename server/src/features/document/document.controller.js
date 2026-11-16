import * as documentsService from './document.service.js';
import { documentParamsSchema } from './document.schema.js';
import { getValidatedData } from '../../shared/middleware/index.js';

/**
 * GET /api/admin/document
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
 * GET /api/admin/document/:filename
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
