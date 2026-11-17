# 04 — Use Case Specifications

> **Package:** SpendWise Academic Software Requirements Specification (SRS)  
> **Related Documents:** [`01-scope-and-user-roles.md`](./01-scope-and-user-roles.md), [`02-business-rules.md`](./02-business-rules.md), [`03-use-case-diagram.md`](./03-use-case-diagram.md)

---

### UC-001 Sign In / Sign Up / Reset Password

| **Field** | **Details** |
| --- | --- |
| Use Case Name | UC-001 Sign In / Sign Up / Reset Password |
| Primary Actor | Guest (also usable by Authenticated User or Administrator when unauthenticated) |
| Trigger | The actor navigates to the authentication or password-reset page and submits credentials. |
| Description | Authenticates an existing user or administrator, registers a new standard user account, or completes a password-reset flow via Supabase GoTrue so the actor can access their role-appropriate workspace. Related Business Rules: `BR-001`, `BR-002`. |
| Pre-Conditions | Public Supabase runtime configuration (`supabaseUrl`, `supabaseAnonKey`) is loaded by the client application. |
| Post-Conditions | On success, a valid Supabase JWT session with `app_metadata.role` (`user` or `admin`) is active and the actor is redirected to `/home` (or an allowed destination path). |
| Main Flow | 1. The actor opens `/auth` and enters email and password.<br>2. The actor submits the Sign In form.<br>3. The system sends the authentication request to Supabase Auth (GoTrue).<br>4. Supabase Auth verifies credentials and returns a JWT session containing `app_metadata.role`.<br>5. The system validates the post-authentication destination path and redirects the actor to `/home`. |
| Alternative Flow | 1a. **Sign Up:** The actor selects the Sign Up tab on `/auth`, submits a valid email and password, and creates a new `'user'` account.<br>1b. **Password Reset:** The actor requests a password-reset email or submits a new password on `/reset-password`.<br>5a. **Allowed Destination Redirect:** If a safe internal `next` path is present and permitted for the actor's role, the system redirects there instead of `/home`. |
| Exception Flow | 3.1. **Invalid Credentials or Validation Failure:** If email format, password length, or credentials are invalid, Supabase Auth rejects the request and the system displays a formatted authentication error.<br>3.2. **Rate Limit Exceeded:** If too many authentication/email attempts occur (`HTTP 429`), the system displays rate-limit guidance (with retry duration when provided).<br>3.3. **Session Expiration:** If an active session later receives `HTTP 401` from the backend, the shared unauthorized handler signs the user out and dispatches an unauthorized-session event to return to `/auth`. |

---

### UC-002 Manage Confirmed Transactions

| **Field** | **Details** |
| --- | --- |
| Use Case Name | UC-002 Manage Confirmed Transactions |
| Primary Actor | Authenticated User |
| Trigger | The user opens the Transactions view (`/expense/transactions`) and creates, edits, or deletes a transaction. |
| Description | Allows an Authenticated User to create, view, update, or delete confirmed income and expense records in VND within their personal ledger. Administrators cannot access this use case (`403 Forbidden`). Related Business Rules: `BR-002`, `BR-003`, `BR-004`, `BR-006`, `BR-007`. |
| Pre-Conditions | The actor is signed in with `app_metadata.role = 'user'`. |
| Post-Conditions | Confirmed transactions in `public.expense_transactions` reflect the requested creation, update, or deletion for the authenticated owner only. |
| Main Flow | 1. The user opens `/expense/transactions` and selects Add Transaction.<br>2. The user enters transaction fields (`type`, `amount` in VND, `category`, `transaction_date`, optional `merchant` and `note`) and submits.<br>3. The system sends `POST /api/transaction` with the Bearer JWT.<br>4. The backend verifies authentication, `'user'` role, and Zod schema rules (positive VND amount and valid UTC calendar date).<br>5. The backend persists the row in `public.expense_transactions` under RLS (`auth.uid() = user_id`) and returns the saved record.<br>6. The client refreshes the transaction list and summary views. |
| Alternative Flow | 1a. **View Single Transaction:** The user selects an existing transaction (`GET /api/transaction/:id`) to inspect its details.<br>1b. **Update Transaction:** The user edits an existing transaction and submits (`PUT /api/transaction/:id`).<br>1c. **Delete Transaction:** The user confirms deletion of an existing transaction (`DELETE /api/transaction/:id`). |
| Exception Flow | 4.1. **Unauthenticated or Wrong Role:** Missing/invalid JWT returns `HTTP 401` (triggering sign-out); an Administrator receives `HTTP 403`.<br>4.2. **Validation Error:** Non-VND/non-positive amount or invalid calendar date (such as a non-existent day) fails Zod validation with `HTTP 400`.<br>5.1. **Not Found or Persistence Error:** Accessing or mutating a non-existent or unowned transaction returns `HTTP 404`; database errors return a structured error response. |

