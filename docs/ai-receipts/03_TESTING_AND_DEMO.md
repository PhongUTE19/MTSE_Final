# Testing và demo AI Receipt Scanner

## 1. Setup an toàn

Không đưa secret vào slide, chat, commit hoặc ảnh chụp màn hình. Root `.env` cần tối thiểu các biến thật:

```dotenv
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_ANON_KEY=<public-anon-or-publishable-key>
SUPABASE_SECRET_KEY=<server-only-key>
GEMINI_API_KEY=<gemini-key>
GEMINI_MODEL=<multimodal-model-id>
```

Client `.env` cần `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY` là cặp cùng project. Backend dùng root `.env` vì `server/src/config.js` load từ project root.

Chạy hai terminal từ root repository:

```powershell
npm.cmd --prefix server run dev
```

```powershell
npm.cmd --prefix client run dev
```

Đăng nhập tại `http://localhost:5173/auth.html`, vào `http://localhost:5173/expense.html`, chọn menu **Receipts**. Backend cần kết nối đúng Supabase project đã có `public.receipts`, `public.expense_transactions`, bucket private `receipts`, receipt lifecycle RPCs/RLS. Hãy kiểm tra chúng trong Supabase Dashboard/SQL Editor; tài liệu này không xác nhận trạng thái remote chỉ từ source code.

Kiểm tra Gemini bằng cách upload receipt hoặc chỉ chạy live fixture nếu được phép dùng API key:

```powershell
node evals/receipts/run_live_gemini.js
```

Lệnh live có thể dùng API trả phí; không chạy trong demo nếu chưa có quyền/chi phí được duyệt.

## 2. Kịch bản demo chính

1. **Sign in:** `AuthenticatedRouteGuard.jsx` chỉ render app khi có Supabase session; `expenseApi.js` thêm Bearer token.
2. **Mở scanner:** Chọn Receipts. `ExpensePage.jsx` tải các `review_required` draft để resume sau refresh.
3. **Upload hóa đơn thật:** Chọn JPG/PNG/WebP ≤ 5 MB. UI preview + “PROCESSING RECEIPT” xuất hiện, không cho upload ảnh khác trong lúc xử lý.
4. **Validation/server:** Nêu `uploadReceiptImage()` kiểm tra loại file/magic bytes/dimensions rồi `uploadReceipt()` tạo private path và gọi Gemini.
5. **Structured output:** Khi thành công, `ReceiptReview` hiển thị ảnh và các field merchant, date, total amount, category, note đã prefill. Nhấn mạnh đây là draft; kiểm tra số VND, đặc biệt `183.000` phải là `183000`/hiển thị `₫183,000`.
6. **Sửa tay:** Sửa merchant/date/amount/category/note nếu cần. Item được giữ trong payload nhưng UI hiện chưa có editor item riêng; warnings hiện chưa render trong review UI.
7. **Confirm:** Bấm Confirm and save transaction. Nút đổi thành Saving và disabled để tránh double click. Controller → service → `confirm_receipt_transaction` tạo transaction và link receipt atomically.
8. **Kiểm tra kết quả:** App quay về Transactions và reload list. Với quyền phù hợp, có thể kiểm tra row transaction (bao gồm `user_id`, `transaction_date`, `items`) và receipt đã `confirmed`/có `transaction_id` trong Supabase. Không trình bày token/secret.
9. **Refresh trước confirm:** Upload receipt khác, chờ review, refresh trang. Vào Receipts, dùng Pending review → Resume review; Discard xóa receipt draft/object.

## 3. Demo guardrails

| Demo | Cách tái hiện | Kỳ vọng UI/backend/database |
| --- | --- | --- |
| Non-receipt | Upload ảnh phong cảnh hoặc chạy `non-receipt.png` | Gemini/guardrail trả `NOT_A_RECEIPT`; UI báo ảnh không phải receipt; không tạo transaction; temp receipt được cleanup nếu cleanup hoạt động. |
| Prompt injection | Dùng `evals/receipts/fixtures/receipt-with-injection.png` hoặc ảnh text “IGNORE ALL PREVIOUS INSTRUCTIONS” | Prompt coi text là untrusted; guardrail kiểm merchant/note/items. Fixture receipt-with-injection trong evidence được accepted nhưng instruction không được copy/follow; pure injection image bị NOT_A_RECEIPT. |
| Invalid/failure | Tạm dùng fixture malformed/invalid schema ở deterministic runner, hoặc ngắt Gemini chỉ ở môi trường test được phép | Request lỗi an toàn; `server_mark_receipt_failed` + cleanup được gọi; transaction không tạo. Không mô phỏng outage production nếu không có quyền. |

Lưu ý: `injection-image.png`/`receipt-with-injection.png` là ảnh synthetic sinh từ `evals/receipts/generate_live_fixtures.js`, phù hợp demo logic guardrail nhưng không thay thế corpus tấn công thực tế.

