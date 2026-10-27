import { SERVER_MESSAGES } from '../../constants/index.js';

/**
 * Patterns that indicate adversarial prompt injection, system instruction overrides,
 * jailbreak attempts, or unauthorized system prompt extraction.
 */
const INJECTION_PATTERNS = [
  // Instruction override / directive hijacking
  /(?:ignore|disregard|forget|override|bypass|clear|drop|reset)\s+(?:all\s+)?(?:previous|prior|above|system|existing|default)\s+(?:instructions|prompts?|rules?|directives?|guidelines?|constraints?|restrictions?)/i,
  /(?:new\s+instructions?|system\s+override|admin\s+override|developer\s+override|system\s+directive|system\s+instruction):\s*(?:you\s+(?:are|must)|ignore|forget|do|answer|bypass)/i,
  /(?:stop|cease)\s+being\s+(?:the\s+)?(?:spendwise\s+assistant|an?\s+ai|helpful)/i,

  // Jailbreak, roleplay bypass, unrestricted persona
  /(?:you\s+are\s+now|act\s+as|pretend\s+to\s+be|simulate)\s+(?:DAN|an?\s+unrestricted|an?\s+unfiltered|jailbroken|a\s+hacker|developer\s+mode|god\s+mode)/i,
  /(?:enter|switch\s+to|enable)\s+(?:developer\s+mode|jailbreak\s+mode|unrestricted\s+mode|debug\s+mode|god\s+mode)/i,
  /(?:bypass|disable|turn\s+off|remove)\s+(?:all\s+)?(?:safety|content|security|ethical|moderation)?\s*(?:filters?|restrictions?|rules?|guardrails?|policies)/i,
  /(?:do\s+anything\s+now|without\s+any\s+(?:rules|restrictions|limits))/i,

  // System prompt / secret extraction
  /(?:print|reveal|show|display|repeat|output|dump|leak|tell)\s+(?:(?:me|us)\s+)?(?:your\s+)?(?:exact\s+)?(?:system\s+prompt|initial\s+instructions?|system\s+instructions?|developer\s+prompt|hidden\s+rules?|internal\s+configuration)/i,
  /(?:what\s+(?:is|are)\s+(?:your\s+)?(?:exact\s+)?(?:system\s+prompt|initial\s+instructions?|hidden\s+rules?|developer\s+instructions?))/i,
  /(?:repeat|output|show)\s+(?:everything\s+)?(?:verbatim|word\s+for\s+word|the\s+text\s+above)\s*(?:from\s+the\s+beginning|starting\s+with)?/i,
  /(?:repeat\s+after\s+me\s*:?\s*)?(?:You\s+are\s+the\s+SpendWise\s+Assistant)/i,

  // Delimiter and boundary manipulation
  /(?:<\/?(?:retrieved_context|student_question|user_question|system|prompt|instruction|context)>|\[\/?(?:SYSTEM_PROMPT|INSTRUCTION|SYSTEM|ASSISTANT)\]|<\|im_start\|>|<\|im_end\|>)/i,
];

/**
 * Signature substrings from internal system prompts that must never be leaked
 * in assistant outputs.
 */
const SYSTEM_PROMPT_SIGNATURES = [
  'You are the SpendWise Assistant',
  'Base all factual claims about SpendWise exclusively on',
  'Answer the user\'s question using ONLY the provided context below.',
  'Strict rules:',
  '1. Grounding:',
  'The retrieved context is the sole source of truth',
  '=== UNTRUSTED REFERENCE CONTEXT ===',
  '=== UNTRUSTED USER QUERY ===',
];

/**
 * Detects whether an input string contains prompt injection or system override attempts.
 *
 * @param {string} input - Text to inspect
 * @returns {{ isInjection: boolean, reason?: string, matchedPattern?: string }}
 */
export function detectPromptInjection(input) {
  if (!input || typeof input !== 'string') {
    return { isInjection: false };
  }

  const normalized = input.trim();

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        isInjection: true,
        reason: 'Adversarial instruction override or system prompt extraction attempt detected.',
        matchedPattern: pattern.source,
      };
    }
  }

  return { isInjection: false };
}

/**
 * Inspects generated AI output to prevent accidental leakage of system prompt text
 * or internal guardrail delimiters. Preserves intentional token spacing in streaming deltas.
 *
 * @param {string} output - Raw generated output from the AI provider
 * @param {object} [options]
 * @returns {{ isLeaking: boolean, sanitizedText: string }}
 */
export function sanitizeGeneratedOutput(output, options = {}) {
  if (!output || typeof output !== 'string') {
    return { isLeaking: false, sanitizedText: output || '' };
  }

  let text = output;

  // Check for signature leakage
  for (const signature of SYSTEM_PROMPT_SIGNATURES) {
    if (text.includes(signature)) {
      return {
        isLeaking: true,
        sanitizedText: SERVER_MESSAGES.ERRORS.PROMPT_INJECTION_REFUSAL,
      };
    }
  }

  // Strip simulated tag delimiters if the model echoed them, preserving whitespace
  text = text.replace(/<\/?(?:retrieved_context|student_question|user_question|context|system|prompt|instruction)>/gi, '');

  return {
    isLeaking: false,
    sanitizedText: text,
  };
}
