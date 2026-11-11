# FinWorkshop - API QA vòng 2

Commit: `399cbddfa0be540a80a3facc1c6ef0569e695068`. API kiểm thử riêng: `http://127.0.0.1:3005/api`. Workshop tự tạo: `QA2-API-1794335891407`, không dùng workshop mặc định để ghi dữ liệu. Không sửa source, không push.

Sáu lỗi dưới đây đã tái hiện qua HTTP, không lặp FW-01..20. Các request đều dùng phiên OWNER của workshop QA; header/token/mật khẩu không đưa vào bằng chứng. File dữ liệu: `round2-api-evidence.json`. Script: `round2-api-probes.mjs`.

## R2-API-01 [P1] Hủy khách hàng đang có công nợ đầu kỳ làm biến mất phải thu

- Nguồn: `apps/middleware-api/src/server.js:1121-1124` chỉ tìm phụ thuộc trong danh sách không có `opening-balances`, cũng không có khóa `partnerId`. `operations.js:103-121` lưu chứng từ đầu kỳ theo khóa này.
- Repro tối thiểu:
  1. POST `/customers` tạo khách C.
  2. POST `/opening-balances` `{ "partnerType":"CUSTOMER", "partnerId":"C", "amount":5000, "date":"2026-11-11", "reason":"QA opening balance" }` → 201.
  3. GET `/dashboard`: `metrics.receivable = 5000`.
  4. DELETE `/customers/C` `{ "reason":"QA dependency check" }`.
- Thực tế: DELETE 200, khách `CANCELLED`, chứng từ đầu kỳ vẫn `CONFIRMED`; phải thu trên dashboard giảm **5.000 → 0** mà không có chứng từ tất toán/điều chỉnh.
- Kỳ vọng: chặn hủy danh mục còn công nợ/chứng từ đầu kỳ đang hiệu lực; không làm mất nghĩa vụ nợ khi chỉ hủy hồ sơ.
- Acceptance: với CUSTOMER và SUPPLIER còn chứng từ đầu kỳ, DELETE trả 409, số dư và trạng thái không đổi. Chỉ hủy được sau quy trình xử lý phụ thuộc hợp lệ.

## R2-API-02 [P1] Tạo giao dịch mang trạng thái CANCELLED vẫn cộng số dư tiền

- Nguồn: `apps/middleware-api/src/server.js:1001-1004` giữ `value.status` do client gửi nhưng vẫn ghi biến động tiền; `accounting.js:3` loại giao dịch CANCELLED khỏi dữ liệu có hiệu lực.
- Repro: POST `/transactions` `{ "date":"2026-11-11", "description":"QA cancelled income", "direction":"INCOME", "classification":"BUSINESS_INCOME", "amount":333, "accountId":"A", "status":"CANCELLED" }`.
- Thực tế: 201, bản ghi `CANCELLED`; số dư tài khoản **1.001.000 → 1.001.333** nhưng giao dịch không xuất hiện trong sổ kế toán có hiệu lực. Không gọi PUT chỉnh balance (khác FW-02).
- Kỳ vọng: trạng thái tạo mới do server kiểm soát; không cho ghi biến động tiền từ giao dịch đã hủy hoặc trạng thái không hỗ trợ.
- Acceptance: input `CANCELLED`, `VOID`, `UNALLOCATED`, `DEMO_ARCHIVED` bị từ chối hoặc được chuẩn hóa hợp lệ trước khi ghi sổ; số dư luôn đối chiếu được với giao dịch có hiệu lực. Kiểm tra cả INCOME và EXPENSE.

## R2-API-03 [P2] Lưu cấu hình lỗi vẫn âm thầm đổi tên và MST xưởng

- Nguồn: `apps/middleware-api/src/server.js:681-690`: UPDATE tên/MST/mã trước khi validate settings, không có transaction bao quanh.
- Repro: GET `/workshop` ghi nhận tên; PUT `/workshop` `{ "name":"QA SHOULD-ROLLBACK", "taxId":"0312345678", "settings":{"taxMethod":"NOT_A_TAX_METHOD"} }`; GET lại `/workshop`.
- Thực tế: PUT trả **400** `Chọn chế độ kế toán và phương pháp thuế được hỗ trợ.` nhưng tên đã đổi sang `QA SHOULD-ROLLBACK`, MST null → `0312345678`; taxMethod vẫn VAT_CREDIT. Người dùng nhận thất bại nhưng dữ liệu bị lưu một phần.
- Kỳ vọng: request không hợp lệ không thay đổi bất kỳ trường nào.
- Acceptance: validate toàn bộ trước ghi hoặc rollback toàn bộ; với response 4xx/5xx, name/tax_id/code/settings giữ nguyên, không có audit thành công giả.

## R2-API-04 [P2] Đổi tên khách làm phiếu thu không thể phân bổ vào hóa đơn cùng khách

- Nguồn: `apps/middleware-api/src/workflows.js:81` bắt buộc cả tên snapshot bằng nhau ngay cả khi `counterpartyId` cùng một ID. `server.js:918-924` lại hiển thị tên hiện tại từ hồ sơ trong danh sách, che giấu khác biệt snapshot.
- Repro:
  1. Khách C tên A; POST `/payments` thu 1.000 vào tài khoản, có `counterpartyId:C`, `counterparty:A`.
  2. PUT `/customers/C` `{ "name":"B" }` → 200.
  3. POST `/invoices` OUTPUT, `counterpartyId:C`, subtotal 1.000, taxRate 0 → 201, snapshot tên B.
  4. POST `/payment-allocations` `{ "paymentId":"P", "invoiceId":"I", "allocatedAmount":1000 }`.