---

### UC-003 Search, Filter & Paginate Transactions

| **Field** | **Details** |
| --- | --- |
| Use Case Name | UC-003 Search, Filter & Paginate Transactions |
| Primary Actor | Authenticated User |
| Trigger | The user enters a search keyword, selects filters/sorting, or changes pages on `/expense/transactions`. |
| Description | Retrieves a paginated, sorted, and filtered subset of the user's confirmed VND transactions from the backend ledger. Related Business Rules: `BR-002`, `BR-003`. |
| Pre-Conditions | The actor is signed in with `app_metadata.role = 'user'`. |
| Post-Conditions | The UI displays the matching page of transactions and total count without altering database state. |
| Main Flow | 1. The user enters a search term and/or selects filters (`type`, `category`, date range, amount bounds), sort order, and page number.<br>2. The client requests `GET /api/transaction` with query parameters.<br>3. The backend validates query parameters, encodes the search term safely for PostgREST `.or()` filtering on `merchant` and `note`, and queries `public.expense_transactions` under RLS.<br>4. The backend returns the matching `rows` and `total` count.<br>5. The client renders the updated table and pagination controls. |
| Alternative Flow | 1a. **Empty Search / Reset Filters:** Clearing the search box or filters requests an unfiltered paginated list.<br>3a. **No Matching Rows:** The backend returns an empty `rows` array (`total: 0`), and the UI displays an empty-state message. |
| Exception Flow | 3.1. **Invalid Query Parameters:** Invalid date, amount, or pagination parameters fail Zod validation (`HTTP 400`).<br>3.2. **Search Wildcard Limitation:** Under PostgREST `ilike` semantics, literal `*` characters in search terms are escaped to prevent unbounded wildcard broadening, though exact literal `*` matching is not guaranteed without a dedicated database RPC. |

---

### UC-004 Upload Receipt for Stateless OCR

| **Field** | **Details** |
| --- | --- |
| Use Case Name | UC-004 Upload Receipt for Stateless OCR |
| Primary Actor | Authenticated User |
| Trigger | The user selects a receipt image file and submits it for scanning on `/expense/receipts` or in the Expense Assistant drawer. |
| Description | Sends a receipt image to the backend for stateless Google Gemini multimodal extraction and stages the resulting candidate `TransactionDraft` and image `Blob` locally in browser IndexedDB without writing to PostgreSQL or Supabase Storage. Related Business Rules: `BR-004`, `BR-005`, `BR-006`, `BR-008`. |
| Pre-Conditions | The actor is signed in with `app_metadata.role = 'user'`; the selected file is JPEG, PNG, or WebP and at most 5 MB. |
| Post-Conditions | Extracted candidate fields and the temporary receipt image `Blob` are staged as a local `TransactionDraft` in `userId`-scoped browser IndexedDB; the official database ledger and Supabase Storage remain untouched. |
| Main Flow | 1. The user selects a receipt image and initiates upload.<br>2. The client sends a multipart request to `POST /api/receipt/upload`.<br>3. The backend verifies authentication, `'user'` role, rate limits, and file MIME/size, preprocesses the image with Sharp, and invokes Gemini Vision with a strict JSON schema.<br>4. The backend validates the extracted fields and returns `201 { receipt }` without persisting to PostgreSQL or Storage.<br>5. The client creates a `userId`-scoped `TransactionDraft` in browser IndexedDB containing the extracted fields, any currency warnings, and the local image `Blob`. |
| Alternative Flow | 4a. **Non-VND Receipt Detected:** If Gemini extracts a non-VND currency, the backend preserves the warning and flags the draft for mandatory user review rather than silently converting to VND. |
| Exception Flow | 3.1. **Invalid File or Size:** Unsupported MIME types or files exceeding 5 MB are rejected with `HTTP 400`.<br>3.2. **Rate Limit Exceeded:** Exceeding the receipt OCR rate limit returns `HTTP 429`.<br>3.3. **AI Provider Failure:** If Gemini OCR fails or returns invalid structured output, the backend returns a structured error and no draft is created. |

