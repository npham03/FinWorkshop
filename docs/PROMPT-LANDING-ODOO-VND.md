# Prompt triển khai · FinWorkshop Landing & Odoo VND

## Vai trò và mục tiêu

Bạn là kỹ sư full-stack và nhà thiết kế sản phẩm B2B SaaS. Triển khai ngay trên FinWorkshop local một trang giới thiệu công khai, tách khỏi không gian thao tác của người dùng, và cấu hình Odoo nhận chứng từ VND đúng tiền tệ.

## Yêu cầu bất biến

- Giữ màu thương hiệu đỏ FinTax `#A91517`, hover `#861116`, logo hiện có; không đổi thành thương hiệu xanh.
- Không commit, push, đăng ra Internet, xóa chứng từ hoặc sửa bút toán đã ghi sổ. Giữ hướng dẫn, .env và dữ liệu người dùng.
- Chỉ dùng các tính năng đã có để viết nội dung; không bịa số khách hàng, cam kết tiết kiệm, nhận xét, gói giá hay tích hợp ngân hàng/hóa đơn thật.
- Mọi dữ liệu tài chính trong trang giới thiệu là ví dụ minh họa cục bộ, tuyệt đối không tải dữ liệu xưởng thật khi chưa đăng nhập.

## Trang giới thiệu

1. Trang `/` luôn công khai; `/login` là lối đăng nhập, `/register` đăng ký theo luồng duyệt hiện có, `/app` là Dashboard được bảo vệ. Giữ các đường dẫn nghiệp vụ cũ và phân quyền ba vai trò.
2. Phong cách: chỉn chu, rộng thoáng, nền trắng/ngà, typography tiếng Việt rõ nét; đỏ làm điểm nhấn. Dùng SVG/Lucide, không emoji. Responsive, focus rõ, bàn phím dùng được, hỗ trợ giảm chuyển động.
3. Cấu trúc có chiều sâu: header và điều hướng, lời hứa sản phẩm cụ thể, màn trình diễn sản phẩm, nhóm vấn đề thường gặp, giải pháp theo HKD/SME/xưởng, khám phá phân hệ tương tác, quy trình báo giá → sản xuất → hóa đơn → thu tiền → đối soát, phân quyền/kiểm soát, FAQ, CTA cuối và footer.
4. Hero nói ngắn về dòng tiền/công nợ/chi phí sản xuất; dùng hình sản phẩm minh họa thiết kế bằng HTML/SVG, không ảnh stock rời nội dung.
5. Nút bắt đầu, đăng nhập, xem Demo phải hoạt động. Tab nhóm khách hàng, tab phân hệ và FAQ phải thay nội dung thật. Liên kết neo có vị trí cuộn đúng dưới header; menu mobile đóng sau khi chọn.
6. Không đưa key nội bộ, UUID, JSON, chi tiết kỹ thuật ERP hay lời giải thích dài vào luồng marketing. FAQ nói rõ bản Demo và giới hạn kết nối thực tế khi cần.
7. Mỗi trang có title/description phù hợp. Tách bundle trang giới thiệu và workspace để landing không tải thư viện biểu đồ/Excel ngay khi mở.

## Odoo và VND

1. Đọc cấu hình công ty, tiền tệ, tỷ giá và số dòng kế toán trước khi sửa. Sao lưu cấu hình liên quan.
2. Nếu Odoo cho phép đổi đồng tiền chính an toàn, dùng VND. Nếu đã có dòng kế toán khiến Odoo chặn đổi, giữ nguyên đồng tiền sổ cái và bật đa tiền tệ VND theo phương án dự phòng người dùng yêu cầu.
3. Lấy tỷ giá từ nguồn ngân hàng Việt Nam chính thức, lưu giá, chiều mua/bán, URL và ngày/giờ công bố. Không bịa tỷ giá, dùng tỷ giá tương lai cho chứng từ cũ hoặc coi 1 VND = 1 USD.
4. Tạo/cập nhật bảng giá VND; kiểm tra quy đổi VND → tiền công ty bằng API Odoo. Lưu nguyên giá chứng từ VND và để Odoo tính tiền sổ cái.
5. Từ chối đồng bộ khi không có tỷ giá phù hợp ngày chứng từ; hiển thị lỗi cấu hình bằng tiếng Việt. Quy trình refresh tỷ giá phải kiểm tra nguồn, ngày và số trước khi ghi.
6. Chỉ middleware gọi XML-RPC; frontend không giữ thông tin đăng nhập Odoo. Không ghi sổ hàng loạt hoặc sửa chứng từ cũ chỉ để kiểm thử.

## Nghiệm thu

- TypeScript/Vite build đạt; kiểm tra local trên desktop/mobile.
- Mở `/` chưa đăng nhập thấy trang giới thiệu; CTA đến đúng login/đăng ký; đăng nhập Owner/Kế toán vào `/app`, Thợ về lệnh được phân công; đăng xuất rồi vẫn xem được landing.
- Tab/FAQ/menu mobile hoạt động; không lỗi console, tràn ngang, link chết hay nội dung giả mạo.
- Odoo trả VND đang hoạt động, bảng giá VND và tỷ giá xác minh được; phép quy đổi mẫu khớp, số bút toán cũ không đổi.
- Cập nhật README, lưu hướng dẫn tỷ giá và ảnh kiểm tra; giữ tất cả thay đổi tại máy.
