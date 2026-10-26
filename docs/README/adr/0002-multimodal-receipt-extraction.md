# ADR 0002: Multimodal AI and Structured Output for Receipt Processing

- **Status:** Accepted and Implemented in Milestone 1
- **Deciders:** SpendWise Engineering Team
- **Date:** 2026-10-24

---

## 1. Context

Users frequently purchase items offline and receive physical receipts or invoices. Manually typing transaction fields—merchant name, transaction date, category, total amount, and line items—creates friction and error rates. The application requires an automated receipt ingestion pipeline that extracts reliable financial data while strictly preventing hallucinated numbers or invalid schema payloads from entering the user's ledger.

Receipt images present significant variations:
- Low-contrast thermal print paper, crumpled receipts, or skewed photo angles.
- Mixed language text (English and Vietnamese, including diacritics).
- Non-standard currency and number formats (e.g., `"500.000đ"`, `"50k"`, `"USD $12.50"`).
- Non-receipt image uploads (e.g., photos of scenery or documents).

---

## 2. Alternatives Considered

### Alternative 1: Traditional OCR Engine (Tesseract.js / EasyOCR) + RegEx Heuristics
* **Pros**: Local processing with zero external API fees.
* **Cons**: Highly brittle on thermal paper receipts, distorted photos, or multi-column layouts. Handcrafted regular expressions fail on diverse Vietnamese date/currency formats and cannot perform intelligent semantic category classification. Requires maintaining large binary OCR packages.

### Alternative 2: Traditional OCR Pipeline + LLM Text Cleanup
* **Pros**: Decouples character extraction from semantic understanding.
* **Cons**: Two-stage failure mode (OCR misreads characters, then LLM hallucinates to fill gaps). Introduces double latency (OCR runtime plus LLM inference time).

### Alternative 3: Native Multimodal LLM (Google Gemini) with Structured Output & Zod Guardrails (Selected)
* **Pros**: Single round-trip inference passing raw image bytes alongside text instructions. Native multimodal vision understands layout, spatial grouping, and multi-currency formats. Direct adherence to JSON Schema via Gemini's `responseJsonSchema` configuration guarantees valid JSON syntax. Category mapping occurs in the same inference step.
* **Cons**: Incurs external API token usage; requires network transmission of image data; requires strict server-side validation to defend against non-receipt images.

---

## 3. Decision

The team adopted **Alternative 3: Native Multimodal LLM with Structured Output and Multi-Layer Guardrails**.

### 3.1. Pre-AI Image Sanitization & Validation
Before any external API call, `server/src/features/expenses/receiptUpload.middleware.js` validates:
* Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`.
* Magic byte verification using file header analysis (preventing disguised executable uploads).
* Image decode validation via `sharp`: maximum dimensions $\le 8000 \times 8000$ pixels; file size $\le 5$ MB.
* Deterministic SHA-256 hash generation for duplicate and audit tracking.

### 3.2. Multi-Stage Private Storage & Processing Lease
* Images are stored in an owner-isolated, private Supabase Storage bucket (`receipts/{userId}/{receiptId}/original`).
* A processing lease is recorded in PostgreSQL via RPC (`create_receipt_upload` and `start_receipt_processing`), guaranteeing idempotency and preventing duplicate concurrent extraction runs.

### 3.3. Native Multimodal Gemini Invocation
In `server/src/shared/integrations/ai/providers/geminiProvider.js` (`extractReceiptImage`):
* Model: `gemini-3.5-flash-lite`.
* Image payload: Transmitted as `inlineData` base64 with MIME type.
* Structured output configuration enforces strict JSON adherence:
  ```javascript
  generationConfig: {
    responseMimeType: 'application/json',
    responseJsonSchema: {
      type: 'object',
      properties: {
        documentType: { type: 'string', enum: ['receipt', 'invoice', 'unknown'] },
        transactionType: { type: 'string', enum: ['expense', 'income', 'unknown'] },
        merchant: { type: ['string', 'null'] },
        transactionDate: { type: ['string', 'null'] },
        totalAmount: { type: ['number', 'null'] },
        currency: { type: 'string' },
        category: { type: 'string', enum: RECEIPT_CATEGORIES },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              amount: { type: ['number', 'null'] }
            }
          }
        }
      }
    },
    temperature: 0
  }
  ```

### 3.4. Post-Extraction Schema Validation & Guardrails
* The returned JSON is validated on the backend via Zod using `receiptExtractionSchema` (`server/src/features/expenses/receipt.schemas.js`).
* Guardrail filter (`server/src/features/expenses/receiptGuardrails.js`):
  * If `documentType === 'unknown'` or if image contains no financial data, extraction returns a safe error code `NOT_A_RECEIPT`.
  * Normalizes amounts (handles thousands separators and converts VND float decimals to standard integer values).
  * Disallows automatic database insertion: extraction returns a staged `draft` object requiring human review.

### 3.5. Human-in-the-Loop Confirmation
* Extracted data is presented to the user in a client-side review modal (`client/src/features/expenses/ExpensePage.jsx`). The user can edit any recognized field or cancel. Only upon explicit submission is the transaction committed to the database.

---

## 4. Rationale

1. **Elimination of Multi-Stage Fragility**: Traditional OCR struggles with Vietnamese accents, varied thermal print quality, and non-tabular layout. Multimodal LLMs parse both text and visual geometry in a single forward pass.
2. **Deterministic Output Syntax**: Google Gemini's schema enforcement eliminates malformed JSON syntax errors, removing the need for regular expression post-processing.
3. **User Agency and Data Quality**: Staging extraction as a reviewable draft prevents incorrect OCR readings from quietly corrupting transaction records.

---

## 5. Consequences & Trade-offs

### Positive
* **High Accuracy & Fault Tolerance**: Robust against poor lighting, wrinkles, and complex Vietnamese receipts.
* **Zero Schema Failures**: Native JSON schema enforcement eliminates malformed JSON syntax errors.
* **Unified Categorization**: Category mapping happens automatically without a second classification call.
* **Deterministic Testing**: Validated against 20 live synthetic evaluation test cases in `evals/receipts/` (85% pass rate on prompt v3).

### Trade-offs / Limitations
* **Cloud Dependency**: Requires active Gemini API credentials and outbound HTTPS connectivity.
* **Token Ingestion Cost**: Sending base64 images consumes approximately 1,200–1,400 tokens per receipt image.
* **Latency**: End-to-end receipt extraction typically takes 4–6 seconds, requiring clear progress feedback in the user interface.
