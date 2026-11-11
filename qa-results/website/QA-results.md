# Kiểm thử website FinWorkshop

Ngày: 11/11/2026. Microsoft Edge, trình duyệt kiểm thử riêng; UI `http://127.0.0.1:5184`, API `http://127.0.0.1:3005/api`. Lần cuối `WEBSITE-QA-1794381371273`.

**Kết quả: 33/33 đạt; 0 lỗi JavaScript, 0 lỗi console, 0 tài nguyên hỏng.**

- Kiểm tra 10 trang public tại desktop1440 và mobile390: đúng URL, tiêu đề/h1 riêng, không tràn ngang; menu/CTA có đường dẫn thật, không là liên kết rỗng hoặc chỉ `#`.
- Menu Giải pháp và menu mobile hoạt động. Escape đóng menu.
- Ba tab ảnh sản phẩm đổi đúng ảnh chụp ứng dụng thật bằng phím mũi tên/Home/End; focus và aria-selected được cập nhật. FAQ mở/đóng đúng.
- Tài liệu có tìm kiếm không kết quả, xóa bộ lọc, lọc Tài chính và đọc bài chi tiết thực sự.
- Form liên hệ: trống/email sai/chưa đồng ý không gửi request. API trả400 kèm lỗi trường với payload sai; gửi hợp lệ từ UI trả201, mã `FW-B3A2D939-FC2B-4D35-94E2-AADC4E43337B`. Kiểm tra SQL chỉ đọc xác nhận đúng1 dòng CONTACT, consent=true và đúng mã/tag, lưu tại `inquiry-ui-persistence.json`.
- Demo thực sự gọi login trả200, đăng nhập OWNER và mở `/app`; không ghi mật khẩu trong storage/kết quả kiểm thử.
- Login giữ đích nội bộ `/inventory`, từ chối đích ngoài `//evil.example`; trang giới thiệu không buộc đăng xuất phiên đang có.
- Không có dữ liệu liên hệ/mật khẩu lưu trong localStorage hoặc sessionStorage sau gửi form. Token phiên ứng dụng giữ theo auth contract hiện hành; kết quả chỉ ghi token có/không, không ghi giá trị.

Ảnh bàn giao:

- [Trang chủ desktop1440x1000](screenshots/home-desktop-viewport.png)
- [Trang chủ desktop toàn trang](screenshots/desktop-home.png)
- [Trang chủ mobile390](screenshots/mobile-home.png)
- [Sản phẩm](screenshots/desktop-san-pham.png)
- [Liên hệ](screenshots/desktop-lien-he.png)
- [Bài tài liệu](screenshots/docs-article.png)
- [Form gửi thành công](screenshots/contact-success.png)
- [Demo đã đăng nhập](screenshots/demo-dashboard.png)

Chứng cứ chi tiết: `marketing-qa.json`; script chạy lại: `node qa-results/website/verify-marketing.cjs`. Các trang còn lại đều có ảnh desktop/mobile trong `screenshots/`.

Lần đầu phát hiện warning React18 của fetchPriority, thiếu khoảng cách dòng trên mobile và hai CTA lặp. Nhóm triển khai đã chỉnh; lần cuối phía trên kiểm tra lại toàn bộ và không còn warning. QA chỉ tạo/sửa file kiểm thử và ghi chú, không sửa ứng dụng hoặc luồng tài chính. Chỉ có2 request inquiry trong mỗi lần chạy, dùng thông tin tổng hợp kiểm thử; không gửi email thật.
