# FinTax Middleware API Contract

Base URL mặc định: `http://localhost:3001/api`. Frontend chỉ gọi middleware. Trừ health check và các endpoint xác thực công khai, endpoint yêu cầu `Authorization: Bearer <JWT>`.

## Envelope và lỗi

- GET danh sách trả về mảng JSON; GET chi tiết chưa triển khai.
- POST/PUT/action trả về object JSON.
- Lỗi trả `{ "error": "Thông báo tiếng Việt" }` cùng HTTP status phù hợp (400/401/403/404/409/415/500).
- Danh sách hỗ trợ query `q` và `status`.

## Endpoints

| Method | Path | Quyền | Mô tả |
| --- | --- | --- | --- |
| GET | `/health` | Công khai | Kiểm tra middleware và MySQL |
| POST | `/auth/login` | Công khai | Đăng nhập, trả JWT và user |
| POST | `/auth/register` | Công khai | Tạo tài khoản FinTax trong Odoo; tài khoản mới chờ OWNER duyệt |
| POST | `/auth/forgot-password` | Công khai | Gửi liên kết đặt lại mật khẩu qua thư Odoo (nếu email tồn tại) |
| POST | `/auth/reset-password` | Công khai | Đổi mật khẩu bằng token một lần, hết hạn sau 30 phút |
| GET | `/auth/me` | Người dùng | Lấy user trong phiên hiện tại |
| POST | `/auth/password` | Người dùng đã đăng nhập | Đổi mật khẩu phiên hiện tại |
| GET/POST | `/users` | OWNER | Danh sách/tạo người dùng |
| PATCH | `/users/:id/status` | OWNER | Mở/khóa tài khoản |
| GET/PUT | `/role-permissions` và `/role-permissions/:role` | OWNER | Xem và lưu quyền theo vai trò |
| GET | `/dashboard` | OWNER, ACCOUNTANT | KPI, biểu đồ, cảnh báo và bản ghi gần đây |
| POST | `/transfers` | OWNER, ACCOUNTANT | Tạo cặp giao dịch chuyển tiền cân bằng giữa hai tài khoản |
| GET | `/:entity` | Theo phân hệ và quyền `read` | Lấy danh sách bản ghi được phép xem |
| POST | `/:entity` | Theo phân hệ và quyền `create` | Tạo bản ghi |
| PUT | `/:entity/:id` | Theo phân hệ và quyền `update` | Sửa bản ghi; kỳ khóa không cho sửa trực tiếp |
| DELETE | `/:entity/:id` | OWNER | Hủy mềm, không xóa cứng |
| POST | `/:entity/:id/actions/:action` | Theo role/action | Gửi duyệt, duyệt, phân loại, mô phỏng mã, đối soát, khóa kỳ… |
| POST | `/import/transactions/preview` | OWNER, ACCOUNTANT | Upload sao kê CSV/XLS/XLSX, chuẩn hóa và phát hiện trùng |
| POST | `/import/transactions/:importId/commit` | OWNER, ACCOUNTANT | Ghi các dòng hợp lệ từ preview vào database |
| POST | `/files` | Người dùng | Upload hóa đơn/chứng từ tối đa 15MB |
| GET | `/files/:id` | Người dùng | Tải tệp đã upload |
| GET | `/integrations/status` | Người dùng | Odoo, Mock Tax API và chế độ dữ liệu |
| GET | `/integrations/odoo/status` | Người dùng | Trạng thái XML-RPC Odoo |
| GET | `/integrations/odoo/queue` | OWNER | 100 tác vụ đồng bộ Odoo gần nhất |
| POST | `/integrations/odoo/enqueue-unsynced` | OWNER | Xếp danh mục hiện có chưa đồng bộ vào hàng đợi; bỏ qua bản ghi đang chờ hoặc đã đồng bộ |
| POST | `/integrations/odoo/sync-pending` | OWNER | Gửi tối đa 50 tác vụ đang chờ/thử lại sang Odoo qua XML-RPC |
| GET | `/audit-logs` | OWNER | Nhật ký gần nhất |

Entities hiện có: `branches`, `cash-accounts`, `customers`, `suppliers`, `materials`, `products`, `boms`, `quotations`, `production-orders`, `stock-movements`, `labor-logs`, `transactions`, `invoices`, `payments`, `payment-allocations`, `reconciliations`, `alerts`, `classification-rules`, `tax-rules`, `tax-periods`.

