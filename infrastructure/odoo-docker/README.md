# Odoo 16 Infrastructure & Credentials

## 1. Thông tin kết nối môi trường Development

| Thông tin | Giá trị | Ghi chú |
| :--- | :--- | :--- |
| **URL Web Odoo** | `http://localhost:8069` | Giao diện Odoo |
| **Database Name** | `finworkshop_db` | Database chính của dự án |
| **Email đăng nhập** | `admin@fin.com` | Tài khoản quản trị |
| **Mật khẩu đăng nhập** | `admin` | Mật khẩu tài khoản quản trị |
| **Master Password** | `zwkf-33ca-fnjz` | Dùng để backup, restore, tạo DB mới |

---

## 2. Thông tin kết nối XML-RPC cho `apps/middleware-api`

Khi NodeJS Middleware kết nối tới Odoo qua thư viện `xmlrpc`:

```javascript
const ODOO_CONFIG = {
  url: process.env.ODOO_URL || 'http://localhost:8069',
  db: process.env.ODOO_DB || 'finworkshop_db',
  username: process.env.ODOO_USERNAME || 'admin@fin.com',
  password: process.env.ODOO_PASSWORD || 'admin',
};
```

---

## 3. Lệnh vận hành Docker

- Khởi chạy: `docker compose up -d`
- Xem logs Odoo: `docker compose logs -f web`
- Dừng dịch vụ: `docker compose down`
- Dừng & xóa sạch data: `docker compose down -v`
