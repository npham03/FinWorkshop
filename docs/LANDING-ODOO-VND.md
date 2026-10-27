# Trang giới thiệu & Odoo VND · 27/10/2026

## Trang công khai và không gian thao tác

| Đường dẫn local | Mục đích |
| --- | --- |
| http://localhost:5173/ | Trang giới thiệu công khai, kể cả khi đã đăng nhập |
| http://localhost:5173/login | Đăng nhập và chọn vai trò Demo |
| http://localhost:5173/register | Đăng ký theo luồng chờ duyệt |
| http://localhost:5173/app | Dashboard được bảo vệ; Thợ xưởng chuyển về `/workshop` |

Các đường dẫn `/transactions`, `/payments`, `/invoices`, `/workshop`… được giữ để liên kết/chứng từ cũ vẫn mở được. Logo workspace đưa về trang giới thiệu; mục Bảng điều khiển đưa tới `/app`.

Trang giới thiệu dùng màu đỏ FinTax `#A91517`, logo hiện có, nền ngà và hình sản phẩm bằng HTML/SVG. Có giải pháp theo HKD/SME/xưởng, ba tab phân hệ, quy trình công việc, kiểm soát theo vai trò, FAQ, menu mobile và CTA hoạt động. Các số tiền trên hình sản phẩm được ghi rõ **minh họa**, không lấy dữ liệu tài chính xưởng thật. Không có khách hàng, số liệu tăng trưởng, bảng giá hoặc lời chứng thực được bịa ra.

Bundle workspace được tải lười: landing không preload thư viện biểu đồ và Excel. Các trang giới thiệu, đăng nhập và workspace có tiêu đề phù hợp. Không đăng ra Internet và không commit/push.

Prompt được viết trước khi triển khai: [PROMPT-LANDING-ODOO-VND.md](PROMPT-LANDING-ODOO-VND.md). Hai trang HUFLIT người dùng đưa được tham khảo về cách tách giới thiệu và đăng nhập; không sao chép nội dung, logo hoặc tuyên bố của HUFLIT.

## Kết quả cấu hình Odoo thật

Database `fintax_clean`, công ty `YourCompany` (ID 1) có **14 bút toán đã ghi sổ** và đã có dòng kế toán. Mã Odoo 16 chặn đổi đồng tiền công ty khi tồn tại dòng kế toán. Không xóa hay reset các bút toán để vượt chốt này.

Đã thực hiện phương án dự phòng người dùng yêu cầu:

- Kích hoạt VND, bước làm tròn 1 đồng; Odoo tự bật giao diện đa tiền tệ.
- Giữ USD là đồng tiền sổ cái hiện có; chứng từ FinWorkshop truyền lên vẫn mang `currency_id=VND` và nguyên giá VNĐ.
- Tạo bảng giá **FinWorkshop · VNĐ** nếu chưa có; lệnh chạy lại dùng lại bảng giá này.
- Tỷ giá ngày **27/10/2026**: **1 USD = 26.050 VND**, theo cột **Sell / Giá bán** Vietcombank; lưu rate USD=1 và VND=26.050 theo đúng chiều của Odoo.
- Lưu ngày, giờ công bố, các cột mua/chuyển khoản/bán, chiều giá đã chọn và URL nguồn trong `ir.config_parameter` theo công ty/ngày. Không sửa tỷ giá lịch sử để biến chứng từ cũ thành tiền VND.
- Đọc và so fingerprint các bút toán đã ghi sổ trước/sau cấu hình: 14/14 giữ nguyên trạng thái, tiền nguyên tệ và giá trị sổ cái.

