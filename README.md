# FinTax Automation · FinWorkshop

Ứng dụng quản trị tài chính và sản xuất xưởng: báo giá, định mức, kho, hóa đơn, thu chi, công nợ, đối soát và bảy sổ S1–S7. React/TypeScript ở frontend; Express và **PostgreSQL 15** ở middleware; Odoo 16 kết nối qua XML-RPC. Dự án không dùng MySQL.

## Khởi chạy

Cần Node.js 20+ và Docker Desktop đang chạy. Từ thư mục gốc:

```powershell
docker compose -f infrastructure/odoo-docker/docker-compose.yml up -d
# Chỉ sao chép khi chưa có cấu hình; giữ nguyên các file .env đang sử dụng.
if (!(Test-Path 'apps/middleware-api/.env')) { Copy-Item 'apps/middleware-api/.env.example' 'apps/middleware-api/.env' }
if (!(Test-Path 'apps/mock-tax-api/.env')) { Copy-Item 'apps/mock-tax-api/.env.example' 'apps/mock-tax-api/.env' }
if (!(Test-Path 'apps/web-client/.env.local')) { Copy-Item 'apps/web-client/.env.example' 'apps/web-client/.env.local' }
npm install
npm run dev
```

| Dịch vụ | Địa chỉ |
| --- | --- |
| Trang giới thiệu | http://localhost:5173/ |
| Không gian thao tác | http://localhost:5173/app |
| Đăng nhập | http://localhost:5173/login |
| API | http://localhost:3001/api/health |
| Mock Tax API | http://localhost:4000 |
| Odoo | http://localhost:8069 |
| PostgreSQL | 127.0.0.1:5433 |

`Run-FinWorkshop.bat` là lối khởi chạy Windows hiện có. Build giao diện bằng `npm run build`. Cấu hình SMTP/Odoo nằm trong `apps/middleware-api/.env`; URL API giao diện nằm trong `apps/web-client/.env.local`.

Compose hiện gắn database Odoo `fintax_clean` và addon tại `infrastructure/odoo-docker/extra-addons`. Điền đúng `ODOO_DB`, `ODOO_USERNAME`, `ODOO_PASSWORD` của database đã cài addon `fintax_bridge`; không ghi đè database Odoo đang dùng.

## Trang giới thiệu và ứng dụng

Trang `/` giới thiệu giải pháp cho HKD, SME và xưởng sản xuất với màu đỏ FinTax hiện có. Khách có thể khám phá phân hệ, mô hình kinh doanh, quy trình và FAQ; nút Demo/Đăng nhập đi tới `/login`. Sau đăng nhập, Dashboard ở `/app`; tài khoản Thợ về lệnh sản xuất được phân công. Các URL nghiệp vụ cũ vẫn hoạt động.

Landing dùng dữ liệu minh họa, không tải số liệu xưởng thật. Workspace và các thư viện biểu đồ/Excel được tải lười. [Prompt triển khai](docs/PROMPT-LANDING-ODOO-VND.md) và [hướng dẫn trang giới thiệu/VND](docs/LANDING-ODOO-VND.md).

## Dữ liệu và tài khoản trình diễn

Mật khẩu mặc định: **FinTax@2026**; có thể thay qua `DEMO_PASSWORD` trước khi tạo tài khoản lần đầu.

| Vai trò | Tài khoản có bộ dữ liệu 30 ngày |
| --- | --- |
| Chủ xưởng | owner.workflow@fintax.demo |
| Kế toán | accountant.workflow@fintax.demo |
| Thợ xưởng | workshop.workflow@fintax.demo |

Khi API khởi động, seed bổ sung 12 TaxRules, hơn 20 mặt hàng/vật tư/dịch vụ và một **xưởng Demo riêng**. Bộ Demo có 60 hóa đơn trong 30 ngày gần nhất, trên 40 giao dịch thu chi của chuỗi 30 ngày, phiếu tiền/phân bổ tương ứng, BOM, báo giá ở nhiều trạng thái, lệnh sản xuất, kho, giờ công và cảnh báo tồn thấp. Hóa đơn mẫu có bảng hàng hóa và lịch sử xử lý; các mã CQT trong Demo là giả lập.

