# Hệ thống Quản trị Tài chính & Tự động hóa Thuế (FinWorkshop)

**1.Frontend (apps/web-client)**
- Ngôn ngữ: JavaScript/TypeScript
- Framework: ReactJS (dùng Vite để khởi tạo cho lẹ)
- UI/CSS: TailwindCSS (cấm code CSS thuần)
- Thư viện gọi API: `axios`

**2.Backend Middleware (apps/middleware-api)**
- Ngôn ngữ: NodeJS
- Framework: ExpressJS
- Giao tiếp Odoo: `xmlrpc` (Bắt buộc dùng thư viện này để chọc vào Odoo)
- Caching/Local DB: MongoDB (dùng `mongoose`) hoặc MySQL.

**3.Mock API Thuế (apps/mock-tax-api)**
- Framework: NodeJS + ExpressJS (chạy riêng cổng 4000)

**4.Core ERP (infrastructure/odoo-docker)**
- Hệ thống: Odoo 16 (Community)
- Database: PostgreSQL (chạy bằng Docker Compose)

phin đã tham gia