# Bản nâng cấp nghiệp vụ kế kiểm FinWorkshop

> Cập nhật sau báo cáo: VND và tỷ giá đã được cấu hình theo [LANDING-ODOO-VND.md](LANDING-ODOO-VND.md). Ghi chú VND chưa hoạt động bên dưới mô tả thời điểm kiểm thử trước.
Ngày bàn giao: 27/10/2026. Thay đổi được giữ tại máy, chưa commit hoặc push GitHub.

## Mở ứng dụng và dữ liệu Demo

Chạy ứng dụng bằng các lệnh hiện có trong README hoặc `npm run dev` ở thư mục gốc. Database thực tế của phiên bản này là **PostgreSQL**, dùng chung hạ tầng PostgreSQL với Odoo; không có migration chuyển sang MySQL.

`npm run seed:workflows` nạp bộ nghiệp vụ vào xưởng riêng **Xưởng Demo Kiểm thử FinWorkshop**. Lệnh chạy lặp không ghi đè dữ liệu đã có. Ba tài khoản của bộ này:

| Vai trò | Email |
| --- | --- |
| Chủ xưởng | owner.workflow@fintax.demo |
| Kế toán | accountant.workflow@fintax.demo |
| Thợ xưởng | workshop.workflow@fintax.demo |

Mật khẩu lấy từ `DEMO_PASSWORD`; khi chưa cấu hình là mật khẩu Demo hiện có `FinTax@2026`.

Bộ Demo có quỹ tiền mặt, hai tài khoản ngân hàng, khách hàng/NCC, 20 vật tư/sản phẩm/dịch vụ, 12 TaxRules, BOM, báo giá ở năm trạng thái, lệnh được phân công, phiếu ISSUE/RETURN/WASTE, giờ công, hóa đơn INPUT/OUTPUT, thu/chi, phân bổ, phí ngân hàng, làm tròn, đối soát và kỳ mở. File `docs/demo-bank-statement.csv` có dòng hợp lệ, dòng trùng và dòng lỗi để kiểm thử import.

## Các luồng đã thay đổi

