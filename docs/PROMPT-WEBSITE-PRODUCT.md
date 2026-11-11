# Prompt triển khai website sản phẩm FinWorkshop

## Mục tiêu

Làm lại website công khai FinWorkshop thành website B2B giới thiệu và chuyển đổi khách hàng cho nền tảng quản trị xưởng. Người đọc là chủ doanh nghiệp, quản lý sản xuất và kế toán. Giữ thương hiệu FinWorkshop/FinTax, không đổi nghiệp vụ trong ứng dụng.

## Nguyên tắc thiết kế

- Nền trắng, chữ mực đậm, lưới biên tập rõ ràng, độ tương phản cao; đỏ thương hiệu #A91517 chỉ dùng cho điểm nhấn/hành động chính.
- Tránh gradient, glow, thẻ nổi, hình tròn trang trí, số liệu/khen ngợi giả và câu chữ sáo rỗng. Góc bo nhỏ, đường phân cách mảnh, không lạm dụng card.
- Dùng ảnh chụp UI thật có ghi “dữ liệu trình diễn”, không vẽ dashboard giả để quảng bá.
- Nội dung cụ thể: báo giá, BOM, sản xuất, kho, hóa đơn, thanh toán, công nợ, báo cáo, phân quyền và tích hợp Odoo. Nêu đúng giới hạn phiên bản; không tuyên bố đã phát hành hóa đơn/nộp thuế/ngân hàng thật hay đã tuân thủ đầy đủ.

## Trang và tương tác

1. /: tổng quan, ảnh ứng dụng, các quy trình, giải pháp theo bộ phận, cách triển khai và CTA rõ ràng.
2. /san-pham: chức năng, dữ liệu đầu vào/đầu ra và đường vào ứng dụng.
3. /giai-phap/san-xuat và /giai-phap/ke-toan: bài toán theo nhóm công việc, quy trình và khả năng thực tế.
4. /trien-khai: phạm vi, các bước và yêu cầu chuẩn bị; không tự đặt giá bán hoặc cam kết SLA.
5. /tai-lieu: nội dung hướng dẫn đọc được, tìm kiếm/chọn chủ đề có tác dụng thật.
6. /demo: chọn vai trò và đăng nhập demo qua API thật; có loading/lỗi, không giả lập thành công.
7. /lien-he: form thật, kiểm tra phía client/server, lưu bền vững vào bảng riêng, trả mã yêu cầu; không giả vờ gửi email.
8. /bao-mat, /dieu-khoan: mô tả phạm vi và giới hạn đúng thực tế, không tuyên bố chứng nhận chưa có.

Mọi CTA quan trọng phải là đường dẫn có ý nghĩa, không href="#" hoặc mọi nút cùng trỏ login. Menu mobile hoạt động, Back/reload giữ đúng trang. Link đi nghiệp vụ phải giữ next nội bộ an toàn qua đăng nhập. Không mở redirect ra domain bên ngoài.

## Phạm vi kỹ thuật

Tái dùng React/Vite, auth và API hiện có. CSS riêng namespace fw-site, không làm thay style workspace. Thêm POST /api/website/inquiries và bảng website_inquiries riêng; bind parameters, giới hạn tần suất, không lộ danh sách yêu cầu công khai. Không sửa các lỗi tài chính trong qa-results hoặc tự đánh chúng đã khắc phục.

## Kiểm chứng

Build TypeScript/Vite; kiểm tra các route/CTA/assets, desktop và mobile390px, menu/keyboard, demo login thực, form thành công/sai dữ liệu/không đồng ý, phản hồi có mã yêu cầu và bản ghi thực trong PostgreSQL. Chụp ảnh và lưu bằng chứng trong qa-results/website. Không push hoặc triển khai công khai ngoài môi trường local của dự án.