---

### UC-005 Review & Edit Local TransactionDraft

| **Field** | **Details** |
| --- | --- |
| Use Case Name | UC-005 Review & Edit Local TransactionDraft |
| Primary Actor | Authenticated User |
| Trigger | A local `TransactionDraft` is staged (from `UC-004` receipt OCR or `UC-008` AI proposal) and opened by the user for review. |
| Description | Enables the user to inspect, edit, save locally, or reject an unconfirmed `TransactionDraft` stored in browser IndexedDB before deciding whether to commit it (`UC-006`). Related Business Rules: `BR-004`, `BR-005`, `BR-006`, `BR-009`. |
| Pre-Conditions | The actor is signed in with `app_metadata.role = 'user'` and has at least one `TransactionDraft` in `userId`-scoped IndexedDB. |
| Post-Conditions | The local IndexedDB draft reflects the user's edits or rejection status; no confirmed database transaction or Storage object is deleted or created by reviewing or rejecting. |
| Main Flow | 1. The user opens a staged `TransactionDraft` in the review drawer or Scan Receipt view.<br>2. The system displays the candidate fields (and local image preview if from a receipt), along with any currency or extraction warnings.<br>3. The user edits fields (such as `amount` in VND, `category`, `transaction_date`, `merchant`, or `note`).<br>4. The system saves updated field values into the user's local IndexedDB store. |
| Alternative Flow | 3a. **Reject / Discard Draft:** The user rejects or discards the draft; the system updates/removes only the browser-local IndexedDB entry and preserves any previously confirmed `public.receipts` rows or Supabase Storage objects.<br>4a. **Proceed to Confirmation:** The user chooses to confirm the reviewed draft, invoking `UC-006`. |
| Exception Flow | 2.1. **Cross-Device Unavailability:** Because `TransactionDraft`s are stored in browser-local IndexedDB, drafts staged on another browser or device are not available. |

---

### UC-006 Confirm Draft to Official Ledger

