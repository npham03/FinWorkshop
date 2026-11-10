# FinWorkshop - Kết quả QA giao diện

## Phạm vi và môi trường

- Bản nguồn: commit `399cbddfa0be540a80a3facc1c6ef0569e695068`.
- UI: `http://127.0.0.1:5184`; API QA: `http://127.0.0.1:3005/api`.
- Trình duyệt: Microsoft Edge qua Playwright, context QA riêng, không sử dụng phiên trình duyệt cá nhân.
- Chỉ kiểm thử và ghi bằng chứng; không chỉnh sửa mã ứng dụng, không commit, không push. Fixture mang tiền tố `UI-QA-` được tạo trong dữ liệu QA riêng.
- Mức độ: P1 = sai dữ liệu nghiệp vụ; P2 = chức năng bị chặn hoặc kết quả thao tác không đúng; P3 = lỗi thao tác/phản hồi giao diện.

## Độ bao phủ đã thực thi

| Nhóm | Kết quả |
| --- | --- |
| 13 route x 4 vai trò OWNER, ACCOUNTANT, WORKSHOP, WAREHOUSE | 52 lượt mở trang, kiểm tra điều hướng/heading/lỗi trình duyệt |
| Đăng nhập đúng | 4/4 vai trò vào `/app` |
| Đăng nhập sai mật khẩu | Bị chặn, hiện `Email hoặc mật khẩu chưa chính xác.` |
| Mobile 390 x 844 | `/app`, `/invoices`, `/workshop`, `/settings`: không tràn ngang toàn trang |
| JavaScript runtime | Không ghi nhận `pageerror` trong lượt sweep |
| Xuất Excel thực tế qua nút UI | `/customers`, `/invoices`, `/reports`: tải thành công và đọc lại bằng `XLSX.readFile` |

13 route: `/app`, `/transactions`, `/payments`, `/reconciliation`, `/invoices`, `/reports`, `/quotations`, `/catalog`, `/workshop`, `/inventory`, `/customers`, `/suppliers`, `/settings`.

Lượt mở route không đồng nghĩa mọi nhánh nghiệp vụ đều đã pass. Các kết quả xác nhận dưới đây có thao tác tái hiện riêng. Odoo offline là điều kiện môi trường được công bố, không tính là lỗi ứng dụng.

## UI-01 / P1 - Lấy vật tư lưu vào việc A dù người dùng chọn việc B

**Cách tái hiện**

1. Đăng nhập OWNER, mở Việc làm trong xưởng.
2. Tại việc A, chọn `Lấy vật tư`.
3. Trong modal, đổi `Cho việc nào?` sang việc B; chọn vật tư còn tồn, số lượng 1 và lưu.

**Mong đợi:** phiếu xuất gắn với B đang được chọn, hoặc ô chọn việc phải khóa ở A nếu thao tác bắt buộc dành cho A.

**Thực tế:** API trả HTTP 201 nhưng POST và bản ghi đã lưu vẫn gắn A. Đây là sai dữ liệu, không phải lỗi hiển thị đơn thuần.

**Bằng chứng lần chạy thật:**

- A: `UI-QA-1794334085929-A`, ID `fdebe585-6225-420c-98c0-a4f60f198f80`.
- B đang được chọn: `UI-QA-1794334085929-B`, ID `850c1b80-4b5a-4427-884b-a4532416c6c5`.
- POST `productionOrderId` và response `productionOrderId`: ID của A.
- Phiếu đã tạo: `f856cc6b-1c8e-4902-b19e-1ef3436c03a8`.
- Vật tư fixture riêng: `a4b2a700-4099-4a83-adb8-33ff20a5c760`; nhập đầu kỳ 100, lần thử xuất 1.

**Vị trí:** `apps/web-client/src/BusinessForms.tsx:64` cho đổi việc, nhưng `apps/web-client/src/pages.tsx:194` ghi đè `productionOrderId: selectedJob.id` sau `...value`; điểm mở modal `pages.tsx:212`.

**Ảnh:** `screenshots/bug-stock-job-B-before-save.png`.
**Dữ liệu kiểm thử:** `ui-deep-qa.json`, mục `stock-selector-saves-original-job-real`.

## UI-02 / P2 - Chủ xưởng không thể gửi duyệt báo giá DRAFT từ giao diện

**Cách tái hiện:** đăng nhập OWNER, mở `/quotations?q=DEMO-BG-DRAFT`, xem các thao tác của báo giá nháp. Tạo mới hoặc tạo phiên bản mới cũng phát sinh trạng thái DRAFT.

**Mong đợi:** chủ xưởng có đường đi hợp lệ tiếp tục báo giá đã tạo, ví dụ gửi duyệt theo workflow được API hỗ trợ.

**Thực tế:** chỉ có `Chi tiết`, `Excel`, `PDF / In`, `Sửa`, `Hủy`; không có `Gửi duyệt`. Chủ xưởng cần đổi sang tài khoản kế toán để tiếp tục.

**Vị trí:** `apps/web-client/src/pages.tsx:134` chỉ trả thao tác gửi duyệt cho ACCOUNTANT. API `apps/middleware-api/src/server.js:959` ép báo giá mới về DRAFT; `server.js:1206` hỗ trợ chuyển DRAFT sang PENDING_APPROVAL và OWNER có quyền `*`.

