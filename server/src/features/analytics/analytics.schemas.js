import { z } from 'zod';
import {
  OUTCOMES,
  TIME_WINDOW_MS,
  DEFAULT_TIME_RANGE,
  PAGINATION_DEFAULTS,
} from './analytics.constants.js';
import { zodIntegerParam } from '../../shared/validation/pagination.js';

export const TIME_RANGE_OPTIONS = [...Object.keys(TIME_WINDOW_MS), 'all'];
export const OUTCOME_OPTIONS = [...Object.values(OUTCOMES), 'all'];

/**
 * Schema for common analytics filters.
 */
export const analyticsFilterSchema = z.object({
  timeRange: z.enum(TIME_RANGE_OPTIONS).optional().default(DEFAULT_TIME_RANGE),
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
  feature: z.string().optional().default('all'),
  model: z.string().optional().default('all'),
  outcome: z.enum(OUTCOME_OPTIONS).optional().default('all'),
});

/**
 * Schema for paginated request history queries.
 */
export const analyticsHistorySchema = z.object({
  page: zodIntegerParam({
    defaultValue: PAGINATION_DEFAULTS.DEFAULT_PAGE,
    min: 1,
  }),
  limit: zodIntegerParam({
    defaultValue: PAGINATION_DEFAULTS.DEFAULT_LIMIT,
    min: 1,
    max: PAGINATION_DEFAULTS.MAX_LIMIT,
  }),
  timeRange: z.enum(TIME_RANGE_OPTIONS).optional().default(DEFAULT_TIME_RANGE),
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
  feature: z.string().optional().default('all'),
  model: z.string().optional().default('all'),
  outcome: z.enum(OUTCOME_OPTIONS).optional().default('all'),
});
