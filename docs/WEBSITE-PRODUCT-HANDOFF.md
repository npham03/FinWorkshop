# Website sản phẩm FinWorkshop

Ngày: 11/11/2026. Triển khai trên checkout FinWorkshop-QA-20261111, nền commit399cbdd. Không commit/push hoặc xuất bản lên hosting ngoài.

## Đã thay đổi

- Trang chủ biên tập lại: nền trắng, lưới rõ ràng, typography lớn, đỏ thương hiệu tiết chế, ít bo tròn; bỏ dashboard vẽ minh họa và số liệu quảng cáo không có nguồn.
- Ảnh giao diện từ chính môi trường demo, có nhãn dữ liệu trình diễn; chuyển được giữa tổng quan, sản xuất và hóa đơn.
- Menu, footer và CTA dẫn đến trang cụ thể; không dùng tất cả nút để cuộn trong một landing dài hoặc cùng về login.
- Chín trang đích: Sản phẩm, Sản xuất, Kế toán, Triển khai, Tài liệu, Liên hệ, Demo, Dữ liệu/bảo mật, Điều khoản.
- Tài liệu có tìm kiếm, bộ lọc, trạng thái không kết quả và bài hướng dẫn đọc được; query giữ chủ đề để chia sẻ/tải lại.
- Demo có lựa chọn bốn vai trò, gọi auth API thật và mở workspace. Phiên hiện có không tự bị đăng xuất khi đọc website.
- Liên kết nghiệp vụ qua login giữ next nội bộ an toàn theo allowlist; không cho redirect ra domain khác.
- Form trao đổi có validation, consent, loading và lỗi; lưu PostgreSQL trong website_inquiries riêng, trả mã tiếp nhận. Không tự gửi email/đặt lịch.

## Các đường dẫn

`/`, `/san-pham`, `/giai-phap/san-xuat`, `/giai-phap/ke-toan`, `/trien-khai`, `/tai-lieu`, `/lien-he`, `/demo`, `/bao-mat`, `/dieu-khoan`.

Các route workspace cũ giữ nguyên. Marketing CSS được giới hạn bằng namespace fw-site; không thay layout/cách hạch toán của các phân hệ bên trong.

## Lưu yêu cầu liên hệ

POST `/api/website/inquiries` với name/email/company?/phone?/message/type/consent. Các loại DEMO, CONTACT, IMPLEMENTATION.

- Bảng riêng tự khởi tạo khi API khởi động, không ghi vào workshop hoặc sổ tài chính.
- Parameterized insert, kiểm tra dữ liệu phía server, giới hạn body16KB và tần suất có Retry-After.
- Không cung cấp API công khai để đọc danh sách/nội dung người khác. Quản trị viên CSDL tra cứu qua quyền vận hành nội bộ; chưa làm CRM quản lý lead.
- Chưa cấu hình SMTP thông báo yêu cầu. Thành công trên form chỉ là đã lưu, không phải có email gửi đi hoặc đã xác nhận lịch hẹn.
- Đây không phải triển khai thương mại có thanh toán gói, hợp đồng điện tử, SLA hay chứng nhận tuân thủ. Giá/phạm vi phải được đơn vị vận hành chốt riêng.

Hợp đồng API và cách kiểm tra: [INQUIRY_API.md](../qa-results/website/INQUIRY_API.md).

## Kiểm chứng

- Build TypeScript/Vite đạt; git diff --check đạt.
- 33/33 ca Edge:10route xdesktop/mobile390px, link/asset, menu, preview bằng bàn phím, FAQ, tài liệu, form, demo, next an toàn.
- Không pageerror, consoleerror hoặc failedasset trong lần chạy cuối.
- Backend unit/HTTP/SQL:8 kiểm tra persistence/validation và trường hợp body lớn, query parameterized, chặn đọc danh sách; dữ liệu tài chính không đổi do module liên hệ.
- Yêu cầu form từ trình duyệt có reference được đối chiếu đúng1 dòng trong PostgreSQL.
- Chạy lại18/18 nhóm test-review-fixes đạt. Không coi đó là đã sửa45 phát hiện QA cũ.

Chứng cứ và ảnh: [qa-results/website](../qa-results/website/QA-results.md).

## File chính

- apps/web-client/src/LandingPage.tsx: trang chủ.
- apps/web-client/src/marketing/: layout, CSS, các trang đích và kiểm tra next.
- apps/web-client/src/App.tsx: route công khai.
- apps/web-client/src/AuthPages.tsx: trả về next sau đăng nhập.
- apps/middleware-api/src/website.js: form API/bảng riêng.
- apps/middleware-api/src/server.js: chỉ thêm import, mount và khởi tạo module website.

Prompt ban đầu: [PROMPT-WEBSITE-PRODUCT.md](PROMPT-WEBSITE-PRODUCT.md).