| **Field** | **Details** |
| --- | --- |
| Use Case Name | UC-006 Confirm Draft to Official Ledger |
| Primary Actor | Authenticated User |
| Trigger | The user clicks Confirm on a reviewed `TransactionDraft` (`UC-005`). |
| Description | Atomically commits a reviewed `TransactionDraft` to the official PostgreSQL ledger (`public.expense_transactions`), and for receipt drafts also uploads the receipt image to private Supabase Storage and records `public.receipts`. Related Business Rules: `BR-003`, `BR-004`, `BR-006`, `BR-007`, `BR-008`. |
| Pre-Conditions | The actor is signed in as `'user'`, and the draft contains valid VND amount, type, category, and UTC calendar date. |
| Post-Conditions | An official transaction row is persisted in `public.expense_transactions` (and for receipt drafts, the image is stored in private Storage and linked via `public.receipts`), and the local IndexedDB draft is marked/removed as confirmed. |
| Main Flow | 1. The user confirms the reviewed `TransactionDraft`.<br>2. For a **receipt draft**, the client submits multipart data (`draftId`, receipt `Blob`, and confirmed fields) to `POST /api/receipt/confirm`.<br>3. The backend uploads the image to private Supabase Storage (`receipts/<user_id>/<draft_id>/original`) and invokes the `confirm_staged_receipt_transaction` PostgreSQL RPC.<br>4. The RPC atomically inserts the `public.receipts` and `public.expense_transactions` rows (idempotently per `(user_id, draft_id)`).<br>5. The client marks/removes the local IndexedDB draft and refreshes the ledger and receipt list. |
| Alternative Flow | 2a. **AI Proposal or Manual Draft:** If the draft originated from an AI `propose_transaction` card rather than a receipt, the client calls `POST /api/transaction` (with `client_request_id`) to persist the official transaction without a Storage upload.<br>4a. **Idempotent Replay:** If the same `(user_id, draft_id)` is confirmed again, the RPC returns the existing committed record (`HTTP 200`) without creating duplicate rows. |
| Exception Flow | 3.1. **Storage Upload Failure:** If uploading to Supabase Storage fails, the RPC is not executed and the official ledger remains unchanged.<br>4.1. **Validation or RPC Error:** Invalid VND amounts, invalid dates, or RPC authorization checks abort the transaction cleanly and return an error so the user can fix the draft in IndexedDB. |

---

### UC-007 Preview Confirmed Receipt Image

| **Field** | **Details** |
| --- | --- |
| Use Case Name | UC-007 Preview Confirmed Receipt Image |
| Primary Actor | Authenticated User |
| Trigger | The user clicks Preview on a confirmed transaction or receipt record. |
| Description | Requests a short-lived signed URL from the backend to securely display a confirmed receipt image stored in the private Supabase Storage `receipts` bucket. Related Business Rules: `BR-002`, `BR-003`. |
| Pre-Conditions | The actor is signed in as `'user'` and owns the confirmed receipt record. |
| Post-Conditions | The client displays the receipt image using the time-bound signed URL; public bucket access remains disabled. |
| Main Flow | 1. The user requests to preview an owned receipt.<br>2. The client calls `GET /api/receipt/:id/preview`.<br>3. The backend verifies authentication, `'user'` role, and ownership of the receipt record under RLS.<br>4. The backend requests a short-lived signed URL from Supabase Storage and returns it to the client.<br>5. The client renders the receipt image preview. |
| Alternative Flow | 1a. **Local Unconfirmed Draft Preview:** Unconfirmed receipt drafts preview their local IndexedDB `Blob` directly in the browser without calling `/api/receipt/:id/preview`. |
| Exception Flow | 3.1. **Not Found or Unauthorized:** If the receipt does not exist or belongs to another user, the backend returns `HTTP 404` / `HTTP 403`.<br>4.1. **Storage Error:** If signed URL generation fails, the backend returns a structured error and the UI shows a preview-unavailable notice. |

---

### UC-008 Chat with Unified AI Assistant (SSE)