Seed nhận diện mã chứng từ để chạy lặp an toàn, giữ số tiền/số dư đã có, không xóa dữ liệu cũ và bỏ qua ngày thuộc kỳ đã khóa. Ngày mới có thể bổ sung thêm dữ liệu Demo; đây không phải tác vụ xóa dữ liệu quá 30 ngày. Các hóa đơn Demo cũ chỉ được bổ sung bảng kê/lịch sử khi còn thiếu. Chạy riêng:

```powershell
npm run seed:workflows
```

Đặt `SEED_DEMO_DATA=false` để tắt tự nạp nghiệp vụ Demo. Danh mục thuế/mặt hàng mẫu vẫn được bổ sung theo mã cho các xưởng hiện có; quy tắc đã có không bị ghi đè. Ba tài khoản cũ `owner@fintax.demo`, `accountant@fintax.demo`, `warehouse@fintax.demo` được giữ ở xưởng mặc định; dữ liệu 30 ngày thuộc xưởng `.workflow` riêng.

## Giao diện và luồng sử dụng

Màu thương hiệu giữ đỏ FinTax `#A91517`, hover `#861116`, nền đỏ nhạt cho tab và liên kết đang chọn. Các màu xanh/vàng/đỏ của chỉ tiêu tài chính thể hiện trạng thái nghiệp vụ.

- Dashboard: chọn tháng/quý/khoảng ngày; sáu KPI, so kỳ trước, dòng tiền 7/14/30 ngày hoặc sáu tháng, cột thu/chi và đường số dư, cơ cấu chi phí, tuổi nợ, việc chờ xử lý, tiến độ và tồn kho. Nhãn tiền trên trục không bị lặp do làm tròn triệu.
- Chi tiết chứng từ: thông tin pháp lý, số tiền định dạng VNĐ, công nợ nổi bật, dòng hàng, phân bổ và timeline. Mã hồ sơ kỹ thuật chỉ còn tám ký tự tại footer, có nút sao chép; không hiển thị JSON thô.
- Danh sách: STT theo trang; tìm kiếm, lọc loại/trạng thái, sắp xếp; 10/20/50/100 dòng; xuất Excel theo bộ lọc. Bản ghi quá hạn/tồn thấp/chờ duyệt có cảnh báo màu.
- Hóa đơn mua vào: mở tab **Hóa đơn mua vào (Chi)**; chọn mặt hàng hoặc quy tắc thuế, nhập số lượng/đơn giá. Thuế và tổng tự tính; mở tùy chọn làm tròn tối đa ±5 đồng. Lưu xong giữ tab Chi, tăng phải trả NCC và ánh xạ Odoo `in_invoice`; hóa đơn bán ra tăng phải thu, ánh xạ `out_invoice`.
- Thanh toán: từ chi tiết hóa đơn chọn **Ghi nhận thanh toán**, hoặc tạo phiếu tại Thanh toán & công nợ rồi phân bổ. Tất toán = tiền phân bổ + chiết khấu thanh toán + làm tròn. Phí ngân hàng ghi thành khoản chi riêng, không trừ công nợ hai lần. Điều chỉnh cần lý do.
- Hủy hóa đơn đã thu/chi: **Gỡ phân bổ** để trả tiền về số dư chưa phân bổ, sau đó hủy với lý do. Chủ xưởng có thể xác nhận **Gỡ phân bổ & Hủy** trong cùng transaction. Gỡ không hủy phiếu tiền gốc; phí và bút toán gắn với phân bổ được đảo cùng lúc.
- Báo giá từ chối: **Tạo phiên bản mới** sao chép BOM, vật tư, nhân công, máy móc sang DRAFT v2/v3… và giữ lý do từ chối ở đầu form. Bản cũ được bảo toàn.
- Đăng ký khi Odoo offline: lưu tài khoản chờ duyệt và tác vụ bền vững trong `odoo_sync_jobs` trước khi gọi Odoo; không mất yêu cầu đăng ký. Tài khoản chỉ hoạt động sau khi được Chủ xưởng duyệt và đồng bộ thành công.
- Chứng từ đã ghi sổ dùng thao tác gỡ/hủy/điều chỉnh; không sửa trực tiếp số tiền của phiếu tiền, giao dịch, phiếu kho và phân bổ. Kỳ khóa chặn thay đổi, kể cả đổi ngày; mở lại cần lý do và audit.

