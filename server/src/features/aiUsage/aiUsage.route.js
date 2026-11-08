import express from 'express';
import { validateRequest } from '../../shared/middleware/validateRequest.js';
import { analyticsFilterSchema, analyticsHistorySchema } from './aiUsage.schema.js';
import * as aiUsageController from './aiUsage.controller.js';

const router = express.Router();

// GET /api/admin/ai-usage/overview
router.get('/overview', validateRequest({ query: analyticsFilterSchema }), aiUsageController.getOverview);

// GET /api/admin/ai-usage/timeseries
router.get('/timeseries', validateRequest({ query: analyticsFilterSchema }), aiUsageController.getTimeseries);

// GET /api/admin/ai-usage/breakdown
router.get('/breakdown', validateRequest({ query: analyticsFilterSchema }), aiUsageController.getBreakdown);

// GET /api/admin/ai-usage/history
router.get('/history', validateRequest({ query: analyticsHistorySchema }), aiUsageController.getHistory);

export default router;
