# Flow A & B: Receipt Multimodal Ingestion and Structured Output

**Inspection Revision:** Commit `3634a4e6c61c797a9aed12d81043494c65e5d817` (`refactor-w1`)  
**Inspection Date:** 2026-10-27  
**Capabilities Implemented:** Capability C (Structured Output) & Capability D (Multimodal Input)

---

## 1. Flow A: End-to-End Receipt Image Digitization

### 1.1. Architecture and Call Sequence Diagram

The following Mermaid sequence diagram traces the complete flow from user image selection in the React UI through reverse proxy, image validation, cloud storage, multimodal vision processing, interactive review, and final database insertion:

```mermaid
sequenceDiagram
    autonumber
    actor User as User Browser
    participant UI as ReceiptsView.jsx / ReceiptReview.jsx
    participant ApiClient as expenseApi.js
    participant Nginx as Nginx (client:80)
    participant Express as Express (server:3000)
    participant UploadMW as receiptUpload.middleware.js
    participant ReceiptSvc as receipt.service.js
    participant DB as Supabase PostgreSQL
    participant Storage as Supabase Storage ('receipts')
    participant Sharp as sharp (Image Preprocessor)
    participant Gemini as Google Gemini 3.5 Flash

    User->>UI: Selects receipt image (file picker)
    UI->>UI: Validate MIME type (JPG/PNG/WebP) & size <= 5 MB
    UI->>ApiClient: upload(file)
    ApiClient->>Nginx: POST /api/receipts/upload (multipart/form-data: 'receipt')
    Note over Nginx: Nginx checks client_max_body_size 10M;<br/>Forwards upstream to server:3000
    Nginx->>Express: Proxies POST /api/receipts/upload
    Express->>Express: authenticate middleware: verify Bearer JWT
    Express->>UploadMW: uploadReceiptImage middleware
    Note over UploadMW: Multer validates fileSize <= 5 MB<br/>Sharp verifies magic bytes & dimensions <= 8000px
    UploadMW->>ReceiptSvc: uploadReceipt(user, file, meta)
    
    ReceiptSvc->>DB: RPC create_receipt_upload(filename, mime, size, sha256)
    Note over DB: Creates row in receipts (status='uploaded', storage_path='user_id/receipt_id/original')
    DB-->>ReceiptSvc: receipt record

    ReceiptSvc->>Storage: upload(storage_path, buffer, {upsert: false})
    Storage-->>ReceiptSvc: Upload OK
    
    ReceiptSvc->>DB: RPC start_receipt_processing(p_receipt_id)
    Note over DB: Acquires processing lease (status='processing', attempts=attempts+1)
    DB-->>ReceiptSvc: processing record with lease_id

    ReceiptSvc->>Sharp: prepareImageForExtraction(buffer)
    Sharp-->>ReceiptSvc: Normalized JPEG buffer (max 1600x1600, EXIF-rotated)

    ReceiptSvc->>Gemini: models.generateContent(inlineData base64, responseJsonSchema, prompt-v3)
    Gemini-->>ReceiptSvc: Structured JSON text + usageMetadata
    
    ReceiptSvc->>ReceiptSvc: validateStructuredOutput(text, receiptExtractionSchema)
    ReceiptSvc->>ReceiptSvc: enforceReceiptGuardrails(extraction)
    Note over ReceiptSvc: Checks documentType != 'unknown'<br/>Checks detectPromptInjection in OCR text

    ReceiptSvc->>DB: Server RPC server_complete_receipt_extraction(lease_id, extraction, warnings)
    Note over DB: Updates receipts (status='review_required', extraction=JSON)
    DB-->>ReceiptSvc: Updated receipt row
    
    ReceiptSvc-->>Express: publicReceipt payload
    Express-->>Nginx: HTTP 201 Created { receipt }
    Nginx-->>ApiClient: HTTP 201 Created
    ApiClient-->>UI: Sets receipt state for review

    User->>UI: Reviews draft in ReceiptReview.jsx, edits fields, clicks "Confirm and save"
    UI->>ApiClient: confirmReceipt(receiptId, finalTransaction)
    ApiClient->>Nginx: POST /api/receipts/:id/confirm { finalTransaction }
    Nginx->>Express: Proxies POST /api/receipts/:id/confirm
    Express->>ReceiptSvc: confirmReceipt(user, id, finalTransaction)
    ReceiptSvc->>DB: RPC confirm_receipt_transaction(p_receipt_id, p_final_transaction)
    Note over DB: Checks receipt.status == 'review_required'<br/>Inserts into expense_transactions<br/>Updates receipts.status = 'confirmed', transaction_id = tx.id
    DB-->>ReceiptSvc: { receipt, transaction }
    ReceiptSvc-->>Express: { receipt, transaction }
    Express-->>UI: HTTP 200 OK
    UI->>UI: Refreshes transaction list & closes review modal
```

