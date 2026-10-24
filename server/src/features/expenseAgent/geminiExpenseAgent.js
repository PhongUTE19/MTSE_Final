import { GoogleGenAI } from '@google/genai';
import { config } from '../../config.js';
import { withTimeout } from '../../shared/guardrails/index.js';

export const SEARCH_TRANSACTIONS_TOOL = Object.freeze({
  name: 'search_transactions',
  description: 'Search only the authenticated user\'s expense and income transactions. Use ISO YYYY-MM-DD dates and VND numeric amounts.',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      merchant: { type: 'string', description: 'Merchant or store name.' },
      category: { type: 'string', description: 'Transaction category.' },
      type: { type: 'string', enum: ['income', 'expense'] },
      from: { type: 'string', description: 'Start date, YYYY-MM-DD.' },
      to: { type: 'string', description: 'End date, YYYY-MM-DD.' },
      minAmount: { type: 'number', description: 'Inclusive minimum amount.' },
      maxAmount: { type: 'number', description: 'Inclusive maximum amount.' },
      page: { type: 'integer', minimum: 1 },
      pageSize: { type: 'integer', minimum: 1, maximum: 20 },
    },
  },
});

let clientFactory = null;
export function setGeminiExpenseAgentClientFactoryForTests(factory) { clientFactory = factory; }

// Supabase transaction_date là ngày lịch địa phương. Dùng múi giờ Việt Nam
// thay vì UTC của server để “hôm qua/tháng này” không bị lệch ngày lúc nửa đêm.
export function getVietnamDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function getClient() {
  if (clientFactory) return clientFactory();
  if (!config.geminiApiKey) throw new Error('GEMINI_API_KEY is not configured.');
  return new GoogleGenAI({ apiKey: config.geminiApiKey });
}

function systemInstruction(today) {
  return `You are the transaction-search assistant. Today is ${today}. You must use search_transactions to answer every transaction lookup. Convert an unambiguous month/year to its first and last ISO date. Resolve common relative dates using Today: "hôm qua" is the previous calendar day, "tuần trước" is the previous Monday through Sunday, and "tháng này" is the first through last day of the current month. Ask one short clarification only when there is no reliable date range, such as "gần đây" or "một thời gian trước". Never invent transactions or amounts. After receiving tool results, give a concise Vietnamese answer.`;
}

/** Runs exactly one read-only function call, then returns Gemini's natural-language summary. */
export async function runGeminiExpenseAgent(message, executeTool, options = {}) {
  const ai = options.ai || getClient();
  const model = options.model || config.geminiModel;
  const timeoutMs = options.timeoutMs ?? 15000;
  const today = options.today || getVietnamDate();
  const generationConfig = {
    systemInstruction: systemInstruction(today),
    tools: [{ functionDeclarations: [SEARCH_TRANSACTIONS_TOOL] }],
    // AUTO để Gemini có thể xin làm rõ ngày mơ hồ thay vì tự đoán điều kiện lọc.
    // Gemini API chỉ cho phép allowedFunctionNames ở mode ANY. AUTO giữ khả
    // năng hỏi lại khi ngày mơ hồ; tool declaration đã chỉ chứa đúng một tool.
    toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
  };

  const firstResponse = await withTimeout(ai.models.generateContent({
    model, contents: message, config: generationConfig,
  }), timeoutMs, 'Expense search timed out.');
  const call = firstResponse.functionCalls?.[0];
  if (!call) {
    const clarification = firstResponse.text?.trim();
    if (!clarification) throw new Error('Gemini returned neither a function call nor a clarification.');
    return { answer: clarification, toolName: null, toolResult: null };
  }

  const toolResult = await executeTool(call.name, call.args || {});
  const finalResponse = await withTimeout(ai.models.generateContent({
    model,
    contents: [
      { role: 'user', parts: [{ text: message }] },
      firstResponse.candidates?.[0]?.content,
      { role: 'user', parts: [{ functionResponse: { name: call.name, response: toolResult } }] },
    ],
    config: { systemInstruction: systemInstruction(today) },
  }), timeoutMs, 'Expense search timed out.');
  const answer = finalResponse.text?.trim();
  if (!answer) throw new Error('Gemini returned an empty final answer.');
  return { answer, toolName: call.name, toolResult };
}