Dashboard gom dữ liệu nghiệp vụ trong một query, dùng cache TTL 45 giây theo xưởng và bộ lọc; giao dịch ghi dữ liệu vô hiệu hóa cache. Các chỉ tiêu doanh thu/chi phí/thuế dùng cùng phép tổng hợp với S1/S3/S4, số dư quỹ/ngân hàng đối chiếu S6/S7. Công nợ dựa trên chứng từ và phân bổ hiện có; các sổ là tổng hợp trạng thái hồ sơ hiện tại, không phải cơ chế tái hiện mọi phiên bản lịch sử trước khi sửa/hủy.

## Odoo, đăng ký và email

Hàng đợi retry tách theo xưởng; xem tại **Cài đặt → Tích hợp**. Dashboard chỉ thử lại các tác vụ đang chờ; **Nạp & đồng bộ Odoo** trong Cài đặt còn đưa dữ liệu cũ chưa đồng bộ vào hàng đợi. Đặt `ODOO_SYNC_WORKER=false` khi cần tắt worker nền.

Addon `fintax_bridge` 16.0.1.3.0 hỗ trợ hóa đơn mua/bán, phiếu tiền, bút toán điều chỉnh, reconcile/unreconcile và hủy. Các chứng từ nháp cần được kiểm tra/ghi sổ tại Odoo trước khi reconcile. Bản ghi sai tiền tệ/thuế/tài khoản được giữ ở trạng thái chờ khớp danh mục, không tự chuyển số tiền VNĐ thành USD.

**Cập nhật tiền tệ ngày 27/10/2026:** đã kích hoạt VND và bảng giá VNĐ. Công ty có 14 bút toán đã ghi sổ, nên giữ USD làm tiền sổ cái theo chốt Odoo; chứng từ FinWorkshop vẫn lưu nguyên giá VND. Đã cấu hình **1 USD = 26.050 VND**, giá bán Vietcombank công bố ngày 27/10/2026, lưu nguồn/ngày/chiều giá và kiểm chứng quy đổi trong Odoo thật. Các bút toán cũ không đổi.

Chủ xưởng cập nhật tỷ giá tại **Cài đặt → Tích hợp → Tiền tệ & Tỷ giá VNĐ**. Thiếu tỷ giá đã xác minh đúng kỳ hoặc rate đã quá 7 ngày thì adapter giữ trạng thái cần cấu hình. Không tự áp tỷ giá hôm nay cho hóa đơn cũ. Thuế khớp, nghĩa vụ HKD và tài khoản điều chỉnh vẫn cần cấu hình riêng; xem [hướng dẫn VND](docs/LANDING-ODOO-VND.md).

Lệnh `npm run configure:odoo-vnd` chỉ đọc cấu hình; thêm `-- --apply` để cập nhật, có sao lưu trước thay đổi. Lệnh tự đọc `.env` middleware và chỉ cho Odoo local.

Khôi phục mật khẩu dùng Odoo và SMTP. Với Gmail, cấu hình Google App Password trong `SMTP_PASS` cùng `SMTP_USER`, `SMTP_HOST`, `SMTP_PORT`, `PASSWORD_RESET_FROM`. OTP có sáu số, dùng một lần, mặc định hết hạn sau 10 phút. Chỉ môi trường phát triển mới có mã hỗ trợ kiểm thử khi SMTP chưa gửi được. Không công khai `.env`, OTP hoặc thông tin đăng nhập.

## Kiểm thử

Chạy kiểm thử ghi dữ liệu trên database riêng, không dùng database đang nhập liệu. Ví dụ PowerShell tại thư mục gốc; giữ các biến DB/secret thực tế trong file `.env` đã có:

```powershell
$env:DOTENV_CONFIG_PATH="$PWD/apps/middleware-api/.env"
$env:DB_NAME='finworkshop_big_update_test'
$env:PORT='3002'
$env:ODOO_URL='http://127.0.0.1:8079' # cổng không chạy Odoo, thử fallback offline
$env:ODOO_SYNC_WORKER='false'
$env:WEB_ORIGIN='http://localhost:5174,http://127.0.0.1:5174'
node apps/middleware-api/src/server.js
```

Mở terminal thứ hai, đặt lại `DOTENV_CONFIG_PATH`, `DB_NAME` như trên rồi chạy:

