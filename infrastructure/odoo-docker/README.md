# Odoo 16 Infrastructure & Credentials

## 1. Thông tin kết nối môi trường Development

| Thông tin | Giá trị | Ghi chú |
| :--- | :--- | :--- |
| **URL Web Odoo** | `http://localhost:8069` | Giao diện Odoo |
| **Database Name** | `fintax_clean` | Database được cấu hình trong `apps/middleware-api/.env` và Docker Compose |
| **Email đăng nhập** | `admin@fin.com` | Tài khoản quản trị |
| **Mật khẩu đăng nhập** | `FinTax@2026` | Tài khoản local đã khởi tạo cho đồ án |
| **Master Password** | `admin` | Giá trị mặc định của ảnh Odoo trong môi trường local |

---

## 2. Thông tin kết nối XML-RPC cho `apps/middleware-api`

Khi NodeJS Middleware kết nối tới Odoo qua thư viện `xmlrpc`:

```javascript
const ODOO_CONFIG = {
  url: process.env.ODOO_URL || 'http://localhost:8069',
  db: process.env.ODOO_DB || 'finworkshop_db',
  username: process.env.ODOO_USERNAME || 'admin@fin.com',
  password: process.env.ODOO_PASSWORD || 'FinTax@2026',
};
```

Chỉ dùng các giá trị này cho môi trường Docker local của đồ án. Khi tạo database mới, thay đổi master password mặc định trước khi mở cổng Odoo ra ngoài máy local.

---

## 3. Lệnh vận hành Docker

- Khởi chạy: `docker compose up -d`
- Xem logs Odoo: `docker compose logs -f odoo`
- Dừng dịch vụ: `docker compose down`
- Dừng & xóa sạch data: `docker compose down -v`
