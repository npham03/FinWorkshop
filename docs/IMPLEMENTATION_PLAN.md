# FinTax Automation — hiện trạng triển khai

## Source of truth

- MySQL cục bộ lưu nghiệp vụ, import, demo seed và audit log; tài khoản FinTax được quản lý trong Odoo và đồng bộ hồ sơ tối thiểu sang MySQL để phân quyền.
- Odoo 16 nhận dữ liệu từ middleware qua XML-RPC. Báo giá web tạo/cập nhật `sale.order`; hóa đơn đầu vào/đầu ra tạo/cập nhật `account.move`; khoản thu/chi tạo `account.payment`. Các chứng từ được giữ ở trạng thái nháp để người dùng rà soát trong Odoo.
- Mock Tax API chạy độc lập ở cổng 4000; mọi mã trả về là giả lập.
- React client chỉ giao tiếp REST với middleware.

## Quyết định phạm vi

- Dùng React/Vite/Tailwind/Axios, Express, MySQL theo README hiện có; PostgreSQL của Odoo được giữ riêng.
- Dùng ba role OWNER, ACCOUNTANT, WORKSHOP; chủ hộ có thể thao tác bằng một tài khoản OWNER.
- Sao kê được upload và preview trước commit, nhận biết dòng trùng; nhóm cá nhân/chuyển nội bộ/vốn chủ được tách khỏi thu chi kinh doanh.
- Luồng thuế/hóa đơn thật, ngân hàng, chữ ký số, OCR engine và schema XML chính thức chưa tích hợp. TaxRules mẫu ở trạng thái rà soát; file sổ xuất được đánh dấu tham khảo.
- App có dashboard, CRUD phân hệ, duyệt báo giá, lệnh xưởng, giả lập cấp mã, phân loại thu chi, báo cáo Excel và audit log.

## Còn cần phát triển để dùng vận hành thực tế

- Mở rộng mapping/outbox Odoo cho các phân hệ còn lại và đồng bộ hai chiều nếu cần nhập chứng từ được tạo trực tiếp trong Odoo vào web.
- Mở rộng tính toàn vẹn giao dịch cho phân bổ thanh toán, kho và nghiệp vụ kế toán liên quan.
- Cấu hình và xác minh OCR, gửi file an toàn, sao lưu/khôi phục, giám sát và kiểm soát triển khai production.
- Chuyên gia rà soát hồ sơ thuế, TaxRules, biểu mẫu, quy trình hóa đơn và mọi căn cứ pháp lý còn hiệu lực trước khi dùng dữ liệu thật.