| **Field** | **Details** |
| --- | --- |
| Use Case Name | UC-008 Chat with Unified AI Assistant (SSE) |
| Primary Actor | Authenticated User |
| Trigger | The user submits a message in the `ExpenseAssistant` side drawer. |
| Description | Streams a response from the Unified Assistant Orchestrator (`CHAT_STRATEGY=unified`) over Server-Sent Events (SSE), combining personal finance tools, optional Qdrant RAG retrieval, citation validation, and draft-only transaction proposals. Related Business Rules: `BR-002`, `BR-010`, `BR-011`, `BR-012`. |
| Pre-Conditions | The actor is signed in with `app_metadata.role = 'user'`. |
| Post-Conditions | The assistant response and validated `[S#]` sources are delivered to the client and persisted in server-authoritative Chat History; any `propose_transaction` output is staged only as an unconfirmed local `TransactionDraft`. |
| Main Flow | 1. The user submits a message in `ExpenseAssistant`.<br>2. The client sends `POST /api/chat-assistant/stream` via `authenticatedFetch()` with `Accept: text/event-stream`.<br>3. Before opening the SSE stream, the backend validates JWT, `'user'` role, rate limits, Zod schema, and prompt-injection checks, and calls `begin_chat_stream_turn` RPC.<br>4. The backend loads server-authoritative conversation history and starts streaming (`meta`, `delta`, optional `proposal`, `sources`, `done`).<br>5. The orchestrator executes bounded tool/RAG rounds (`search_transactions`, `get_spending_summary`, `search_knowledge_base`, `propose_transaction`), wrapping retrieved KB chunks as untrusted reference data.<br>6. The backend validates `[S#]` citations against retrieved sources, persists the final assistant message, and closes the stream with `done`.<br>7. If a `proposal` event was received, the client stages an unconfirmed `TransactionDraft` in IndexedDB for user review (`UC-005`). |
| Alternative Flow | 2a. **Synchronous Endpoint / Facade:** Callers using `POST /api/chat-assistant` (without streaming) or `POST /api/expense-assistant` receive a normalized JSON response instead of SSE.<br>5a. **Qdrant Unavailable:** If Qdrant is unconfigured or unavailable, personal finance tools still work and Knowledge Base queries report insufficient evidence deterministically.<br>4a. **User Cancellation:** If the user cancels (`AbortSignal`), the client aborts the fetch without triggering unauthorized sign-out, and the backend aborts the upstream AI request and marks the turn `aborted`. |
| Exception Flow | 3.1. **HTTP 401 Session Expired:** If `POST /api/chat-assistant/stream` returns `HTTP 401`, `sendChatMessageStream` invokes the shared `handleUnauthorized()` handler once (without retrying) and signs the user out.<br>3.2. **Pre-Stream Validation Error:** Invalid message payloads return `HTTP 400` JSON before SSE headers are sent.<br>5.1. **Mid-Stream Provider or Graceful-Shutdown Termination:** Provider failures emit an SSE `error` event and mark the message `failed`; server `SIGTERM`/`SIGINT` drains active SSE streams within the grace period before aborting lingering streams. |

---

### UC-009 Manage Server-Authoritative Chat History

| **Field** | **Details** |
| --- | --- |
| Use Case Name | UC-009 Manage Server-Authoritative Chat History |
| Primary Actor | Authenticated User |
| Trigger | The user lists, opens, creates, renames, or deletes conversations in the assistant drawer, or sends a chat turn (`UC-008`). |
| Description | Persists and manages user-owned conversation threads and messages in PostgreSQL (`public.chat_conversations`, `public.chat_messages`) separately from editable IndexedDB `TransactionDraft`s. Related Business Rules: `BR-002`, `BR-003`, `BR-011`. |
| Pre-Conditions | The actor is signed in with `app_metadata.role = 'user'`. |
| Post-Conditions | Conversation metadata and message history reflect the requested operation under RLS (`auth.uid() = user_id`), without mutating `expense_transactions`. |
| Main Flow | 1. The user opens the conversation history panel in `ExpenseAssistant`.<br>2. The client calls `GET /api/chat-history` to list owned conversations ordered by `updated_at desc`.<br>3. The user selects a conversation (`GET /api/chat-history/:id`) to load persisted messages and citations.<br>4. The client renders the conversation thread; any historical AI proposal cards remain separate from confirmed transactions. |
| Alternative Flow | 2a. **Create Conversation:** Client calls `POST /api/chat-history` to create a new conversation.<br>3a. **Rename Conversation:** Client calls `PATCH /api/chat-history/:id` with an updated title.<br>3b. **Delete Conversation:** Client calls `DELETE /api/chat-history/:id`, cascading deletion to its messages. |
| Exception Flow | 3.1. **Invalid ID or Ownership Failure:** Malformed UUIDs return `HTTP 400`; unowned or missing conversations return `HTTP 404` under RLS.<br>3.2. **Remote Migration Uncertainty:** Chat History tables (`202611170010`, `202611170012`, `202611170013`) are verified in local migrations; remote Supabase deployment status is unverified until applied by an operator. |

---

### UC-010 Monitor AI Usage Analytics

