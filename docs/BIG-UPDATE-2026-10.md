# BIG UPDATE · 27/10/2026

> Cập nhật sau báo cáo: VND và tỷ giá đã được cấu hình theo [LANDING-ODOO-VND.md](LANDING-ODOO-VND.md). Ghi chú VND chưa hoạt động bên dưới mô tả thời điểm kiểm thử trước.
Thay đổi được giữ cục bộ trong FinWorkshop. Chưa tạo commit, chưa push GitHub.

## Phạm vi đã thực hiện

- Giao diện giữ màu đỏ thương hiệu FinTax `#A91517`, icon Lucide 1.75px, màu trạng thái thống nhất, tiền có tabular digits, cảnh báo ở dòng quá hạn/tồn thấp/chờ duyệt.
- Tách `Dashboard.tsx`, `DocumentDetail.tsx`, `PaymentFromInvoice.tsx` và `presentation.ts`; bỏ modal in object thô và màn đăng nhập cũ không dùng.
- Chi tiết hóa đơn, giao dịch, báo giá, phiếu kho và lệnh sản xuất có bố cục theo loại chứng từ; bảng hàng hóa, thông tin đối tác, phân bổ, timeline, in và Excel. Chỉ giữ mã kỹ thuật rút gọn ở footer. Ngày giờ theo DD/MM/YYYY HH:mm, múi giờ Việt Nam.
- Dashboard bốn tầng, sáu KPI có so kỳ trước, biểu đồ thu/chi và số dư, 7/14/30 ngày hoặc sáu tháng; đủ ngày không phát sinh, tối đa 36px mỗi cột. Cơ cấu chi phí, tuổi nợ, tác vụ, sản xuất, tồn kho và chứng từ gần nhất lấy từ dữ liệu thực trong DB.
- API Dashboard đọc tập hợp, cache theo xưởng/bộ lọc 45 giây, vô hiệu hóa sau ghi dữ liệu; không ghi audit/cảnh báo khi chỉ đọc.
- API chi tiết được phân quyền/cách ly theo xưởng; liên kết chứng từ hiển thị mã nghiệp vụ. Thợ chỉ xem các lệnh được phân công và không nhận chi phí tài chính trong payload chi tiết.
- Seed trong xưởng Demo riêng: 60 hóa đơn của 30 ngày gần nhất, trên 40 giao dịch thu chi qua quỹ/ngân hàng và các phiếu/phân bổ liên quan; 12 TaxRules và hơn 20 mặt hàng. Hóa đơn Demo cũ được bổ sung bảng kê và timeline mà không đổi số tiền.
- Giữ các luồng INPUT/OUTPUT, gỡ/hủy, báo giá phiên bản mới, chiết khấu/phí/làm tròn và đăng ký offline của bản kế kiểm trước. Sửa thêm lỗi cộng TNCN hai lần khi TaxRule HKD đã chứa tổng tỷ lệ, lỗi bỏ lựa chọn thuế tùy chỉnh trên dòng có mặt hàng, và cách tổng hợp VAT/HKD hỗn hợp trong S4. Giữ đúng tổng thuế khi có làm tròn.
- Lưu đơn giá/ĐVT của vật tư tại lúc lập phiếu kho để số liệu chứng từ mới không phụ thuộc giá danh mục về sau. Tiếng Việt hóa thông báo lỗi tài chính thường gặp.

## Kiểm thử thực hiện

Môi trường chính cho kiểm thử ghi dữ liệu: **finworkshop_big_update_test**, API 3002, frontend 5174, Odoo giả lập offline tại cổng 8079. Các tài khoản `.workflow` thuộc xưởng Demo riêng. Không reset dữ liệu xưởng đang sử dụng.