---

### 1.2. Step-by-Step Execution Stages

#### Stage 1: UI Selection and Client-Side Validation
* **Component:** [`client/src/features/receipts/ReceiptsView.jsx:L42-L83`](../../client/src/features/receipts/ReceiptsView.jsx#L42-L83)
* **Handler:** `uploadReceipt(event)`
* **Client Constraints:** Verifies `file.type` against [`RECEIPT_ACCEPTED_TYPES`](../../client/src/features/expense/expenseConstants.js#L23-L27) (`image/jpeg`, `image/png`, `image/webp`) and `file.size <= MAX_RECEIPT_SIZE_BYTES` (5 MB, [`expenseConstants.js:L29`](../../client/src/features/expense/expenseConstants.js#L29)).
* **Local Preview:** Creates ephemeral preview via `URL.createObjectURL(file)` ([`ReceiptsView.jsx:L52`](../../client/src/features/receipts/ReceiptsView.jsx#L52)), cleanly revoked upon failure or modal close.
* **Concurrency Guard:** Tracks `activeUploadIdRef.current` ([`ReceiptsView.jsx:L51-L62`](../../client/src/features/receipts/ReceiptsView.jsx#L51-L62)) to prevent out-of-order async responses from overwriting current state.

#### Stage 2: Client API Request
* **Module:** [`client/src/features/expense/expenseApi.js:L14-L18`](../../client/src/features/expense/expenseApi.js#L14-L18)
* **Request:** `POST /api/receipts/upload`
* **Payload:** `FormData` with field `receipt: File`
* **Headers:** `Authorization: Bearer <supabase_access_token>` added automatically by [`apiClient.js`](../../client/src/shared/services/apiClient.js#L22).

#### Stage 3: Reverse Proxy (Nginx) & Edge Size Limit
* **Configuration:** [`client/nginx.conf:L6`](../../client/nginx.conf#L6)
* **Directive:** `client_max_body_size 10M;`
* **Architecture Rationale:** Nginx default is `1m`. A 5 MB receipt in multipart encoding generates ~5.01 MB to 5.05 MB of HTTP payload. Setting `client_max_body_size 10M;` allows the 5 MB image plus boundary overhead to pass through to Express. Files over 5 MB are handled by Multer with a user-friendly error message, while requests above 10 MB are blocked at the edge to prevent DoS attacks.

#### Stage 4: Backend Route & Upload Middleware
* **Route Registration:** [`server/src/features/expenses/expenses.routes.js:L18`](../../server/src/features/expenses/expenses.routes.js#L18)
  ```js
  router.post('/receipts/upload', receiptOcrRateLimiter, uploadReceiptImage, controller.upload);
  ```
* **Authentication Guard:** Scoped under `router.use(authenticate)` ([`expenses.routes.js:L12`](../../server/src/features/expenses/expenses.routes.js#L12)), validating the GoTrue JWT.
* **Rate Limiting:** `receiptOcrRateLimiter` limits rapid OCR submissions.
* **Upload Middleware:** [`server/src/features/expenses/receiptUpload.middleware.js:L111-L157`](../../server/src/features/expenses/receiptUpload.middleware.js#L111-L157):
  * Validates `req.is('multipart/form-data')`.
  * Enforces maximum 2 concurrent uploads via `MAX_CONCURRENT_RECEIPT_UPLOADS = 2` ([`receiptUpload.middleware.js:L109`](../../server/src/features/expenses/receiptUpload.middleware.js#L109)).
  * Multer Memory Storage with limits `{ fileSize: 5 * 1024 * 1024, files: 1, fields: 4 }` ([`receiptUpload.middleware.js:L11-L14`](../../server/src/features/expenses/receiptUpload.middleware.js#L11-L14)).
  * Deep magic byte validation in `inspectReceiptImage` ([`receiptUpload.middleware.js:L52-L106`](../../server/src/features/expenses/receiptUpload.middleware.js#L52-L106)): checks PNG signature (`89 50 4E 47 0D 0A 1A 0A`), JPEG SOI marker (`FF D8 FF`), and WebP RIFF/WEBP container headers.
  * Pixel safety check: Decodes image metadata via `sharp(file.buffer, { limitInputPixels: 64000000 })` and rejects dimensions exceeding `MAX_RECEIPT_DIMENSION = 8000` px ([`receiptUpload.middleware.js:L80-L96`](../../server/src/features/expenses/receiptUpload.middleware.js#L80-L96)) to prevent decompression bomb attacks.
  * Computes SHA-256 hash of raw bytes.
  * Attaches `req.receiptFile` and `req.receiptMeta`.

#### Stage 5: Database Upload Registration & Storage Upload
* **Service Method:** [`server/src/features/expenses/receipt.service.js:L169-L195`](../../server/src/features/expenses/receipt.service.js#L169-L195)
* **RPC Call:** `create_receipt_upload` ([`supabase/migrations/202610230002_secure_receipts.sql:L44`](../../supabase/migrations/202610230002_secure_receipts.sql#L44)):
  * Generates receipt UUID `v_receipt_id`.
  * Computes storage path: `<user_id>/<receipt_id>/original`.
  * Inserts record in `public.receipts` with `status = 'uploaded'`.
* **Storage Upload:** Uploads file buffer to Supabase Storage private bucket `'receipts'` using server client (`clientFactory.server().storage.from('receipts').upload(...)`, [`receipt.service.js:L177-L183`](../../server/src/features/expenses/receipt.service.js#L177-L183)).
* **Cleanup on Storage Failure:** If upload to Storage fails, `cleanUpTemporaryReceipt` deletes the database row and any partial Storage object ([`receipt.service.js:L190`](../../server/src/features/expenses/receipt.service.js#L190)).

#### Stage 6: Processing Lease & Image Preprocessing
* **Lease Acquisition:** Calls RPC `start_receipt_processing(p_receipt_id)` ([`supabase/migrations/202610230002_secure_receipts.sql:L45`](../../supabase/migrations/202610230002_secure_receipts.sql#L45)):
  * Locks row `FOR UPDATE`.
  * Transitions status from `'uploaded'`/`'failed'` to `'processing'`.
  * Assigns new `processing_lease_id = gen_random_uuid()`.
  * Increments `attempts = attempts + 1` (capped at 5).
  * Automatically reclaims stale leases where `processing_started_at > now() - interval '10 minutes'`.
* **Vision Preprocessing:** [`server/src/shared/integrations/ai/providers/geminiProvider.js:L466-L478`](../../server/src/shared/integrations/ai/providers/geminiProvider.js#L466-L478) (`prepareImageForExtraction`):
  * Uses Sharp to normalize EXIF orientation via `.rotate()`.
  * Resizes image to fit inside `1600x1600` px without enlargement.
  * Recompresses to JPEG at quality 85 to drastically reduce payload size and token patch counts.

#### Stage 7: Multimodal Extraction & Guardrails
* **Gemini Call:** [`server/src/shared/integrations/ai/providers/geminiProvider.js:L496-L534`](../../server/src/shared/integrations/ai/providers/geminiProvider.js#L496-L534):
  * Sends inline base64 image part with `mimeType: 'image/jpeg'`.
  * Supplies `systemInstruction` / text prompt loaded from `server/prompts/receipts/receipt-v3.md`.
  * Enforces `responseMimeType: 'application/json'` and `responseJsonSchema`.
  * Wraps call in `executeWithRetry` with timeout `15000` ms ([`constants/index.js:GUARDRAIL_CONFIG.DEFAULT_TIMEOUT_MS`](../../server/src/constants/index.js#L11)).
* **Validation & Guardrail Pipeline:**
  1. `validateStructuredOutput` ([`server/src/shared/guardrails/responseValidator.js:L100-L161`](../../server/src/shared/guardrails/responseValidator.js#L100-L161)) executes Zod `receiptExtractionSchema`.
  2. `enforceReceiptGuardrails` ([`server/src/features/expenses/receiptGuardrails.js:L11-L28`](../../server/src/features/expenses/receiptGuardrails.js#L11-L28)):
     * Throws `ReceiptGuardrailError('NOT_A_RECEIPT')` if `documentType === 'unknown'`.
     * Inspects concatenated text fields with `detectPromptInjection(text)` and throws `ReceiptGuardrailError('PROMPT_INJECTION_REJECTED')` if injection signatures are detected.
* **Lease Completion:** Calls server RPC `server_complete_receipt_extraction` ([`supabase/migrations/202610230002_secure_receipts.sql:L47`](../../supabase/migrations/202610230002_secure_receipts.sql#L47)) requiring `public.receipt_auth_role() = 'service_role'`. Updates receipt status to `'review_required'` and persists extracted JSON draft.

#### Stage 8: Review & User Confirmation Gate
* **Review UI:** [`client/src/features/receipts/ReceiptReview.jsx:L20-L100`](../../client/src/features/receipts/ReceiptReview.jsx#L20-L100):
  * Renders image preview via secure signed URL ([`receipt.service.js:previewReceipt:L266-L275`](../../server/src/features/expenses/receipt.service.js#L266-L275)) or local object URL.
  * Mounts editable form pre-filled with extracted data (`buildInitialForm(draft)`).
  * Validates `form.date` matching `YYYY-MM-DD` and `amount > 0` before submit.
* **Confirmation Endpoint:** `POST /api/receipts/:id/confirm`
* **Controller:** [`server/src/features/expenses/expenses.controller.js:confirmReceipt:L119-L132`](../../server/src/features/expenses/expenses.controller.js#L119-L132) validates body against `receiptConfirmSchema` ([`receipt.schemas.js:L204-L222`](../../server/src/features/expenses/receipt.schemas.js#L204-L222)).
* **Atomic Financial Write:** [`supabase/migrations/202610230002_secure_receipts.sql:confirm_receipt_transaction:L54`](../../supabase/migrations/202610230002_secure_receipts.sql#L54):
  * Selects receipt `WHERE id = p_receipt_id AND user_id = auth.uid() FOR UPDATE`.
  * Verifies `status = 'review_required'` (idempotent if already `'confirmed'`).
  * Validates `amount > 0`, non-empty `merchant`, non-empty `category`, and calendar `date`.
  * **Inserts into `public.expense_transactions`**.
  * Updates `public.receipts` setting `status = 'confirmed'`, `transaction_id = tx.id`, and `confirmed_at = now()`.
  * Returns `{ receipt, transaction }`.

#### Stage 9: Discard / Rejection Behavior
* If the user clicks **"Discard"** ([`ReceiptsView.jsx:L107-L116`](../../client/src/features/receipts/ReceiptsView.jsx#L107-L116)), the client calls `DELETE /api/receipts/:id`.
* The server executes `begin_receipt_delete` and `finalize_receipt_delete` ([`receipt.service.js:deleteReceipt:L233-L238`](../../server/src/features/expenses/receipt.service.js#L233-L238)), removing the Storage image and receipt row.
* **No record is ever inserted into `public.expense_transactions`**.

---

### 1.3. Traceability Matrix

| Step | Trigger / Input | File and Line | Function / Handler | Output / Side Effect | Error / Guardrail | Related Test |
|---|---|---|---|---|---|---|
| **1. UI Picker** | User selects file | [`ReceiptsView.jsx:L42-L83`](../../client/src/features/receipts/ReceiptsView.jsx#L42-L83) | `uploadReceipt(event)` | Ephemeral preview URL, sets `processingReceipt` | Rejects MIME not in JPG/PNG/WebP or size > 5 MB | [`receiptUpload.test.js:L14-L72`](../../tests/unit/receiptUpload.test.js#L14-L72) |
| **2. API Request** | Form submit | [`expenseApi.js:L14-L18`](../../client/src/features/expense/expenseApi.js#L14-L18) | `expenseApi.upload(file)` | HTTP POST `multipart/form-data` | Network error handling | [`apiRoutes.test.js:L1-L50`](../../tests/integration/apiRoutes.test.js#L1-L50) |
| **3. Nginx Gateway** | Inbound HTTP request | [`client/nginx.conf:L6`](../../client/nginx.conf#L6) | `server` block directive | Forwards request to `server:3000` | Rejects payloads > 10 MB with HTTP 413 | [`receiptUpload.test.js:L74-L87`](../../tests/unit/receiptUpload.test.js#L74-L87) |
| **4. Auth Middleware** | HTTP Bearer token | [`authenticate.js:L26-L35`](../../server/src/shared/middleware/authenticate.js#L26-L35) | `authenticate(req, res, next)` | Attaches verified `req.user` | HTTP 401 Unauthorized if token missing/invalid | [`expenseAuthRoutes.test.js:L1-L60`](../../tests/integration/expenseAuthRoutes.test.js#L1-L60) |
| **5. Upload Filter** | Raw multipart stream | [`receiptUpload.middleware.js:L111-L157`](../../server/src/features/expenses/receiptUpload.middleware.js#L111-L157) | `uploadReceiptImage(req, res, next)` | In-memory buffer, validated metadata | Rejects > 2 concurrent uploads, non-image bytes, or pixel bomb > 8000px | [`receiptUpload.test.js:L41-L71`](../../tests/unit/receiptUpload.test.js#L41-L71) |
| **6. DB Registration** | Valid image metadata | [`receipt.service.js:L169-L175`](../../server/src/features/expenses/receipt.service.js#L169-L175) | `rpc('create_receipt_upload', ...)` | Inserts `receipts` row (`status='uploaded'`) | Enforces user RLS and SHA-256 format | [`receiptServiceContract.test.js:L42-L65`](../../tests/unit/receiptServiceContract.test.js#L42-L65) |
| **7. Storage Upload** | Valid buffer & path | [`receipt.service.js:L177-L195`](../../server/src/features/expenses/receipt.service.js#L177-L195) | `storage.from('receipts').upload(...)` | Writes file to Supabase Storage | Calls `cleanUpTemporaryReceipt` if storage upload fails | [`receiptServiceContract.test.js:L42-L65`](../../tests/unit/receiptServiceContract.test.js#L42-L65) |
| **8. Processing Lock** | Stored image | [`receipt.service.js:L125-L126`](../../server/src/features/expenses/receipt.service.js#L125-L126) | `rpc('start_receipt_processing', ...)` | Sets `status='processing'`, generates `lease_id` | Rejects concurrent processing, reclaims leases > 10m | [`receiptLeaseLifecycle.test.js:L1-L50`](../../tests/unit/receiptLeaseLifecycle.test.js#L1-L50) |
| **9. Vision Preprocessing**| Raw image buffer | [`geminiProvider.js:L466-L478`](../../server/src/shared/integrations/ai/providers/geminiProvider.js#L466-L478) | `prepareImageForExtraction(image)` | JPEG max 1600x1600 buffer | Preserves fallback image on Sharp error | [`aiProvider.test.js:L1-L50`](../../tests/unit/aiProvider.test.js#L1-L50) |
| **10. Multimodal Call**| Base64 + Prompt | [`geminiProvider.js:L485-L534`](../../server/src/shared/integrations/ai/providers/geminiProvider.js#L485-L534) | `ai.models.generateContent(...)` | Raw JSON candidate string | Retries transient errors (max 3), enforces 15s timeout | [`aiProvider.test.js:L50-L100`](../../tests/unit/aiProvider.test.js#L50-L100) |
| **11. Schema & Normalization**| Raw JSON string | [`receipt.schemas.js:L106-L202`](../../server/src/features/expenses/receipt.schemas.js#L106-L202) | `receiptExtractionSchema.parse(...)` | Coerced date, normalized VND, warnings | Drops malformed items, defaults currency VND | [`receiptDateAndAmountRegression.test.js:L1-L100`](../../tests/unit/receiptDateAndAmountRegression.test.js#L1-L100) |
| **12. Guardrail Enforcement**| Structured draft | [`receiptGuardrails.js:L11-L28`](../../server/src/features/expenses/receiptGuardrails.js#L11-L28) | `enforceReceiptGuardrails(extraction)` | Cleared draft | Rejects `documentType='unknown'` and prompt injections | [`receiptGuardrails.test.js:L1-L35`](../../tests/unit/receiptGuardrails.test.js#L1-L35) |
| **13. Server Completion**| Validated draft | [`receipt.service.js:L130-L136`](../../server/src/features/expenses/receipt.service.js#L130-L136) | `serverRpc('server_complete_receipt_extraction', ...)`| Sets `status='review_required'` in DB | Requires service_role key; rejects expired lease | [`receiptServiceContract.test.js:L10-L40`](../../tests/unit/receiptServiceContract.test.js#L10-L40) |
| **14. Form Review** | User edits fields | [`ReceiptReview.jsx:L32-L50`](../../client/src/features/receipts/ReceiptReview.jsx#L32-L50) | `handleConfirm()` | Validates user edits in UI | Rejects missing date or amount <= 0 | [`clientValidation.test.js:L1-L50`](../../tests/unit/clientValidation.test.js#L1-L50) |
| **15. Atomic Confirm** | Confirmed data | [`receipt.service.js:L225-L231`](../../server/src/features/expenses/receipt.service.js#L225-L231) | `confirmReceipt(user, id, tx)` | **Inserts `expense_transactions`**; marks receipt confirmed | Enforces user RLS and data schema | [`receiptServiceContract.test.js:L100-L140`](../../tests/unit/receiptServiceContract.test.js#L100-L140) |

---

## 2. Part 2: Multimodal Input and Structured Output (Flow B)

### 2.1. Provider Abstraction and Model Call Architecture
* **Provider Object:** [`server/src/shared/integrations/ai/providers/geminiProvider.js:L557-L566`](../../server/src/shared/integrations/ai/providers/geminiProvider.js#L557-L566) (`geminiProvider`).
* **Client Initialization:** Google GenAI SDK (`@google/genai`) instantiated via `getAIClient()` ([`geminiProvider.js:L16-L24`](../../server/src/shared/integrations/ai/providers/geminiProvider.js#L16-L24)).
* **Configured Model:** Evaluates `options.model || config.geminiReceiptModel || config.geminiModel` ([`geminiProvider.js:L491`](../../server/src/shared/integrations/ai/providers/geminiProvider.js#L491)), defaulting to `gemini-3.5-flash-lite`.
* **Image Representation:** Preprocessed binary buffer passed as an inline data part ([`geminiProvider.js:L500`](../../server/src/shared/integrations/ai/providers/geminiProvider.js#L500)):
  ```json
  {
    "inlineData": {
      "mimeType": "image/jpeg",
      "data": "<base64_encoded_image_bytes>"
    }
  }
  ```

### 2.2. Prompt Resolution and Active Version Policy
* **Prompt ID:** `'receipt_extraction'` ([`server/src/features/expenses/receiptPrompt.js:L9`](../../server/src/features/expenses/receiptPrompt.js#L9)).
* **Active Version:** `receipt-v3` ([`receiptPrompt.js:L10`](../../server/src/features/expenses/receiptPrompt.js#L10)).
* **File Location:** [`server/prompts/receipts/receipt-v3.md`](../../server/prompts/receipts/receipt-v3.md).
* **Runtime Selection Rule:** Traced in `getReceiptPrompt(version)` ([`receiptPrompt.js:L18-L32`](../../server/src/features/expenses/receiptPrompt.js#L18-L32)). Loads `receipt-v3.md` from disk. If a requested version file is missing, it logs a warning and falls back to `receipt-v3.md`.
* **Version Standardization Policy:** The repository adheres to the policy of **one active Markdown file per prompt task**. Legacy snapshots (`receipt-v1.md`, `receipt-v2.md`) were consolidated into `receipt-v3.md` and removed. Version history is tracked via Git.

#### Prompt Resolution Matrix

| Prompt ID / Task | Actual File | Loader Function | Runtime Selection Rule | Caller | Model Call | Output Schema | Tests |
|---|---|---|---|---|---|---|---|
| `receipt_extraction` | [`server/prompts/receipts/receipt-v3.md`](../../server/prompts/receipts/receipt-v3.md) | [`getReceiptPrompt`](../../server/src/features/expenses/receiptPrompt.js#L18-L32) | Defaults to `process.env.RECEIPT_PROMPT_VERSION \|\| 'receipt-v3'`; falls back to active file | [`geminiProvider.js:extractReceiptImage:L492`](../../server/src/shared/integrations/ai/providers/geminiProvider.js#L492) | `ai.models.generateContent` | `responseJsonSchema` + `receiptExtractionSchema` | [`promptRegistry.test.js:L1-L50`](../../tests/unit/promptRegistry.test.js#L1-L50), [`receiptDateAndAmountRegression.test.js:L1-L50`](../../tests/unit/receiptDateAndAmountRegression.test.js#L1-L50) |

### 2.3. Output Schema & Strict Normalization Pipeline

The extraction uses a two-tier validation approach:
1. **Gemini Native JSON Schema:** `responseJsonSchema` ([`geminiProvider.js:L504-L531`](../../server/src/shared/integrations/ai/providers/geminiProvider.js#L504-L531)) specifies data types and detailed field descriptions.
2. **Backend Zod Schema:** `receiptExtractionSchema` ([`server/src/features/expenses/receipt.schemas.js:L106-L202`](../../server/src/features/expenses/receipt.schemas.js#L106-L202)) guarantees application invariants and safe fallbacks.

#### Specific Field Rules:
* **Printed Transaction Date:**
  * Schema description mandates printed receipt date; strictly forbids today's date or upload date ([`geminiProvider.js:L510-L513`](../../server/src/shared/integrations/ai/providers/geminiProvider.js#L510-L513)).
  * Preprocessor `normalizeReceiptDate` ([`receipt.schemas.js:L31-L74`](../../server/src/features/expenses/receipt.schemas.js#L31-L74)) supports `YYYY-MM-DD`, `YYYY/MM/DD`, `DD/MM/YYYY`, `DD-MM-YYYY`, and `DD.MM.YYYY` via `isValidCalendarDate` ([`receipt.schemas.js:L25-L29`](../../server/src/features/expenses/receipt.schemas.js#L25-L29)).
  * Unreadable, missing, or future dates normalize to `null`. A review warning is automatically attached ([`receipt.schemas.js:L162-L164`](../../server/src/features/expenses/receipt.schemas.js#L162-L164)).
* **Grand Total vs. Subtotals:**
  * Description requires final grand total, total paid, or amount due; forbids using subtotal, tax, cash tendered, or change ([`geminiProvider.js:L514-L517`](../../server/src/shared/integrations/ai/providers/geminiProvider.js#L514-L517)).
  * Item lines are optional; line-item subtotals are never summed to overwrite an explicit grand total.
* **Vietnamese Currency (VND) Normalization:**
  * Cleaned via `normalizeReceiptAmount` ([`receipt.schemas.js:L76-L88`](../../server/src/features/expenses/receipt.schemas.js#L76-L88)), stripping `₫`, `VND`, and formatting commas.
  * Dot-separator compensation: Vietnamese receipts frequently print `183.000` which vision models may read as `183`. If currency is VND and amount is `< 1000`, `normalizeLikelyVndThousands` multiplies by 1,000 and flags a review warning ([`receipt.schemas.js:L102-L104, L180-L194`](../../server/src/features/expenses/receipt.schemas.js#L102-L104)).
* **Category Normalization:**
  * `normalizeReceiptCategory` ([`receipt.schemas.js:L9-L23`](../../server/src/features/expenses/receipt.schemas.js#L9-L23)) maps informal labels (e.g. "coffee", "grocery", "taxi") into the 9 fixed system categories, defaulting to `'Other expenses'`.

### 2.4. Telemetry and Usage Recording
* Calls `recordUsage` ([`geminiProvider.js:L538-L550`](../../server/src/shared/integrations/ai/providers/geminiProvider.js#L538-L550)):
  * `feature: 'receipt_extraction'`
  * `operation: 'extractReceiptImage'`
  * `promptId: 'receipt_extraction'`
  * `promptVersion: 'receipt-v3'`
  * `promptHash: hashPrompt(prompt)` (SHA-256)
  * Token counts: extracted from `response.usageMetadata` (`promptTokenCount`, `candidatesTokenCount`, `totalTokenCount`).
  * Never stores raw receipt images or extracted items in telemetry to preserve data privacy.
