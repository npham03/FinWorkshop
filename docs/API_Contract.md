# FinWorkshop API Contract

## 1. Mock Tax Authority API (`http://localhost:4000`)

### 1.1 Tra cứu trạng thái Doanh nghiệp / Mã số thuế
- **Endpoint:** `GET /api/tax/check-mst/:mst`
- **Mô tả:** Tra cứu thông tin người nộp thuế, phát hiện doanh nghiệp ngừng hoạt động, công ty ma.
- **Query / Params:** `mst` (10 hoặc 13 chữ số)
- **Response 200 (Thành công - Hoạt động bình thường):**
  ```json
  {
    "success": true,
    "data": {
      "taxCode": "0101234567",
      "name": "CÔNG TY TNHH CƠ KHÍ & THÉP HÀ NỘI",
      "status": "ACTIVE",
      "statusDescription": "NNT đang hoạt động (đã được cấp GCN ĐKT)",
      "address": "Số 123 Đường Giải Phóng, Phường Đồng Tâm, Quận Hai Bà Trưng, Hà Nội",
      "legalRepresentative": "Nguyễn Văn Hùng",
      "taxOffice": "Chi cục Thuế Quận Hai Bà Trưng"
    },
    "isRisky": false
  }
  ```
- **Response 200 (Cảnh báo rủi ro - Công ty ngừng hoạt động):**
  ```json
  {
    "success": true,
    "data": {
      "taxCode": "0309999999",
      "name": "CÔNG TY TNHH THƯƠNG MẠI & DỊCH VỤ MA ÁNH DƯƠNG",
      "status": "SUSPENDED",
      "statusDescription": "NNT ngừng hoạt động nhưng chưa hoàn thành thủ tục đóng MST (Bỏ địa chỉ kinh doanh)"
    },
    "isRisky": true
  }
  ```

### 1.2 Xin cấp Mã cơ quan thuế cho Hóa đơn điện tử
- **Endpoint:** `POST /api/tax/invoice/issue-code`
- **Mô tả:** Middleware gửi dữ liệu hóa đơn để cơ quan thuế cấp mã trước khi lưu hóa đơn chính thức.
- **Request Body:**
  ```json
  {
    "sellerTaxCode": "0101234567",
    "buyerTaxCode": "0317894561",
    "invoiceNumber": "HD0001",
    "invoiceDate": "2026-10-14",
    "totalAmount": 15000000
  }
  ```
- **Response 201 (Cấp mã thành công):**
  ```json
  {
    "success": true,
    "message": "Tổng cục Thuế: Cấp mã hóa đơn thành công",
    "taxAuthorityCode": "C26-0708-7527A869",
    "issuedAt": "2026-10-14T06:43:28.568Z",
    "status": "APPROVED"
  }
  ```
- **Response 422 (Từ chối cấp mã do vi phạm rủi ro thuế):**
  ```json
  {
    "success": false,
    "errorCode": "TAX_RISK_SELLER_SUSPENDED",
    "message": "Từ chối cấp mã: Bên bán có trạng thái NNT ngừng hoạt động nhưng chưa hoàn thành thủ tục đóng MST!"
  }
  ```

---

## 2. Middleware API (`http://localhost:5000/api/v1`) *(Database: PostgreSQL 16)*

### 2.1 Xác thực người dùng (Auth)
- `POST /api/v1/auth/login`: Đăng nhập lấy Bearer JWT Token (`admin@fin.com` / `admin123` hoặc `accountant@fin.com` / `acc123`).
- `POST /api/v1/auth/register`: Đăng ký tài khoản người dùng mới.
- `GET /api/v1/auth/me`: Lấy thông tin user đăng nhập hiện tại (yêu cầu Header `Authorization: Bearer <token>`).

### 2.2 Sổ Quỹ Tiền Mặt & Invisible Accounting (CashFlow)
- `POST /api/v1/cashflow`: Ghi nhận giao dịch đời thường.
  - Body:
    ```json
    {
      "type": "expense",
      "category": "production",
      "description": "Mua sắt thép phi 10 xây xưởng",
      "amount": 12500000,
      "sellerTaxCode": "0101234567",
      "attachmentNote": "HĐ 004812"
    }
    ```
  - Logic: Tự động mapping sang cặp tài khoản Nợ/Có (VD: Nợ 152 / Có 111 hoặc Nợ 627 / Có 111), kiểm tra MST người bán qua Tax Engine, lưu vào PostgreSQL (`transaction_logs`) với status `pending_sync`, sau đó non-blocking push sang Odoo XML-RPC.
- `GET /api/v1/cashflow`: Lấy danh sách giao dịch có phân trang, lọc theo `type` (income/expense) và `category` (production/personal).

### 2.3 Hóa Đơn Điện Tử (E-Invoice & Cấp Mã CQT)
- `POST /api/v1/invoices`:
  - Body:
    ```json
    {
      "invoiceNumber": "HD-2026-001",
      "invoiceDate": "2026-10-15",
      "sellerTaxCode": "0101234567",
      "buyerTaxCode": "0317894561",
      "buyerName": "Công ty TNHH Khang Điền",
      "buyerAddress": "123 Nam Kỳ Khởi Nghĩa, Q3, TP.HCM",
      "items": [
        { "name": "Thép cuộn xây dựng", "unit": "Tấn", "quantity": 2, "unitPrice": 14500000 }
      ],
      "vatRate": 0.1
    }
    ```
  - Logic: Kiểm tra rủi ro bên bán -> Gọi Mock Tax API cấp mã CQT -> Lưu vào PostgreSQL (`invoice_logs`) -> Đồng bộ Odoo `account.move`.
- `GET /api/v1/invoices`: Lấy danh sách hóa đơn đã phát hành và mã CQT.

### 2.4 Bảng Điều Khiển & Chỉ Số (Dashboard)
- `GET /api/v1/dashboard/summary`: Lấy toàn bộ KPI tài chính (Tổng thu, Tổng chi, Dòng tiền thuần, Chi sản xuất vs cá nhân, tỷ lệ Odoo sync, cảnh báo thuế) và tình trạng kết nối 4 thành phần hệ thống.

### 2.5 Tra Cứu Thuế (Tax Proxy)
- `GET /api/v1/tax/check-mst/:mst`: Proxy tra cứu MST doanh nghiệp qua Mock Tax API.
