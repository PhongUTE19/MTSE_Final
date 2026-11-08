import express from 'express';
import * as documentsController from './document.controller.js';
import { validateRequest } from '../../shared/middleware/validateRequest.js';
import {
  createDocumentSchema,
  updateDocumentSchema,
  documentParamsSchema,
} from './document.schema.js';

const router = express.Router();

// GET /api/admin/documents
router.get('/', documentsController.getDocuments);

// GET /api/admin/documents/:filename
router.get("/:filename", validateRequest({ params: documentParamsSchema }), documentsController.getDocument);

// POST /api/admin/documents
router.post("/", validateRequest({ body: createDocumentSchema }), documentsController.createDocument);

// PUT /api/admin/documents/:filename
router.put("/:filename", validateRequest({ params: documentParamsSchema, body: updateDocumentSchema }), documentsController.updateDocument);

// DELETE /api/admin/documents/:filename
router.delete("/:filename", validateRequest({ params: documentParamsSchema }), documentsController.deleteDocument);

export default router;
