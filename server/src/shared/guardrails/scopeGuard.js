import { SERVER_MESSAGES } from '../../constants/index.js';

/**
 * Key terms indicating in-scope student handbook, academic, campus, or institutional inquiries.
 * Checked with word boundaries to avoid false positives (e.g. 'late' inside 'chocolate').
 */
const HANDBOOK_DOMAIN_TERMS = [
  'spendwise', 'expense', 'expenses', 'transaction', 'transactions', 'receipt', 'receipts',
  'category', 'categories', 'budget', 'spending', 'income', 'ocr', 'analytics', 'token',
];

/**
 * Patterns matching topics that are unequivocally outside the mission and knowledge scope
 * of a Student Handbook Assistant (e.g. software engineering tasks, recipes, general trivia, medical advice).
 */
const OUT_OF_SCOPE_PATTERNS = [
  // Coding, software development, debugging
  {
    category: 'coding',
    pattern: /(?:write|code|implement|generate|debug|create|refactor)\s+(?:a\s+)?(?:python|javascript|typescript|java|c\+\+|html|css|sql|bash|react|node|rust|go)\s+(?:script|program|code|function|class|algorithm|component|query|solution)/i,
  },
  {
    category: 'coding',
    pattern: /(?:leetcode|hackerrank|binary search tree|quicksort|merge sort|regex for email|css grid layout)/i,
  },

  // Cooking and recipes
  {
    category: 'culinary',
    pattern: /(?:recipe\s+for|(?:how\s+(?:do\s+i|can\s+i|to)\s+)?(?:bake|cook|fry|grill|roast|make|prepare))\s+.*(?:cake|cookie|cookies|pizza|lasagna|pasta|soup|bread|pie|salmon|steak|cocktail|smoothie|frosting)/i,
  },

  // General world trivia, geopolitics, celebrity gossip
  {
    category: 'world_trivia',
    pattern: /(?:who\s+is\s+(?:the\s+)?(?:president|prime\s+minister|king|queen)\s+of\s+[a-z]+)/i,
  },
  {
    category: 'world_trivia',
    pattern: /(?:what\s+is\s+the\s+capital\s+of\s+[a-z]+)/i,
  },
  {
    category: 'world_trivia',
    pattern: /(?:who\s+won\s+the\s+(?:fifa\s+)?(?:world\s+cup|super\s+bowl|champions\s+league|olympics))/i,
  },

  // Medical diagnosis / prescription
  {
    category: 'medical',
    pattern: /(?:what\s+(?:medicine|pill|drug)\s+(?:should|can)\s+i\s+take\s+for|diagnose\s+my|how\s+to\s+cure\s+my\s+(?:infection|illness|cancer|diabetes))/i,
  },

  // Financial speculation / crypto trading
  {
    category: 'investment',
    pattern: /(?:(?:should\s+i\s+)?(?:buy|invest(?:\s+[^.?!]+)?\s+in|sell|trade)\s+(?:bitcoin|crypto|stocks?|shares|ethereum|doge|forex)|(?:bitcoin|ethereum|cryptocurrency|crypto\s+trading|best\s+stocks?\s+to\s+buy))/i,
  },

  // Creative writing / fiction / roleplay
  {
    category: 'creative_writing',
    pattern: /(?:write\s+(?:a\s+)?(?:poem|poetry|(?:love|fantasy|fictional|short|bedtime)?\s*story|song\s+lyrics|fairy\s+tale|novel)\s+about)/i,
  },
];

/**
 * Classifies whether a user query is in-scope or out-of-scope for the Student Handbook Assistant.
 *
 * Distinguishes:
 * 1. Out-of-scope requests: Unrelated non-university topics (e.g. coding, cooking, trivia) -> Polite decline
 * 2. In-scope questions: University, policy, academic, or general inquiries that might be covered -> Evaluated via RAG
 *
 * @param {string} query - Raw user question
 * @returns {{ isOutOfScope: boolean, category?: string, refusalText?: string }}
 */
export function classifyScope(query) {
  if (!query || typeof query !== 'string') {
    return { isOutOfScope: false };
  }

  const normalized = query.trim().toLowerCase();

  // If the query contains any handbook domain term as a whole word, treat it as in-scope
  const hasHandbookTerm = HANDBOOK_DOMAIN_TERMS.some((term) => {
    const escaped = term.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'i').test(normalized);
  });

  if (hasHandbookTerm) {
    return { isOutOfScope: false };
  }

  // Check against explicit out-of-scope patterns
  for (const { category, pattern } of OUT_OF_SCOPE_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        isOutOfScope: true,
        category,
        refusalText: SERVER_MESSAGES.ERRORS.OUT_OF_SCOPE,
      };
    }
  }

  // Default to in-scope so academic questions (e.g. "What is linear algebra?") proceed to RAG
  // and properly resolve as INSUFFICIENT if not present in the handbook.
  return { isOutOfScope: false };
}
