import express from 'express';
import * as documentsController from './document.controller.js';
import { validateRequest } from '../../shared/middleware/validateRequest.js';
import { documentParamsSchema } from './document.schema.js';

const router = express.Router();

// GET /api/admin/document (read-only document list)
router.get('/', documentsController.getDocuments);

// GET /api/admin/document/:filename (read-only document inspection)
router.get('/:filename', validateRequest({ params: documentParamsSchema }), documentsController.getDocument);

export default router;
