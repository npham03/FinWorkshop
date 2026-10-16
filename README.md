# Hệ thống Quản trị Tài chính & Tự động hóa Thuế (FinWorkshop)

Hệ thống quản trị tài chính xưởng sản xuất, cơ chế **Invisible Accounting** (tự động dịch ngôn ngữ tự nhiên sang bút toán Nợ/Có chuẩn Thông tư 200), kiểm soát rủi ro thuế và phát hành Hóa đơn điện tử có mã Cơ quan Thuế.

---

### 1. Frontend Web Client (`apps/web-client`)
- **Ngôn ngữ:** JavaScript / JSX
- **Framework:** ReactJS 19 + Vite (`http://localhost:5173`)
- **UI/CSS:** TailwindCSS, Glassmorphism, Lucide Icons
- **Thư viện gọi API:** `axios` (kèm JWT Interceptor)
- **Tính năng chính:**
  - **Dashboard:** Bảng điều khiển tài chính thời gian thực, tổng thu/chi, dòng tiền thuần, sơ đồ pipeline monorepo.
  - **Sổ Quỹ Tiền Mặt:** Invisible Accounting — nhập ngôn ngữ thông thường (VD: "Mua sắt thép phi 10", "Trả lương thợ"), hệ thống tự động dịch Nợ/Có và lưu trữ.
  - **Hóa Đơn Điện Tử:** Lập hóa đơn và xin cấp mã CQT từ Cổng Thuế tự động trước khi lưu Odoo.
  - **Tra Cứu Rủi Ro Thuế:** Tra cứu MST, phát hiện công ty ma / đóng mã số thuế để ngăn chặn hóa đơn khống.

### 2. Backend Middleware API (`apps/middleware-api`)
- **Ngôn ngữ:** NodeJS (ES Modules)
- **Framework:** ExpressJS (`http://localhost:5000`)
- **Cơ sở dữ liệu:** **PostgreSQL 16** (kết nối trực tiếp qua thư viện `pg` Pool)
  - Database: `finworkshop`
  - Tables: `users`, `transaction_logs`, `invoice_logs` (tự động khởi tạo và seed tài khoản mẫu)
- **Tài khoản đăng nhập mặc định:**
  - Admin: `admin@fin.com` / `admin123`
  - Kế toán viên: `accountant@fin.com` / `acc123`
- **Giao tiếp Odoo:** `xmlrpc` (đồng bộ `account.move` journal entries và sales invoices)
- **Tax Risk Engine:** Thẩm định trạng thái MST người bán trước khi xuất/nhập hóa đơn.

### 3. Mock API Thuế (`apps/mock-tax-api`)
- **Framework:** NodeJS + ExpressJS (`http://localhost:4000`)
- Giả lập Cổng Tổng Cục Thuế Việt Nam: Tra cứu trạng thái người nộp thuế & Cấp mã Hóa đơn điện tử.

### 4. Core ERP (`infrastructure/odoo-docker`)
- **Hệ thống:** Odoo 16/20
- **Database:** PostgreSQL (`finworkshop_db`)
- **Thông tin Dev Local:**
  - URL: `http://localhost:8069`
  - Database: `finworkshop_db`
  - Email: `admin@fin.com`
  - Password: `admin`

---

### Hướng Dẫn Khởi Chạy (Local Development)

1. **Khởi chạy Mock Tax API:**
   ```bash
   cd apps/mock-tax-api
   npm run dev
   ```

2. **Khởi chạy Middleware API (PostgreSQL):**
   ```bash
   cd apps/middleware-api
   npm run dev
   ```

3. **Khởi chạy Web Client (React + Vite):**
   ```bash
   cd apps/web-client
   npm run dev
   ```
   Truy cập trình duyệt: `http://localhost:5173`