| **Field** | **Details** |
| --- | --- |
| Use Case Name | UC-010 Monitor AI Usage Analytics |
| Primary Actor | Administrator |
| Trigger | The Administrator opens `/admin/ai-usage` or changes analytics filters. |
| Description | Displays aggregated AI token usage, latency, estimated cost, and usage provenance (`usage_source`) across features and models. Related Business Rules: `BR-001`, `BR-002`. |
| Pre-Conditions | The actor is signed in with `app_metadata.role = 'admin'`. |
| Post-Conditions | Read-only analytics dashboards and telemetry logs are displayed without mutating ledger or telemetry data. |
| Main Flow | 1. The Administrator navigates to `/admin/ai-usage`.<br>2. The client requests `/api/admin/ai-usage/overview`, `/timeseries`, `/breakdown`, and `/history` with filter parameters.<br>3. The backend verifies authentication, `'admin'` role, and Zod filter schemas.<br>4. The backend queries `public.ai_usage_analytics` and returns aggregated metrics and paginated history.<br>5. The client renders KPI cards, charts, and usage provenance tables. |
| Alternative Flow | 2a. **Filter by Date/Feature/Model:** Changing filters re-queries the four read-only analytics endpoints. |
| Exception Flow | 3.1. **Unauthorized Role:** Standard `'user'` accounts receive `HTTP 403` and are blocked by `AdminRouteGuard`.<br>3.2. **Invalid Filter Query:** Invalid filter parameters return `HTTP 400`.<br>4.1. **Remote Migration Uncertainty:** `usage_source` column (`202611170014`) is verified in local migrations; remote Supabase application status is unverified. |

---

### UC-011 Inspect Docs & Reindex Knowledge Base

| **Field** | **Details** |
| --- | --- |
| Use Case Name | UC-011 Inspect Docs & Reindex Knowledge Base |
| Primary Actor | Administrator |
| Trigger | The Administrator opens `/admin/knowledge-base` or clicks Reindex Knowledge Base. |
| Description | Allows an Administrator to inspect Git-managed Knowledge Base documents, the active read-only system prompt, and indexed Qdrant chunks, and to trigger a zero-downtime shadow-collection reindex. Related Business Rules: `BR-001`, `BR-002`, `BR-013`, `BR-014`. |
| Pre-Conditions | The actor is signed in with `app_metadata.role = 'admin'`. (Triggering reindex additionally requires `QDRANT_URL` and `GEMINI_API_KEY` to be configured.) |
| Post-Conditions | Canonical documents and system prompts remain read-only; when reindexing succeeds, `spendwise_active` points to the verified shadow collection. |
| Main Flow | 1. The Administrator opens `/admin/knowledge-base`.<br>2. The client calls `GET /api/admin/document`, `GET /api/admin/system-prompt`, `GET /api/admin/knowledge-base/status`, and `GET /api/admin/knowledge-base/chunks`.<br>3. The Administrator inspects a specific document (`GET /api/admin/document/:filename`) or triggers reindexing (`POST /api/admin/knowledge-base/index`).<br>4. The backend chunks canonical markdown files from `data/knowledge/`, generates `gemini-embedding-001` vectors, populates a timestamped shadow collection (`spendwise_shadow_*`), verifies the point count, and atomically switches the `spendwise_active` alias.<br>5. The backend returns the reindex summary and the UI refreshes index status. |
| Alternative Flow | 1a. **Degraded Qdrant Mode:** If Qdrant is unavailable, Git-managed document and system-prompt inspection still work read-only while Qdrant status/chunks reflect unavailability. |
| Exception Flow | 3.1. **Path Traversal or Invalid Filename:** Malformed document filenames are rejected by `documentParamsSchema` (`HTTP 400`).<br>3.2. **Rate Limit Exceeded:** Repeated reindex triggers are throttled by `indexingRateLimiter` (`HTTP 429`).<br>4.1. **Shadow Reindex Failure:** If embedding or Qdrant verification fails, the `spendwise_active` alias is not switched, preserving the previous active index. |
