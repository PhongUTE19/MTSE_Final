export const EVAL_CATEGORIES = Object.freeze({
  SCOPE_POLICY: 'scope_policy',
  RAG_EVIDENCE: 'rag_evidence',
  CITATION_INTEGRITY: 'citation_integrity',
  PROMPT_TRUST_BOUNDARY: 'prompt_trust_boundary',
  RESPONSE_PROPOSAL: 'response_proposal',
  USAGE_TELEMETRY: 'usage_telemetry',
});

export const EVAL_SEVERITIES = Object.freeze({
  P0: 'P0',
  P1: 'P1',
  P2: 'P2',
  P3: 'P3',
});

export const EVAL_CATEGORY_LIST = Object.freeze(Object.values(EVAL_CATEGORIES));
export const EVAL_SEVERITY_LIST = Object.freeze(Object.values(EVAL_SEVERITIES));

function isPlainObject(val) {
  return Boolean(val) && typeof val === 'object' && !Array.isArray(val);
}

export function validateEvalCase(rawCase) {
  if (!isPlainObject(rawCase)) {
    throw new Error('Evaluation case must be a plain object.');
  }

  const { id, category, description } = rawCase;
  if (typeof id !== 'string' || !id.trim()) {
    throw new Error('id must be a non-empty string.');
  }
  if (!EVAL_CATEGORY_LIST.includes(category)) {
    throw new Error(`category must be one of [${EVAL_CATEGORY_LIST.join(', ')}].`);
  }
  if (typeof description !== 'string' || !description.trim()) {
    throw new Error('description must be a non-empty string.');
  }

  const severity = rawCase.severity ?? EVAL_SEVERITIES.P1;
  if (!EVAL_SEVERITY_LIST.includes(severity)) {
    throw new Error(`severity must be one of [${EVAL_SEVERITY_LIST.join(', ')}].`);
  }

  const mandatory = rawCase.mandatory ?? true;
  if (typeof mandatory !== 'boolean') {
    throw new Error('mandatory must be a boolean.');
  }

  const tags = rawCase.tags ?? [];
  if (!Array.isArray(tags) || tags.some((t) => typeof t !== 'string' || !t.trim())) {
    throw new Error('tags must be an array of non-empty strings.');
  }

  if (!isPlainObject(rawCase.input)) {
    throw new Error('input must be a plain object.');
  }
  if (!isPlainObject(rawCase.expected)) {
    throw new Error('expected must be a plain object.');
  }

  return {
    id: id.trim(),
    category,
    description: description.trim(),
    severity,
    mandatory,
    tags: tags.map((t) => t.trim()),
    input: rawCase.input,
    expected: rawCase.expected,
  };
}

export function validateEvalCases(cases) {
  if (!Array.isArray(cases)) {
    throw new Error('Evaluation cases must be an array.');
  }
  const seenIds = new Set();
  return cases.map((rawCase, index) => {
    let validated;
    try {
      validated = validateEvalCase(rawCase);
    } catch (err) {
      throw new Error(`Invalid evaluation case at index ${index}: ${err.message}`);
    }
    if (seenIds.has(validated.id)) {
      throw new Error(`Duplicate evaluation case ID "${validated.id}".`);
    }
    seenIds.add(validated.id);
    return validated;
  });
}
