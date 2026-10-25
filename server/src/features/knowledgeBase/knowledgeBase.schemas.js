import { z } from 'zod';
import { PAGINATION_LIMITS } from '../../constants/index.js';
import { parseIntegerParam, parseSearchParam } from '../../shared/validation/pagination.js';

export { parseIntegerParam, parseSearchParam };

/**
 * Schema for chunk pagination and search query parameters (GET /api/admin/chunks).
 * Parses numeric strings from query parameters, applies defaults (limit=10, offset=0),
 * and clamps within allowed bounds (1–50 limit, >=0 offset) preserving pre-Phase-4 semantics.
 */
export const paginationQuerySchema = z.object({
  limit: z.any().optional(),
  offset: z.any().optional(),
  search: z.any().optional(),
  q: z.any().optional(),
}).transform((data) => ({
  limit: parseIntegerParam(
    data.limit,
    PAGINATION_LIMITS.DEFAULT_LIMIT,
    PAGINATION_LIMITS.MIN_LIMIT,
    PAGINATION_LIMITS.MAX_LIMIT
  ),
  offset: parseIntegerParam(
    data.offset,
    PAGINATION_LIMITS.DEFAULT_OFFSET,
    PAGINATION_LIMITS.DEFAULT_OFFSET
  ),
  search: parseSearchParam(data.q, data.search),
}));
