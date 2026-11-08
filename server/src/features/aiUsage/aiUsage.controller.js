import * as aiUsageService from './aiUsage.service.js';
import { getValidatedData } from '../../shared/middleware/index.js';
import { analyticsFilterSchema, analyticsHistorySchema } from './aiUsage.schema.js';


/**
 * GET /api/admin/ai-usage/overview
 */
export async function getOverview(req, res, next) {
  try {
    const validated = getValidatedData(res, 'query', analyticsFilterSchema, req?.query);
    const data = await aiUsageService.getAnalyticsOverview(validated);
    res.json(data);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/ai-usage/timeseries
 */
export async function getTimeseries(req, res, next) {
  try {
    const validated = getValidatedData(res, 'query', analyticsFilterSchema, req?.query);
    const data = await aiUsageService.getAnalyticsTimeseries(validated);
    res.json(data);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/ai-usage/breakdown
 */
export async function getBreakdown(req, res, next) {
  try {
    const validated = getValidatedData(res, 'query', analyticsFilterSchema, req?.query);
    const data = await aiUsageService.getAnalyticsBreakdown(validated);
    res.json(data);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/ai-usage/history
 */
export async function getHistory(req, res, next) {
  try {
    const validated = getValidatedData(res, 'query', analyticsHistorySchema, req?.query);
    const data = await aiUsageService.getAnalyticsHistory(validated);
    res.json(data);
  } catch (error) {
    next(error);
  }
}