- **Hóa đơn INPUT:** tab Chi khóa `direction/type=INPUT`, giữ tab sau khi lưu. Có nhiều dòng mặt hàng/vật tư, TaxRule hoặc thuế suất riêng, số lượng, đơn giá, chiết khấu, tính thuế/tổng realtime và làm tròn thuế/tổng tối đa ±5 đồng mỗi trường. API tự tính khi thiếu tiền thuế/tổng, kiểm tra số học và không chấp nhận các trường phân loại mâu thuẫn. INPUT cập nhật Phải trả; OUTPUT cập nhật Phải thu.
- **Gỡ phân bổ:** mở Chi tiết hóa đơn hoặc phiếu thu/chi, chọn Gỡ phân bổ và nhập lý do. API đảo tất toán công nợ, trả số dư chưa phân bổ cho phiếu, đảo bút toán điều chỉnh/phí đã tạo kèm phân bổ và lưu audit trong cùng transaction. Thao tác lặp bị chặn. Tiền thu/chi gốc vẫn được giữ. Nếu phí ngân hàng thực tế vẫn còn sau khi sửa phân bổ, ghi lại khoản chi phí đó như một giao dịch độc lập để đối chiếu sao kê.
- **Hủy hóa đơn:** Owner có thể gỡ toàn bộ phân bổ và hủy trong một transaction, với danh sách phân bổ hiển thị trước khi xác nhận và lý do bắt buộc. Hủy trực tiếp hóa đơn còn phân bổ bị chặn. Công nợ hóa đơn đã hủy bằng 0.
- **Phiên bản báo giá:** nút Tạo phiên bản mới ở REJECTED/APPROVED/SENT sao chép dữ liệu, BOM/items và chi phí, tăng phiên bản theo toàn bộ chuỗi, gắn `parentQuoteId` về gốc, mở bản DRAFT và hiển thị lý do từ chối. Bản cũ được giữ nguyên.
- **Chênh lệch:** có thể phân bổ từ hóa đơn, thanh toán hoặc đối soát. Giá trị tất toán = tiền phân bổ + chiết khấu thanh toán + làm tròn. Phí NH là khoản chi riêng, không giảm công nợ thêm lần nữa. Làm tròn thanh toán tối đa ±5 đồng; chênh lệch lớn dùng trường chiết khấu. Các khoản điều chỉnh/phí đều cần lý do.
- **Đăng ký:** lưu tài khoản chưa hoạt động với `PENDING_OWNER`/`PENDING_SYNC` và tác vụ `REGISTER_USER` trước khi gọi Odoo. Dùng bảng hàng đợi hiện có `odoo_sync_jobs`; không tạo bảng hàng đợi trùng chức năng. Khi offline, trả đăng ký thành công và giữ tác vụ thử lại. Tài khoản chỉ hoạt động sau khi Owner duyệt và đồng bộ ERP thành công. Tên xưởng trong form đăng ký là thông tin yêu cầu, không tự cấp vai trò OWNER hoặc tạo xưởng riêng ngay.
- **Kiểm soát kỳ/audit:** kiểm tra cả ngày chứng từ trước và sau sửa, ngày phiếu tiền và ngày hóa đơn khi phân bổ/gỡ. Owner phải nhập lý do mở khóa. Các luồng tài chính mới, duyệt/từ chối báo giá và khóa/mở kỳ lưu dữ liệu cùng audit trong transaction; audit có vai trò và lý do.
- **Danh sách:** bảng dùng chung có STT theo trang, tìm kiếm debounce, lọc loại/trạng thái, badge màu, lựa chọn 10/20/50/100 dòng, Đầu/Trước/Số trang/Tiếp/Cuối và Excel theo bộ lọc. Chi tiết hiển thị đầy đủ dữ liệu; chứng từ đã ghi sổ dùng hủy/gỡ/điều chỉnh thay cho sửa số tiền trực tiếp. Đối soát đã khớp có thể được Owner mở lại với lý do trước khi sửa.
- **Dashboard:** đọc tập hợp các phân hệ trong một query, cache 45 giây theo xưởng/khoảng ngày, vô hiệu hóa sau commit giao dịch; việc đọc Dashboard không ghi cảnh báo/audit vào DB.
- **Sổ sách:** S1–S7 được tổng hợp ở API từ cùng bộ dữ liệu, không query theo từng dòng. Có đối chiếu số dư đầu kỳ/thu/chi/tồn, vật tư, chi phí, thuế và lương. VAT đầu vào chỉ đưa vào khấu trừ sau khi đánh dấu đủ điều kiện ở hóa đơn. Có xuất riêng từng sổ hoặc cả bảy sheet trong một XLSX, tiêu đề có màu, STT, định dạng VNĐ và tổng cuối bảng.

## Odoo

INPUT map sang `account.move/in_invoice`, OUTPUT sang `out_invoice`. Chứng từ nguồn VNĐ yêu cầu đồng VND hoạt động; không tự diễn giải giá trị VNĐ thành USD. Không tìm được thuế phù hợp thì giữ `PENDING_MAPPING`; thuế 0% và KCT được phân biệt. Thuế HKD GTGT/TNCN không tự gộp thành một thuế GTGT khấu trừ.

Addon `fintax_bridge` phiên bản `16.0.1.3.0` bổ sung bút toán điều chỉnh, khóa định danh phân bổ để tránh reconcile lặp, gỡ reconcile và hủy hóa đơn. Hóa đơn/phiếu tiền/bút toán điều chỉnh cần được kiểm tra và ghi sổ ở Odoo trước khi reconcile. Không tự ghi sổ các chứng từ nháp. Reconcile ngoài FinTax cần được rà soát ở Odoo; hệ thống không tự gỡ các khoản đó.

**Cấu hình còn cần tại môi trường Odoo hiện có:** công ty đang dùng USD, VND chưa hoạt động và chỉ có thuế 15%. Cần thiết lập VND/tỷ giá, bảng giá VND, thuế mua/bán tương ứng và tài khoản nghĩa vụ thuế HKD trước khi các chứng từ VNĐ đồng bộ đầy đủ. Có thể đặt các mapping tài khoản `fintax.writeoff_expense_account_id`, `fintax.writeoff_income_account_id`, `fintax.bank_fee_account_id` trong system parameters; addon cũng nhận diện các tài khoản tương ứng của chart Demo hiện có. Các khoản này giữ trạng thái cần mapping cho đến khi cấu hình phù hợp.

