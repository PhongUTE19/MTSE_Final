import { detectPromptInjection } from '../../shared/guardrails/index.js';

export class ReceiptGuardrailError extends Error {
  constructor(failureCode, safeMessage) {
    super(safeMessage);
    this.receiptFailureCode = failureCode;
    this.safeMessage = safeMessage;
  }
}

export function enforceReceiptGuardrails(extraction) {
  if (!extraction || typeof extraction !== 'object') {
    throw new ReceiptGuardrailError('EXTRACTION_FAILED', 'Invalid extraction output structure.');
  }
  if (extraction.documentType === 'unknown') {
    throw new ReceiptGuardrailError('NOT_A_RECEIPT', 'This image does not appear to be a receipt. No transaction was created.');
  }
  const text = [
    extraction.merchant,
    extraction.note,
    extraction.category,
    ...(Array.isArray(extraction.items) ? extraction.items.map((item) => item?.name) : []),
  ].filter(Boolean).join('\n');
  if (detectPromptInjection(text).isInjection) {
    throw new ReceiptGuardrailError('PROMPT_INJECTION_REJECTED', 'Unsafe instructions were detected in the image. No transaction was created.');
  }
  return extraction;
}
