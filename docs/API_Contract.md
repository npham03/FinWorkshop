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

## 2. Middleware API (`http://localhost:5000`) *(Đang hoàn thiện)*
*(Sẽ bổ sung các endpoints cho Auth, CashFlow, Quotation, E-Invoice, Reconciliation và Dashboard)*