Các action tiêu biểu: quotation `submit-for-approval`, `approve`, `reject`; invoice `simulate-code`; transaction `classify`; alert `resolve`; production-order `start`, `complete`; reconciliation `confirm`; tax-period `lock`, `unlock`.

## Mock Tax API

Base URL: `http://localhost:4000`. Đây là API mô phỏng; không kết nối cơ quan thuế và không có danh bạ doanh nghiệp hoặc hóa đơn mẫu được nạp sẵn.

| Method | Path | Mô tả |
| --- | --- | --- |
| GET | `/health` | Kiểm tra dịch vụ |
| GET | `/api/tax/check-mst/:mst` | Kiểm tra định dạng; MST hợp lệ trả `UNVERIFIED`, không khẳng định trạng thái doanh nghiệp |
| POST | `/api/tax/invoice/issue-code` | Tạo mã hóa đơn mô phỏng |
| GET | `/api/tax/invoice/verify/:code` | Tra cứu mã được tạo trong phiên hiện tại |
| GET | `/api/tax/history` | Lịch sử mã trong bộ nhớ của phiên hiện tại |
| POST | `/api/v1/invoices/issue` | Endpoint tương thích để middleware yêu cầu mã mô phỏng |

Các mã và lịch sử do API này trả về chỉ phục vụ trình diễn; lịch sử bị xóa khi khởi động lại dịch vụ.

Odoo đồng bộ `customers`/`suppliers` vào `res.partner`, `products`/`materials` vào `product.template`, `quotations` vào `sale.order`, `invoices` vào `account.move` (đầu ra là `out_invoice`, đầu vào là `in_invoice`) và `payments` vào `account.payment`. Addon **FinTax Integration** cần được nâng cấp cùng các module **Sales** và **Invoicing**; khóa `fintax_source_key` giúp cập nhật chứng từ mà không tạo trùng. Khách/nhà cung cấp được liên kết theo ID nguồn, mã số thuế hoặc tên. Báo giá được gửi sang trạng thái đã gửi/xác nhận theo luồng web; hóa đơn và thanh toán luôn tạo ở trạng thái nháp, không tự ghi sổ hoặc đối soát. Nếu thuế nguồn không khớp mức thuế Odoo, chứng từ có ghi chú rà soát. Chứng từ đăng trực tiếp trong Odoo chưa được nhập ngược về web.

Sau đồng bộ, báo giá, hóa đơn và thanh toán trên web có liên kết mở bản ghi Odoo. Worker tự xử lý tác vụ `PENDING`; OWNER có thể nạp lại hoặc thử lại từ **Cài đặt → Tích hợp Odoo**. Chứng từ đã ghi sổ/xác nhận trong Odoo không bị ghi đè tự động; cần xử lý trong hàng đợi khi có thay đổi nguồn.

Tài khoản đăng ký FinTax được lưu trong model `fintax.user.account` của addon **FinTax Integration**. Mật khẩu được lưu dưới dạng bcrypt hash; token đặt lại được lưu dưới dạng SHA-256 hash, hết hạn sau 30 phút và chỉ dùng một lần. MySQL giữ hồ sơ/role để phục vụ phân quyền ứng dụng; tài khoản mới chờ OWNER duyệt.

Worker của middleware tự xử lý các tác vụ `PENDING` theo lô nền; lỗi kết nối chuyển sang `PENDING_RETRY`, không lặp yêu cầu liên tục. OWNER có thể thử lại từ màn hình Tích hợp hoặc gọi endpoint đồng bộ thủ công.

## Quyền mặc định

- `OWNER`: toàn quyền nghiệp vụ và quản trị.
- `ACCOUNTANT`: nhập thu chi, danh mục, báo giá nháp, hóa đơn, công nợ, import và đối soát; không quản trị người dùng, duyệt báo giá, cấu hình TaxRules hoặc khóa kỳ.
- `WORKSHOP`: xem lệnh được giao, ghi luân chuyển vật tư/giờ công và cập nhật tiến độ; API giới hạn dữ liệu theo lệnh phân công.

Quyền cần được kiểm tra tại API; ẩn menu trên frontend không thay thế phân quyền backend.

API kiểm tra quyền phân hệ và hành động read/create/update ở backend. Giao diện Workshop dùng riêng quyền record-movement và record-labor để ghi vật tư và giờ công.
