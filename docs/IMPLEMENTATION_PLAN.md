# FinTax Automation — hiện trạng triển khai

## Source of truth

- MySQL cục bộ lưu tài khoản, nghiệp vụ, import, demo seed và audit log để hoạt động bền vững khi Odoo chưa chạy.
- Odoo 16 là adapter ERP tùy chọn, được kiểm tra qua XML-RPC tại middleware. Bản hiện tại chưa tự đẩy bút toán nghiệp vụ sang Odoo; khi chưa cấu hình, hồ sơ có `LOCAL_DEMO` và UI không tuyên bố đồng bộ.
- Mock Tax API chạy độc lập ở cổng 4000; mọi mã trả về là giả lập.
- React client chỉ giao tiếp REST với middleware.

## Quyết định phạm vi

- Dùng React/Vite/Tailwind/Axios, Express, MySQL theo README hiện có; PostgreSQL của Odoo được giữ riêng.
- Dùng ba role OWNER, ACCOUNTANT, WORKSHOP; chủ hộ có thể thao tác bằng một tài khoản OWNER.
- Sao kê được upload và preview trước commit, nhận biết dòng trùng; nhóm cá nhân/chuyển nội bộ/vốn chủ được tách khỏi thu chi kinh doanh.
- Luồng thuế/hóa đơn thật, ngân hàng, chữ ký số, OCR engine và schema XML chính thức chưa tích hợp. TaxRules mẫu ở trạng thái rà soát; file sổ xuất được đánh dấu tham khảo.
- App có dashboard, CRUD phân hệ, duyệt báo giá, lệnh xưởng, giả lập cấp mã, phân loại thu chi, báo cáo Excel và audit log.

## Còn cần phát triển để dùng vận hành thực tế

- Tích hợp mapping và outbox đồng bộ Odoo cho từng model, gồm xử lý lỗi/retry và đối chiếu nguồn dữ liệu.
- Mở rộng tính toàn vẹn giao dịch cho phân bổ thanh toán, kho và nghiệp vụ kế toán liên quan.
- Cấu hình và xác minh OCR, gửi file an toàn, sao lưu/khôi phục, giám sát và kiểm soát triển khai production.
- Chuyên gia rà soát hồ sơ thuế, TaxRules, biểu mẫu, quy trình hóa đơn và mọi căn cứ pháp lý còn hiệu lực trước khi dùng dữ liệu thật.