- Thực tế: **409** `Thanh toán và hóa đơn phải cùng đối tác.` dù hai `counterpartyId` giống hệt nhau. GET payments còn hiển thị tên B nên người dùng thấy hai chứng từ cùng khách nhưng không gán được tiền.
- Kỳ vọng: định danh bằng ID khi đã có ID hợp lệ; tên chỉ là nhãn/snapshot, không phá liên kết khi đổi tên.
- Acceptance: đổi tên khách/nhà cung cấp không ngăn phân bổ chứng từ cùng ID; ID khác nhau vẫn phải bị chặn kể cả trùng tên.

## R2-API-05 [P2] Hủy đồng thời hai vế chuyển nội bộ gây lỗi 500

- Nguồn: `apps/middleware-api/src/server.js:1137-1146`: khóa vế đầu theo ID request rồi duyệt/khóa cặp; request đối diện có thể giữ khóa ngược nhau. `db.js:379` còn lấy advisory period lock khi save.
- Repro: POST `/transfers` `{ "fromAccountId":"A", "toAccountId":"B", "amount":20, "date":"2026-11-11" }` → hai transaction T1/T2. Gửi đồng thời DELETE `/transactions/T1` và DELETE `/transactions/T2`, mỗi request có `{ "reason":"QA concurrent cancellation" }`.
- Thực tế: **cả 4/4 lần thử** đều trả một request **500** `Đã có lỗi hệ thống. Vui lòng thử lại.` và một request 200. Có thể gặp khi hai người cùng thao tác hoặc xử lý hai hàng ở hai tab.
- Kỳ vọng: thao tác hợp lệ cạnh tranh nhau được xử lý an toàn: một lần hủy thành công, lần còn lại trả conflict/đã hủy có kiểm soát; không trả lỗi hệ thống.
- Acceptance: thứ tự khóa nhất quán hoặc xử lý/retry lỗi đồng thời; 20 lần chạy cặp đối diện không có 500, hai vế đều CANCELLED, số dư chỉ hoàn đúng một lần.
- Nhóm kiểm thử đã đối chiếu Docker PostgreSQL log: `deadlock detected` xuất hiện bốn lần liên tiếp; hai SELECT records ... FOR UPDATE chờ transaction của nhau. Bản trích đã làm sạch: `round2-postgres-deadlock.log` (main agent lưu).

## R2-API-06 [P2] Hóa đơn đã cấp mã mô phỏng bị sửa nội dung và cấp lại mã không kiểm soát

- Đây là lỗi nhất quán của luồng **Mock Tax**, không khẳng định có giá trị pháp lý hoặc đã kết nối cơ quan thuế thật.
- Nguồn: `apps/middleware-api/src/server.js:1066-1079` không xử lý mã đã cấp khi sửa; `:1218-1221` không chặn `mockTaxCode` hiện có khi cấp mã lại.
- Repro A: tạo OUTPUT invoice 1.000; POST `/invoices/I/actions/simulate-code` → 200, mã `C26-B0AF-4ECBA720`. PUT `/invoices/I` `{ "subtotal":2000 }`.
- Thực tế A: PUT **200**, total **1.000 → 2.000** nhưng mã vẫn `C26-B0AF-4ECBA720`, status vẫn `DEMO_CODE_ISSUED`.
- Repro B: POST `/invoices/I/actions/simulate-code` lần nữa.
- Thực tế B: **200**, đổi mã sang `C26-6C97-53F80318`, không có luồng thu hồi/điều chỉnh mã cũ. UI chi tiết vốn ẩn nút cấp mã khi đã có mã, nhưng API không bảo vệ tương đương.
- Kỳ vọng: sửa nội dung có ảnh hưởng mã phải theo một quy tắc rõ ràng: chặn sửa, hoặc vô hiệu hóa mã/trả trạng thái cần cấp lại có audit. Retry cấp mã không âm thầm tạo mã mới.
- Acceptance: nội dung/mã/trạng thái không mâu thuẫn; request cấp mã lặp trả mã hiện có hoặc 409; chỉ luồng điều chỉnh rõ ràng mới được phát hành mã thay thế và lưu lịch sử.
- Lưu ý bằng chứng: chỉ dùng phản hồi của API 3005 để chứng minh nội bộ. GET tra cứu bổ sung ở Mock mặc định 4000 trả 404, chưa xác nhận đó là instance backend 3005 đang trỏ tới; **không** tính 404 này là lỗi.

## Đã thử nhưng chưa tính thành lỗi chắc chắn

- Hai POST payments cùng code và externalReference đều 201, số dư tăng hai lần 777. Chưa có hợp đồng idempotency/uniqueness rõ cho phiếu tiền; để xác nhận yêu cầu, không cộng vào 6 lỗi.
- Báo giá PENDING_APPROVAL vẫn sửa được cùng ID, tổng 1.000 → 2.000. Cần chốt có cho sửa trước khi OWNER duyệt không; không tự kết luận sai quy trình.

## Ranh giới kiểm thử

Không thử tài khoản thật, không gửi mail, không push GitHub, không sửa code. Những request POST/PUT/DELETE chỉ dùng dữ liệu trong workshop QA2-API riêng. Kết quả không đại diện cho kiểm thử tải hoặc mọi tình huống đồng thời.