Nguồn: [bảng tỷ giá Vietcombank](https://www.vietcombank.com.vn/To-chuc/Trang-chu-DCTC/KHTC---Ti-gia---DCTC), [XML được ngân hàng liên kết chính thức](https://portal.vietcombank.com.vn/Usercontrols/TVPortal.TyGia/pXML.aspx). Lần cấu hình lấy công bố `10/27/2026 7:11:29 AM`; giá mua tiền mặt 25.640, mua chuyển khoản 25.670, bán 26.050 VND/USD. Giá bán được chọn làm tỷ giá **tham chiếu quy đổi** cho môi trường hiện có; đây không phải khẳng định một chiều giá áp dụng cho mọi tình huống thuế/kế toán thực tế.

Kiểm tra trong Odoo thật bằng transaction rollback:

- `26.050 VND → 1 USD` và `1 USD → 26.050 VND` qua hàm quy đổi gốc Odoo.
- Tạo hóa đơn mua vào nháp để kiểm chứng: tổng nguyên tệ 26.050 VND, giá trị sổ cái tuyệt đối 1 USD.
- Không ghi sổ; toàn bộ đối tác/hóa đơn kiểm chứng đã rollback.

Sao lưu cấu hình trước thay đổi: `C:/Users/kocot/Downloads/gpt/odoo-vnd-before-20261027.json`. Không chứa mật khẩu Odoo.

## Vận hành tỷ giá

Trong **Cài đặt → Tích hợp → Tiền tệ & Tỷ giá VNĐ**, xem tiền chứng từ, tiền sổ cái, giá tham chiếu và ngày công bố. Chỉ Chủ xưởng được chọn **Cập nhật tỷ giá VND**. API lấy dữ liệu trực tiếp từ URL Vietcombank cố định; không nhận URL hay tỷ giá tùy ý từ trình duyệt.

Lệnh từ thư mục gốc, tự đọc `apps/middleware-api/.env`:

```powershell
# Chỉ đọc trạng thái, không thay cấu hình:
npm run configure:odoo-vnd
# Cập nhật VND/bảng giá/tỷ giá, tạo bản sao cấu hình trước khi thay:
npm run configure:odoo-vnd -- --apply
```

Lệnh CLI chỉ cho endpoint Odoo loopback của môi trường local. Khi công ty chưa có dòng kế toán, CLI có thể đổi trực tiếp tiền công ty sang VND; nút refresh trên giao diện chỉ cập nhật cấu hình VND/tỷ giá, không đổi tiền sổ cái.

Adapter chặn đồng bộ khi VND chưa hoạt động, thiếu nguồn xác minh, tỷ giá bị thay khác số đã xác minh, ngày nguồn ở tương lai so với chứng từ hoặc nguồn quá 7 ngày. Khoảng 7 ngày cho phép dùng công bố gần nhất qua ngày nghỉ; không tự dùng tỷ giá hôm nay cho hóa đơn cũ. Các chứng từ trước ngày 27/10/2026 chưa có tỷ giá đúng kỳ sẽ giữ trạng thái cần cấu hình. Để nạp lịch sử, cần bảng tỷ giá được xác minh cho kỳ đó cùng metadata nguồn; không coi dòng rate mẫu năm 2010 là dữ liệu đã duyệt.

Thuế Odoo vẫn là cấu hình độc lập: thiếu mức thuế khớp hoặc nghĩa vụ thuế HKD thì giữ `PENDING_MAPPING`. Bật VND không tự đánh dấu mọi chứng từ là đã đồng bộ, không tự ghi sổ và không thay kết luận khấu trừ thuế.

## Nghiệm thu

- TypeScript build và kiểm tra unused locals/parameters: đạt.
- Vite production build: đạt; entry marketing riêng, Portal tải lười.
- Kiểm thử VCB: phân tích dấu phân cách, ngày, chiều tỷ giá, dữ liệu tương lai/quá hạn/không hợp lệ, rate bị đổi: đạt.
- Hợp đồng XML-RPC: công ty gốc USD, chứng từ VND, kiểm soát tỷ giá, mapping hóa đơn/phiếu tiền và luồng cũ: đạt.
- Endpoint tỷ giá: Kế toán nhận 403, Owner nhận lỗi 409 có kiểm soát khi Odoo thử offline; nút cập nhật trên bản chính trả thành công và tạo audit.
- Đã thử lại 7 tác vụ đang chờ của xưởng Demo sau cấu hình: 2 đồng bộ thành công; 5 còn chờ do hai hóa đơn chưa khớp thuế và các phân bổ/bút toán phụ thuộc hóa đơn đó. Không backfill hay tự ghi sổ. Kiểm tra lại fingerprint: 14 bút toán đã ghi sổ vẫn không đổi.
- Sửa nhãn hàng đợi để lỗi thuế chứa đơn vị VND không bị nhận nhầm thành lỗi tiền tệ.
- 15/15 nhóm nghiệp vụ và kiểm tra XLSX: đạt trên API 3003/database `finworkshop_intro_test`, tách dữ liệu chính.
- Trình duyệt 1440px/390px và kích thước bình thường: không tràn ngang; menu, neo dưới header, tab giải pháp, nhóm khách hàng, FAQ hoạt động.
- Owner đăng nhập tới `/app`; đường dẫn hóa đơn cũ hoạt động; Thợ về `/workshop`; landing vẫn công khai khi đăng nhập; đăng xuất có đường quay về giới thiệu.

Chạy kiểm thử tỷ giá: `npm run test:currency`. Chi tiết bộ kiểm thử nghiệp vụ trước ở [BIG-UPDATE-2026-10.md](BIG-UPDATE-2026-10.md). Những kết quả này xác nhận các kịch bản đã chạy, không khẳng định mọi tình huống có thể xảy ra đều đã được chứng minh.
