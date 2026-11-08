import * as promptsService from './systemPrompt.service.js';
import { updateSystemPromptSchema } from './systemPrompt.schema.js';
import { getValidatedData } from '../../shared/middleware/index.js';


/**
 * GET /api/admin/prompt
 */
export function getPrompt(req, res, next) {
  try {
    const prompt = promptsService.getSystemPrompt();
    res.json({ prompt });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/admin/prompt
 */
export function updatePrompt(req, res, next) {
  try {
    const { prompt } = getValidatedData(res, 'body', updateSystemPromptSchema, req.body, promptsService.PromptServiceError);
    const result = promptsService.saveSystemPrompt(prompt);
    res.json({
      success: true,
      message: result.message,
      prompt: result.prompt,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/admin/prompt/reset
 * Resets active prompt back to the isolated default configuration template.
 */
export function resetPrompt(req, res, next) {
  try {
    const result = promptsService.resetSystemPrompt();
    res.json({
      success: true,
      message: result.message,
      prompt: result.prompt,
    });
  } catch (error) {
    next(error);
  }
}
