import * as promptsService from './systemPrompt.service.js';

/**
 * GET /api/admin/system-prompt
 */
export function getPrompt(req, res, next) {
  try {
    const prompt = promptsService.getSystemPrompt();
    res.json({ prompt });
  } catch (error) {
    next(error);
  }
}