| Kiểm tra | Kết quả |
| --- | --- |
| `test-workflows.js` | 15/15 nhóm đạt |
| `test-big-update.js` | 4 nhóm mở rộng đạt; gồm thuế tùy chỉnh, HKD, seed, Dashboard, định dạng và quyền |
| `test-export.mjs` | XLSX hợp lệ, Unicode, STT, tiền dạng số, tổng, style đạt |
| `test-odoo-contract.js` | `in_invoice`, VND, thuế, dòng không trùng, báo giá/phiếu tiền, điều chỉnh, unreconcile/cancel đạt trên máy chủ XML-RPC thử |
| TypeScript | Build và kiểm tra thêm `noUnusedLocals`, `noUnusedParameters` đạt |
| Vite | Production build đạt; bundle chia React/chart/spreadsheet |
| Seed lặp | Không tạo lại hóa đơn/không cộng lại số dư |
| Đối chiếu tài chính | Doanh thu/S1, chi phí/S3, thuế/S4, quỹ/S6, ngân hàng/S7 và công nợ đối tác khớp |
| Trục tiền | 13 thang giá trị từ 0 đến 1,5 tỷ: năm nhãn luôn khác nhau |

Phiên shell Codex có Node nhưng không có `npm` trong PATH. Production build được chạy bằng đúng hai bước của script `build`: `tsc -b` rồi `vite build`; README giữ lệnh npm thông dụng cho môi trường có npm.

Kiểm tra trình duyệt:

- Tạo hóa đơn mua vào: 2 × 100.000, thuế 8% → thuế 16.000, tổng 216.000; sau lưu vẫn tab Chi và URL `type=INPUT`.
- Chuyển tab sau khi mở chi tiết không mở lại nhầm chứng từ từ tab cũ.
- Mở 11 phân hệ chính ngoài Dashboard, cả bảy tab quản trị và các modal hóa đơn/giao dịch/báo giá/sản xuất/kho; kiểm tra nhãn, lỗi tải, JSON thô, ngày ISO.
- Clone báo giá REJECTED mở DRAFT v2, còn đủ vật tư/giờ công/máy/hao hụt/biên lợi nhuận và lý do từ chối.
- Đăng nhập Thợ xưởng: chỉ thấy phân hệ vận hành/phân công; không có menu tài chính.
- Mở S1 đến S7, tải Excel cả bảy sổ bằng nút trên UI; đọc lại file tải về xác nhận bảy sheet S1-HKD…S7-HKD.

Trong lúc thay mã nguồn, dev server có thể khởi động lại/HMR và ngắt yêu cầu đang xem; các màn đã được tải lại khi dịch vụ sẵn sàng. Kết quả kiểm thử xác nhận các kịch bản trên, không phải cam kết đã chứng minh mọi tình huống có thể xảy ra.

## Dọn dẹp và bảo toàn

Bỏ màn đăng nhập cũ, import/state dư trong những màn thay đổi và ba `.gitkeep` rỗng trong thư mục ứng dụng đã có mã nguồn; xóa bytecode Python `.pyc` khỏi cây nguồn và thêm quy tắc bỏ qua `__pycache__`. Giữ `.cursorrules`, toàn bộ `docs`, README, file hướng dẫn, `.env`, uploads, `backup`, `.grapuco`, Git và dependency. File build được tạo lại để dùng phiên bản mới; không xóa bản sao lưu người dùng.

## Điều kiện còn phụ thuộc môi trường

- PostgreSQL là DB thực tế. Dùng hàng đợi `odoo_sync_jobs` hiện có thay vì tạo thêm bảng hàng đợi trùng chức năng.
- Công ty Odoo hiện dùng USD, VND chưa hoạt động và chỉ có thuế 15%. Chứng từ VNĐ cần thiết lập tiền tệ/tỷ giá, thuế và tài khoản tương ứng trước khi đồng bộ/ghi sổ đầy đủ; adapter giữ trạng thái chờ khớp danh mục khi thiếu cấu hình.
- Các kiểm thử Odoo thật có rollback và phục hồi tài khoản của bản trước được ghi riêng ở [UPGRADE-KE-KIEM.md](UPGRADE-KE-KIEM.md); không coi kiểm thử XML-RPC giả lập là đã ghi sổ thành công chứng từ thật.
- Mã CQT là thử nghiệm; chưa kết nối ngân hàng, ký số, phát hành hóa đơn hoặc nộp thuế thật. S1–S7 giữ cấu trúc TT88 theo yêu cầu đồ án; chế độ và thuế áp dụng thực tế cần rà soát theo kỳ, xem [README](../README.md#thuế-và-phạm-vi-sử-dụng).
