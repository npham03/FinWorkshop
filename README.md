# FinTax Automation

Ứng dụng web quản trị dòng tiền, báo giá và vận hành xưởng. Dữ liệu nghiệp vụ được lưu trong MySQL; khi cấu hình Odoo, tài khoản FinTax và một số danh mục được quản lý/đồng bộ qua XML-RPC.

## Yêu cầu môi trường

- Node.js 20 trở lên và npm 10 trở lên.
- Docker Desktop để chạy MySQL cho middleware. Odoo 16/PostgreSQL là tùy chọn khi chỉ muốn dùng chế độ demo.

## Khởi chạy nhanh

Tại thư mục gốc repository:

```powershell
docker compose -f infrastructure/odoo-docker/docker-compose.yml up -d app-db
Copy-Item apps/middleware-api/.env.example apps/middleware-api/.env
Copy-Item apps/mock-tax-api/.env.example apps/mock-tax-api/.env
Copy-Item apps/web-client/.env.example apps/web-client/.env.local
npm install
npm run dev
```

Mở `http://localhost:5173`. API middleware chạy tại `http://localhost:3001`, Mock Tax API tại `http://localhost:4000`. MySQL được ánh xạ ra cổng `3307` để tránh đụng dịch vụ MySQL mặc định.

Nếu không dùng Docker Compose, hãy tự cung cấp MySQL 8 và cập nhật biến `DB_*` trong `apps/middleware-api/.env`.

## Tài khoản demo

Mật khẩu chung: `FinTax@2026`

| Vai trò | Email |
| --- | --- |
| Chủ xưởng / Quản lý | `owner@fintax.demo` |
| Kế toán / Bán hàng | `accountant@fintax.demo` |
| Thủ kho / Thợ xưởng | `warehouse@fintax.demo` |

Database mới chỉ tự tạo ba tài khoản đăng nhập ở trên; dữ liệu nghiệp vụ bắt đầu trống và không tự nạp khách hàng, hóa đơn, giao dịch hay danh mục mẫu. Không đưa thông tin tài chính thật vào môi trường demo.

## Service và cấu hình

- `apps/web-client`: React, Vite, Tailwind CSS, Axios; biến `VITE_API_URL`.
- `apps/middleware-api`: Express REST API, MySQL, JWT, XML-RPC adapter cho Odoo; cấu hình trong `.env.example`.
- `apps/mock-tax-api`: Express API mô phỏng tại cổng `4000`.
- `infrastructure/odoo-docker`: Odoo 16 Community, PostgreSQL và MySQL cục bộ.

Các lệnh riêng: `npm run dev:web`, `npm run dev:api`, `npm run dev:tax`, `npm run build`.

Để khởi tạo Odoo, chạy:

```powershell
docker compose -f infrastructure/odoo-docker/docker-compose.yml up -d odoo-db odoo
```

Tạo database Odoo qua giao diện `http://localhost:8069` (tên gợi ý `finworkshop_db`), tạo tài khoản quản trị rồi điền `ODOO_DB`, `ODOO_USERNAME`, `ODOO_PASSWORD` trong `apps/middleware-api/.env`. Cài module **Product** trong Odoo để bật đồng bộ sản phẩm/vật tư. Khởi động lại middleware sau khi sửa `.env`.

Đăng ký và quên mật khẩu yêu cầu Odoo đã được cấu hình trong `.env` và module **FinTax Integration** đã cài/cập nhật để tạo model tài khoản FinTax. Tài khoản đăng ký mới được lưu vào Odoo với mật khẩu đã băm và ở trạng thái chờ OWNER mở quyền trong **Cài đặt → Người dùng**. Đặt `PASSWORD_RESET_BASE_URL` theo địa chỉ web của ứng dụng và cấu hình `SMTP_USER` cùng `SMTP_PASS` bằng Gmail và Google App Password. Liên kết khôi phục được gửi qua Gmail SMTP, hết hạn sau 30 phút và chỉ dùng một lần; trong môi trường phát triển, API trả liên kết thử nghiệm nếu chưa gửi được email.

Trong FinTax, đăng nhập bằng vai trò OWNER, mở **Cài đặt → Tích hợp** rồi chọn **Nạp & đồng bộ danh mục** để đẩy dữ liệu cũ hoặc thử lại. Middleware giao tiếp với Odoo 16 qua XML-RPC và đồng bộ khách hàng/nhà cung cấp vào `res.partner`, sản phẩm/vật tư vào `product.template`; mã số thuế hoặc mã nội bộ được dùng để tìm bản ghi trước khi tạo mới. Danh mục mới được tự đồng bộ ở nền; nếu Odoo tạm lỗi, bản ghi vào trạng thái chờ thử lại và hiển thị trong màn hình tích hợp. Hóa đơn, bút toán kế toán, thanh toán và tồn kho chưa được đẩy sang Odoo.

## Các luồng hiện có

- Đăng nhập JWT với ba vai trò; đăng ký và đặt lại mật khẩu qua Odoo; tài khoản mới chờ OWNER duyệt.
- Dashboard, giao dịch thu chi, phân loại dòng tiền và import CSV/XLSX có preview/phát hiện dòng trùng.
- Danh mục khách hàng, nhà cung cấp, sản phẩm, vật tư và BOM.
- Báo giá có ước tính giá, trạng thái gửi duyệt/duyệt/từ chối và xuất Excel/PDF.
- Lệnh sản xuất, tiến độ, phiếu kho và giao diện responsive cho Workshop.
- Hóa đơn đầu vào/đầu ra, tải chứng từ, mô phỏng cấp mã qua Mock Tax API.
- Thanh toán, đối soát, kỳ báo cáo, bảy sổ S1–S7 tham khảo có thể xuất Excel hoặc in thành PDF, TaxRules và audit log.
- Service worker cơ bản cho app shell của Workshop; API luôn yêu cầu kết nối trực tuyến.

## Ranh giới và lưu ý

- Mock Tax API là giả lập cho đồ án; mã trả về không có giá trị pháp lý.
- Chưa có tích hợp ngân hàng, ký số, nộp thuế hoặc phát hành hóa đơn với nhà cung cấp thật.
- OCR chưa cấu hình; file tải lên cần được kiểm tra và nhập thông tin thủ công.
- TaxRules và mẫu sổ hiển thị là dữ liệu tham khảo; cần chuyên gia rà soát hiệu lực và phương pháp áp dụng trước khi dùng thực tế.
- Dữ liệu nghiệp vụ người dùng nhập được lưu cục bộ trong MySQL; database mới không nạp bản ghi nghiệp vụ mẫu.
