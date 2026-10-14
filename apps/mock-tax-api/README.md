# Mock Tax API (Cổng Giả lập Tổng Cục Thuế)

Dịch vụ nội bộ giả lập hệ thống Tổng cục Thuế Việt Nam dành cho đồ án **FinWorkshop**, phục vụ cho việc:
1. Tra cứu và phát hiện mã số thuế rủi ro (công ty ma, đã giải thể, ngừng hoạt động nhưng chưa đóng MST).
2. Quy trình cấp **Mã Cơ Quan Thuế** cho Hóa đơn điện tử trước khi xuất/đồng bộ vào Odoo.

## Cổng dịch vụ
- Port: **4000**
- Base URL: `http://localhost:4000`

---

## 1. Dữ liệu Mock kiểm thử (Test Cases)

| MST | Tên Doanh Nghiệp | Trạng thái | Kịch bản kiểm thử |
| :--- | :--- | :--- | :--- |
| `0101234567` | CÔNG TY TNHH CƠ KHÍ & THÉP HÀ NỘI | `ACTIVE` | Hợp lệ, bình thường |
| `0317894561` | CÔNG TY TNHH VẬT TƯ GỖ NAM PHÁT | `ACTIVE` | Hợp lệ, bình thường |
| `0309999999` | CÔNG TY TNHH TM&DV MA ÁNH DƯƠNG | `SUSPENDED` | **Cảnh báo đỏ (US02):** Công ty bỏ trốn/ngừng hoạt động |
| `0108888888` | CÔNG TY CP NGUYÊN LIỆU PHƯƠNG ĐÔNG | `CLOSED` | Công ty đã đóng mã số thuế |

*Lưu ý: Bất kỳ MST 10 hoặc 13 số hợp lệ nào khác ngoài danh sách trên sẽ được giả lập tự động là `ACTIVE`.*

---

## 2. Danh sách Endpoints

### 2.1. Tra cứu trạng thái MST
- **Method:** `GET`
- **URL:** `/api/tax/check-mst/:mst`
- **Response mẫu:**
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

### 2.2. Xin cấp mã Cơ quan thuế cho Hóa đơn điện tử
- **Method:** `POST`
- **URL:** `/api/tax/invoice/issue-code`
- **Body:**
```json
{
  "sellerTaxCode": "0101234567",
  "buyerTaxCode": "0317894561",
  "invoiceNumber": "HD0001",
  "invoiceDate": "2026-10-14",
  "totalAmount": 15000000
}
```
- **Response mẫu khi thành công:**
```json
{
  "success": true,
  "message": "Tổng cục Thuế: Cấp mã hóa đơn thành công",
  "taxAuthorityCode": "C26-4B8A-1F92CD80",
  "issuedAt": "2026-10-14T06:40:00.000Z",
  "status": "APPROVED"
}
```

---

## 3. Khởi chạy

```powershell
cd apps/mock-tax-api
npm install
npm run dev
```