## Kiểm thử

Đã chạy trên database riêng `finworkshop_upgrade_test` và API cổng 3002:

- 15/15 nhóm kiểm thử API/workflow: đăng nhập ba vai trò/RBAC, TaxRules, INPUT/OUTPUT và số học, phân bổ/chênh lệch, gỡ/hủy, audit, revise báo giá, xưởng/kho/giờ công, import/đối soát, S1–S7, kỳ khóa, cache và đăng ký offline.
- Hợp đồng XML-RPC qua máy chủ giả lập: `in_invoice`, VND, thuế, cập nhật dòng không nhân đôi, sale.order/account.payment, điều chỉnh, unreconcile và cancel.
- Phục hồi đăng ký với **Odoo thật đang online**: đăng ký khi offline → Owner duyệt → `SYNCED` và hoạt động → đăng nhập thành công. Tài khoản thử đã được khóa lại.
- Odoo thật, công ty tạm trong transaction rollback: ghi sổ hóa đơn INPUT 108.000, phiếu chi 107.995, bút toán cân bằng chiết khấu/làm tròn/phí NH; reconcile về dư 0; thử lại không nhân đôi; unreconcile về dư 108.000; hủy bút toán và hóa đơn. Toàn bộ công ty/chứng từ thử đã rollback. Script tái lập: `apps/middleware-api/test-odoo-addon.py`, chạy qua `odoo shell` bên trong container.
- Seed nghiệp vụ chạy lần hai trả `ALREADY_SEEDED`.
- TypeScript/Vite production build thành công; Python addon kiểm tra cú pháp thành công.
- Kiểm thử file Excel xác minh ZIP/XLSX hợp lệ, Unicode, STT, tiền dạng số, tổng và style tiêu đề.
- Kiểm thử UI: INPUT với 2 × 100.000 và thuế 8% ra 16.000/216.000; lưu xong vẫn ở tab Chi.

Chạy lại từ thư mục gốc sau khi khởi động API thử riêng:

```powershell
$env:TEST_API_URL='http://127.0.0.1:3002/api'
$env:EXPECT_ODOO_OFFLINE='true'
npm run test:workflows
node test-export.mjs
```

`test-odoo-contract.js` và `test-registration-recovery.mjs` yêu cầu `DB_NAME=finworkshop_upgrade_test`. Kiểm thử Odoo thật dùng công ty tạm đã cấu hình VND và thuế trong transaction rollback. Công ty đang sử dụng vẫn cần cấu hình VND/thuế/tài khoản nêu trên trước khi đồng bộ và ghi sổ toàn bộ chứng từ thực tế.

## Căn cứ thuế và sổ kế toán

Giữ S1–S7 theo yêu cầu làm cấu trúc đối chiếu TT88. [TT152/2025/TT-BTC](https://xaydungchinhsach.chinhphu.vn/toan-van-thong-tu-152-2025-tt-bt-huong-dan-ke-toan-cho-cac-ho-kinh-doanh-ca-nhan-kinh-doanh-119260112105136458.htm) có hiệu lực từ 01/01/2026, thay TT88. Vì vậy giao diện không coi S1–S7 cũ là xác nhận tuân thủ hiện hành.

Thuế giảm theo [NĐ174/2025/NĐ-CP](https://congbao.chinhphu.vn/van-ban/nghi-dinh-so-174-2025-nd-cp-45374.htm) áp dụng có điều kiện và đến 31/12/2026; sản phẩm kim loại thuộc danh mục loại trừ không mặc định hưởng 8%. Các tỷ lệ HKD được lưu riêng GTGT/TNCN và cần đối chiếu [NĐ68/2026/NĐ-CP](https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/3/68-ndcp.signed.pdf), phương pháp và kỳ áp dụng. TaxRules mẫu mang trạng thái `REVIEW_REQUIRED`, có nguồn/ngày hiệu lực; không tự ghi đè các rule người dùng đã sửa.