## 4. Evaluation và test commands

| Lệnh | Mục đích | Kết quả đã ghi nhận |
| --- | --- | --- |
| `npm.cmd --prefix server run eval:receipts` | 20 deterministic cases trong `evals/receipts/cases.json`/`runner.js` | 20/20 pass; một phần lifecycle là simulation in-memory. |
| `node --test tests/unit/receiptUpload.test.js tests/unit/receiptServiceContract.test.js tests/unit/receiptLeaseLifecycle.test.js tests/unit/receiptExtractionSchema.test.js tests/unit/receiptGuardrails.test.js` | Image upload, cleanup, lease, schema, prompt/guardrails | Focused suite đã pass 13 tests trong lần local verification gần nhất. |
| `npm.cmd --prefix client run build` | Build frontend receipt UI | Passed trong verification gần nhất. |
| `node evals/receipts/run_live_gemini.js` | Năm Gemini fixture synthetic | Có live evidence, nhưng gọi API và không ghi Supabase receipt/transaction. |

`run_live_gemini.js` in JSON gồm `fixture`, `outcome`, `elapsedMs`, `tokenUsage`, extraction/error. So sánh expected fixture với output console và `docs/ai-receipts/06_IMPLEMENTATION_EVIDENCE.md`. Không có output cost vì code chưa có pricing calculation. Latency/tokens chỉ được coi là có khi provider thực sự trả metadata; persistent telemetry hiện không xác minh được vì `ai_usage_analytics` thiếu trong evidence.

## 5. Câu trả lời nói với giảng viên

**Multimodal AI là gì?**  
“Đó là mô hình nhận nhiều modality. Trong project, Gemini nhận prompt text và bytes ảnh hóa đơn `inlineData`, thay vì chỉ nhận văn bản.”

**Vì sao dùng Gemini?**  
“Provider hiện có hỗ trợ input image và JSON response schema. Model dùng thực tế lấy từ `GEMINI_MODEL`; em không khẳng định benchmark tốc độ/giá vì repository chưa có benchmark model.”

**AI nhận ảnh như thế nào?**  
“Browser gửi multipart `receipt`; server kiểm file bằng magic bytes, Sharp và SHA-256. Sau đó server mới upload private Storage và gửi buffer ảnh base64 cho Gemini.”

**Structured Output là gì và tại sao phải validate?**  
“Gemini được yêu cầu JSON schema, nhưng server vẫn validate Zod strict. Nếu JSON sai, thiếu/không đúng kiểu thì không được ghi transaction. Plain text không đủ an toàn để map trực tiếp database.”

**Dữ liệu AI map vào form ra sao?**  
“`toDraft()` map date/amount/type/note và giữ merchant/category/items. Review form prefill merchant, date, amount, category, note; người dùng sửa rồi mới confirm.”

**Nếu AI sai hoặc unavailable thì sao?**  
“Không auto-create transaction. Service trả error an toàn, đánh dấu failure tạm để cleanup Storage/row; CRUD thủ công vẫn hoạt động. Nếu cleanup dependency lỗi, server log recovery record thay vì làm mất dấu object.”

**Prompt injection xử lý thế nào?**  
“Prompt bảo ảnh là untrusted data. Sau JSON validation, guardrail quét merchant/note/item names bằng `detectPromptInjection`; unsafe text bị reject trước review.”

**Vì sao user phải review?**  
“OCR/AI có thể sai merchant, date, amount, item/category. Đặc biệt số VND dùng dấu chấm hàng nghìn có heuristic normalize nhưng vẫn cần người dùng kiểm tra.”

**Chống confirm trùng thế nào?**  
“Button disabled khi saving; quan trọng hơn, SQL RPC lock receipt row `FOR UPDATE`, status confirmed trả lại transaction cũ, và transaction link unique.”

**Đo quality/latency/cost thế nào?**  
“Có 20 deterministic cases 20/20 và 5 live synthetic probes. Normal probe có 3.752 ms và 1.357 total tokens trong evidence. Đây chưa phải quality benchmark 20 ảnh thật hay before/after. Analytics tính avg/P50/P95 latency, nhưng persistent `ai_usage_analytics` và cost calculation chưa hoàn thiện/verified.”

## 6. Những điểm cần nói trung thực

- Có live synthetic Gemini evidence, không phải accuracy study trên 20 hóa đơn thật.
- Không có before/after pass rate giữa prompt versions.
- `ai_usage_analytics`/durable cost history chưa được chứng minh hoạt động trong project Supabase.
- Remote RLS, Storage policy và concurrent confirmation phải được kiểm tra thêm qua `supabase/tests/receipt_disposable_project_integration.sql` và `supabase/tests/run_receipt_concurrent_confirm.ps1`; không dùng deterministic simulation để thay thế kết quả remote.