**Ảnh:** `screenshots/bug-owner-draft-no-submit.png`.
**Dữ liệu kiểm thử:** `ui-deep-qa.json`, mục `owner-DRAFT-quotation-actions`.

## UI-03 / P2 - Bỏ chọn BOM nhưng công thức và giá của BOM cũ vẫn còn

**Cách tái hiện**

1. OWNER mở Báo giá, chọn `Lập báo giá`.
2. Chọn `DEMO-BOM · v1`.
3. Đổi dropdown công thức sang `Không dùng công thức`.

**Mong đợi:** không còn hiển thị BOM đang áp dụng; dữ liệu tính giá phải được xóa hoặc chuyển sang chế độ chi phí thủ công một cách rõ ràng, không giữ một BOM ẩn bị hủy chọn.

**Thực tế:** dropdown đã không dùng công thức nhưng khối `Công thức làm / sản phẩm · v1` cùng vật tư cũ vẫn xuất hiện; giá gợi ý 341.250 đồng, thuế 27.300 đồng và khách trả 368.550 đồng không đổi.

**Vị trí:** `apps/web-client/src/BusinessForms.tsx:43` nhánh `if(!bom)` chỉ cập nhật `bomId`, không xóa `bom`/các trường chi phí. Phần giá dùng các trường cũ tại `BusinessForms.tsx:38` và `:39`; khối BOM hiển thị tại `:44`. `apps/middleware-api/src/operations.js:75` giữ đầu vào khi `bomId` rỗng, nên không tự dọn trạng thái cũ khi chuẩn hóa.

**Ảnh:** `screenshots/bug-bom-cleared.png`.
**Dữ liệu kiểm thử:** `ui-qa.json`, mục `BOM-clear-retains-formula`.

## UI-04 / P2 - Tìm nhanh không lọc dữ liệu nếu đang ở chính route đích

**Cách tái hiện**

1. OWNER mở `/transactions`.
2. Mở tìm kiếm trên thanh đầu trang, nhập `UI-QA-NOT-EXISTS-815799` và Enter.

**Mong đợi:** bảng hiện không tìm thấy kết quả với chuỗi không tồn tại.

**Thực tế:** URL đổi sang `/transactions?q=UI-QA-NOT-EXISTS-815799` nhưng ô tìm trong bảng vẫn rỗng, bảng vẫn có 10 dòng như trước. Reload URL mới thì truy vấn ban đầu mới được đọc.

**Vị trí:** `apps/web-client/src/Portal.tsx:183` điều hướng thêm query; `apps/web-client/src/DataTable.tsx:42` chỉ đọc `window.location.search` lúc khởi tạo state, không đồng bộ khi query của cùng route đổi.

**Ảnh:** `screenshots/bug-global-search-same-route.png`.
**Dữ liệu kiểm thử:** `ui-deep-qa.json`, mục `global-search-same-route`.

## UI-05 / P3 - Phím Escape không đóng drawer dù giao diện hướng dẫn như vậy

**Cách tái hiện:** mở Khách hàng, chọn thêm khách hàng, bấm Escape.

**Mong đợi:** đóng drawer theo dòng hướng dẫn `ESC hoặc dấu X để đóng`.

**Thực tế:** drawer vẫn mở. Nút X vẫn đóng được nên đây không phải blocker.

**Vị trí:** `apps/web-client/src/components.tsx:91` RecordModal không đăng ký xử lý keydown; `components.tsx:165` vẫn hiện hướng dẫn Escape. Các modal khác dùng FormShell đã có xử lý Escape, tạo hành vi không đồng bộ.

**Ảnh:** `screenshots/bug-escape-customer.png`.
**Dữ liệu kiểm thử:** `ui-qa.json`, mục `ESC-generic-customer-modal`.

## Kiểm chứng xuất Excel

| Trang | File bằng chứng | Kích thước | Kiểm tra đọc lại |
| --- | --- | ---: | --- |
| Khách hàng | `export-customers.xlsx` | 18.153 byte | 1 sheet, range A1:G6 |
| Hóa đơn bán | `export-invoices.xlsx` | 33.584 byte | 1 sheet, range A1:K36 |
| Báo cáo | `export-reports.xlsx` | 70.804 byte | 6 sheet SME-NKC, SME-TK, SME-KHO, SME-GT, SME-CN, SME-VAT |

`ui-export-qa.json` ghi kết quả tải và parse. Lỗi chạy `test-export.mjs` bằng Node không được tính là lỗi xuất Excel của trình duyệt: ba lần xuất thật đều pass, không có pageerror.

## Giới hạn và điều không khẳng định

- Không tính các giả thuyết chưa có bước tái hiện thành lỗi xác nhận, gồm chọn product trong modal lấy vật tư và giữ mã số thuế khi đổi đối tác.
- Có một lần locator test mã số thuế không đúng role ARIA của input datalist nên timeout; đó là lỗi script kiểm thử, không phải lỗi ứng dụng.
- Không tuyên bố toàn bộ API hoặc mọi nhánh tài chính đã pass từ kết quả UI sweep; các nhóm kiểm thử nghiệp vụ/API được tổng hợp riêng.
- Các fixture UI-QA giữ lại trong CSDL QA để đối chiếu; không tác động dữ liệu production.
