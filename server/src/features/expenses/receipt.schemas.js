import { z } from 'zod';

export const RECEIPT_CATEGORIES = [
  'Food & dining', 'Transportation', 'Shopping', 'Education', 'Health',
  'Entertainment', 'Salary', 'Other income', 'Other expenses',
];

const nullableText = (max) => z.string().trim().max(max).nullable().optional().transform((value) => value || null);
function normalizeReceiptCategory(value) {
  if (typeof value !== 'string') return value;
  const normalized = value.trim().toLowerCase();
  const exact = RECEIPT_CATEGORIES.find((category) => category.toLowerCase() === normalized);
  if (exact) return exact;
  if (/(food|dining|restaurant|cafe|coffee|grocery)/.test(normalized)) return 'Food & dining';
  if (/(transport|travel|taxi|fuel|parking)/.test(normalized)) return 'Transportation';
  if (/(shop|retail|clothing)/.test(normalized)) return 'Shopping';
  if (/(tuition|book|course|school|education)/.test(normalized)) return 'Education';
  if (/(medical|health|hospital|pharmacy)/.test(normalized)) return 'Health';
  if (/(movie|game|entertainment|music)/.test(normalized)) return 'Entertainment';
  if (/(salary|wage|payroll)/.test(normalized)) return 'Salary';
  if (/(income|refund)/.test(normalized)) return 'Other income';
  return 'Other expenses';
}

function normalizeReceiptItems(value) {
  if (!Array.isArray(value)) return value;
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const name = item.name ?? item.description ?? item.item ?? item.product ?? item.title;
    if (typeof name !== 'string' || !name.trim()) return [];
    return [{ name: name.trim(), amount: item.amount ?? item.price ?? item.total ?? null }];
  });
}

function normalizeLikelyVndThousands(value) {
  return Number.isFinite(value) && value > 0 && value < 1000 ? value * 1000 : value;
}

export const receiptExtractionSchema = z.object({
  documentType: z.enum(['receipt', 'invoice', 'unknown']).default('receipt'),
  transactionType: z.enum(['expense', 'income', 'unknown']).default('expense'),
  merchant: nullableText(120),
  transactionDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional()
    .transform((value) => value || null),
  totalAmount: z.coerce
    .number()
    .positive()
    .nullable()
    .optional()
    .transform((value) => (Number.isFinite(value) ? value : null)),
  currency: z.preprocess(
    (value) => (typeof value === 'string' && value.trim().length === 3 ? value.trim().toUpperCase() : 'VND'),
    z.string().length(3).default('VND')
  ),
  // Gemini may use a valid real-world label outside the application's fixed
  // category set. Normalize it before validation so a reviewable receipt is
  // never discarded solely for that non-critical field.
  category: z.preprocess(
    normalizeReceiptCategory,
    z.enum(RECEIPT_CATEGORIES).default('Other expenses')
  ),
  note: nullableText(500),
  // Itemization is useful but optional. Keep valid lines and discard malformed
  // AI lines instead of rejecting an otherwise reviewable receipt.
  items: z.preprocess(
    normalizeReceiptItems,
    z
      .array(
        z.object({
          name: z.string().trim().min(1).max(120),
          amount: z.coerce
            .number()
            .nonnegative()
            .nullable()
            .optional()
            .transform((value) => (Number.isFinite(value) ? value : null)),
        })
      )
      .max(50)
      .default([])
  ),
  warnings: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
}).strict().transform((extraction) => {
  // Vietnamese receipts commonly use a period as a thousands separator
  // (for example, 183.000 VND). Gemini sometimes returns 183 instead of
  // 183000 after visual parsing. VND has no commonly used fractional unit;
  // small positive values are therefore normalized for receipt review.
  if (extraction.currency !== 'VND') return extraction;
  const totalAmount =
    extraction.totalAmount === null
      ? null
      : normalizeLikelyVndThousands(extraction.totalAmount);
  const items = extraction.items.map((item) => ({
    ...item,
    amount: item.amount === null ? null : normalizeLikelyVndThousands(item.amount),
  }));
  const changed =
    totalAmount !== extraction.totalAmount ||
    items.some((item, index) => item.amount !== extraction.items[index].amount);
  return {
    ...extraction,
    totalAmount,
    items,
    warnings: changed
      ? [
          ...extraction.warnings,
          'VND values under 1,000 were normalized as thousands; please review before saving.',
        ]
      : extraction.warnings,
  };
});

export const receiptConfirmSchema = z.object({
  finalTransaction: z.object({
    type: z.enum(['income', 'expense']),
    amount: z.coerce.number().positive(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    category: z.string().trim().min(1).max(60),
    merchant: z.string().trim().min(1).max(120),
    note: z.string().trim().max(500).optional().default(''),
    items: z
      .array(
        z.object({
          name: z.string().trim().min(1),
          amount: z.coerce.number().nonnegative(),
        })
      )
      .optional()
      .default([]),
  }),
});