```powershell
$env:TEST_API_URL='http://127.0.0.1:3002/api'
$env:EXPECT_ODOO_OFFLINE='true'
npm run test:workflows
# Chạy riêng khi API kiểm thử đã được khởi động ở cổng 3005 và dùng DB test riêng.
$env:TEST_API_URL='http://127.0.0.1:3005/api'
npm run test:review-fixes
npm run test:big-update
npm run test:export
npm run test:currency
npm run build
```

- `test-workflows.js`: 15 nhóm tích hợp, gồm RBAC, INPUT, thanh toán/chênh lệch, gỡ/hủy, báo giá, kho/giờ công, sao kê/đối soát, kỳ khóa và offline registration.
- `test-review-fixes.js`: 18 nhóm kiểm tra cho đăng ký/tách workspace, phân quyền, nhập xuất kho, giá vốn/WIP/COGS, công nợ, thuế và cách ly dữ liệu; chỉ chạy với API kiểm thử riêng ở cổng 3005.
- `test-big-update.js`: seed 30 ngày chạy lặp, bảng kê/lịch sử, đối chiếu Dashboard với sổ và công nợ, HKD không cộng TNCN hai lần, VAT/HKD hỗn hợp, nhãn trục tiền, ngày không phát sinh, chi tiết và cách ly xưởng/quyền thợ.
- `test-export.mjs`: XLSX thực, Unicode, STT, dữ liệu tiền dạng số, tổng và style.
- `test-odoo-contract.js`, `test-registration-recovery.mjs`: dùng database riêng `finworkshop_upgrade_test` theo chốt an toàn của script. `test-odoo-addon.py` chạy trong Odoo shell, tạo công ty thử và rollback toàn bộ.

Kết quả bàn giao và phạm vi kiểm tra trình duyệt: [BIG-UPDATE-2026-10.md](docs/BIG-UPDATE-2026-10.md). Kiểm thử đạt trong các kịch bản được ghi nhận; không coi đó là bảo đảm mọi tình huống thực tế đã được chứng minh.

## Thuế và phạm vi sử dụng

S1–S7 được giữ theo cấu trúc TT88 mà đồ án yêu cầu. [Thông tư 152/2025/TT-BTC](https://xaydungchinhsach.chinhphu.vn/toan-van-thong-tu-152-2025-tt-bt-huong-dan-ke-toan-cho-cac-ho-kinh-doanh-ca-nhan-kinh-doanh-119260112105136458.htm) đã có hiệu lực từ 01/01/2026; cần đối chiếu chế độ hiện hành trước khi dùng hồ sơ thực tế. TaxRules là dữ liệu cấu hình có ngày hiệu lực, nguồn và trạng thái rà soát; không phải kết luận thuế áp dụng tự động cho mọi sản phẩm.

[Nghị định 174/2025/NĐ-CP](https://congbao.chinhphu.vn/van-ban/nghi-dinh-so-174-2025-nd-cp-45374.htm) giảm thuế theo điều kiện và nhóm loại trừ. Thép/inox/sản phẩm kim loại không mặc định 8%. Thuế HKD tách GTGT/TNCN và cần rà soát theo kỳ/phương pháp; xem thêm nguồn trong hướng dẫn kế kiểm. Thuế đầu vào chỉ khấu trừ khi hóa đơn đã được đánh dấu đủ điều kiện.

Mã CQT, dữ liệu và tài khoản Demo phục vụ kiểm thử. Chưa tích hợp ký số, phát hành hóa đơn thật, nộp thuế, ngân hàng trực tiếp hoặc OCR tự động.

## Tổ chức và dọn dẹp

- `apps/web-client/src`: Dashboard, chứng từ, bảng/form dùng chung và quy tắc trình bày tiếng Việt.
- `apps/middleware-api/src`: API, nghiệp vụ, PostgreSQL, seed và Odoo adapter.
- `docs`: giữ các hướng dẫn, workflow và file sao kê thử.
- `infrastructure`: Docker và addon Odoo.

Đã bỏ màn đăng nhập cũ không còn dùng, import/state dư, ba file giữ chỗ rỗng và bytecode Python bị theo dõi nhầm trong Git. Đã thêm quy tắc bỏ qua cache Python. File build/cache và kết quả test là dữ liệu sinh lại; `.gitignore` đã loại khỏi Git. Không xóa `backup`, `.grapuco`, file hướng dẫn, `.env`, uploads hoặc dữ liệu người dùng. Bản cập nhật được giữ cục bộ; **chưa commit hoặc push GitHub**.
