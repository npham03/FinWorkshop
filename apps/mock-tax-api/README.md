# FinTax Mock Tax API

API mô phỏng cục bộ cho đồ án FinTax. Dịch vụ không kết nối cơ quan thuế, không có danh bạ doanh nghiệp mẫu và không xác nhận trạng thái mã số thuế thật. Mã hóa đơn được tạo chỉ để trình diễn, không có giá trị pháp lý.

## Chạy dịch vụ

```powershell
cd apps/mock-tax-api
npm install
npm run dev
```

Dịch vụ mặc định chạy tại `http://localhost:4000`.

## Endpoint

- `GET /health`: trạng thái dịch vụ.
- `GET /api/tax/check-mst/:mst`: kiểm tra định dạng mã số thuế; mã có định dạng hợp lệ trả trạng thái `UNVERIFIED` vì dịch vụ không tra cứu nguồn thật.
- `POST /api/tax/invoice/issue-code`: tạo mã hóa đơn mô phỏng.
- `GET /api/tax/invoice/verify/:code`: xem mã được tạo trong phiên chạy hiện tại.
- `GET /api/tax/history`: xem lịch sử mô phỏng trong bộ nhớ của phiên chạy hiện tại.
- `POST /api/v1/invoices/issue`: endpoint tương thích với middleware FinTax.

Lịch sử mô phỏng chỉ tồn tại trong bộ nhớ và tự trống khi khởi động lại dịch vụ.
