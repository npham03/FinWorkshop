# Báo cáo kiểm thử FinWorkshop

Ngày thực hiện: 11/11/2026, múi giờ Việt Nam.

## 1. Phiên bản, môi trường và nguyên tắc

- Repo: https://github.com/npham03/FinWorkshop ; nhánh main.
- Commit kiểm thử: `399cbddfa0be540a80a3facc1c6ef0569e695068`, commit cuối khi tải: 10/11/2026 19:47:23 +07:00. Đã đối chiếu HEAD với main trên GitHub trước khi chạy.
- Bản tải riêng: `C:/Users/ASUS TUF/Downloads/FinWorkshop-QA-20261111`.
- Node.js 24.18.0; React/Vite; PostgreSQL 15 và Odoo 16 trên Docker; trình duyệt Microsoft Edge qua Playwright.
- API offline có chủ đích: localhost:3005 và localhost:3002; giao diện: http://127.0.0.1:5184 ; PostgreSQL QA: 5445. API tích hợp Odoo thật: localhost:3006; Odoo QA: 8079.
- Chỉ dùng database/container/workshop kiểm thử riêng. Không dùng database xưởng đang nhập liệu, không đụng các container FinTax cũ, không sửa source, không commit/push, không phát hành hóa đơn hoặc gửi tiền thật.
- P1: ưu tiên sửa trước vì có thể làm sai hoặc mất tính toàn vẹn dữ liệu nghiệp vụ. P2: chức năng/validation không đúng. P3: bất tiện giao diện. Đây là mức ưu tiên đề xuất, không phải ước lượng tần suất ngoài thực tế.

Kết luận: đăng nhập và nhiều luồng chính hoạt động, nhưng chưa nên xem bản này là đã sẵn sàng dùng dữ liệu xưởng thật. Có **20 lỗi ứng dụng/cài đặt đã tái hiện**, **4 vấn đề trong bộ kiểm thử**, và **3 hành vi cần chốt yêu cầu**. Không tính trường hợp môi trường thiếu SMTP/tỷ giá là lỗi ứng dụng. Không tuyên bố đã kiểm chứng mọi tổ hợp dữ liệu, mọi trình duyệt hoặc tuân thủ pháp lý.

## 2. Phạm vi và kết quả đạt

| Nhóm | Đã thực hiện | Kết quả |
|---|---|---|
| Tải/build | Clone main, đối chiếu SHA; cài dependency không cập nhật lock; build TypeScript/Vite | Build đạt; npm ci lỗi như FW-20 |
| Đăng nhập | Đăng nhập đúng/sai; OWNER, ACCOUNTANT, WORKSHOP, WAREHOUSE; không token; truy cập sai quyền | Các ca đã chạy đạt; không thấy người không có quyền mở được phân hệ tài chính trong sweep |
| Duyệt chức năng | 13 phân hệ x 4 vai trò = 52 lượt kiểm tra route; thêm form và hành động trọng điểm | Không có page error JavaScript trong sweep; lỗi tương tác ở FW-06, FW-16..19 |
| Màn hình nhỏ | 390px: Dashboard, hóa đơn, xưởng, cài đặt | Không tràn ngang toàn trang ở bốn màn đã kiểm tra |
| Bộ review hiện có | 18 nhóm: phân quyền, lời mời dùng một lần, workspace, nhập kho, xuất/trả, công, nghiệm thu, giá vốn, công nợ, trùng số chứng từ, phương pháp thuế cấu hình | 18/18 đạt |
| Bộ workflow hiện có | Hóa đơn mua/bán, phân bổ, chiết khấu/làm tròn/phí, gỡ/hủy, báo giá phiên bản, kho/công, sao kê, đối soát, kỳ khóa, đăng ký khi ERP offline | 14/15 đạt; ca còn lại có kỳ vọng sai về ngày tháng, xem TEST-01 |
| Cache Dashboard | Tạo thu 100 đồng hôm nay; kiểm tra lại Dashboard. Tạo thu tháng 10; so sánh bộ lọc tháng 10/tháng 11 | Đạt; không kết luận lỗi cache |
| Xuất Excel thật | Bấm xuất trên Khách hàng, Hóa đơn, Báo cáo; tải và đọc XLSX | 3/3 đạt; file báo cáo có 6 sheet. Không nhầm lỗi test-export với lỗi tải Excel |
| Odoo thật qua API | Đăng ký workspace, đồng bộ tài khoản, đăng nhập, kiểm tra kết nối, tạo công ty riêng, chạy queue, yêu cầu OTP, OTP sai, OTP đúng/reset, OTP dùng lại | 8 nhóm đạt; SMTP không cấu hình nên OTP phát triển chỉ được dùng trong test, không ghi mã vào báo cáo |
| Addon Odoo thật | Hóa đơn mua đã ghi sổ -> phiếu chi -> bút toán cân bằng -> phân bổ -> retry -> gỡ phân bổ -> hủy bút toán/hóa đơn | Đạt; transaction kiểm thử đã rollback |
| Tỷ giá | Chạy test nguồn/ngày/chiều quy đổi, rate sai/hết hạn | Đạt trong các ca unit đã chạy |

13 phân hệ đã mở: Bàn làm việc; Thu chi; Ai nợ ai; Khớp ngân hàng; Hóa đơn; Thuế & 7 Sổ sách; Báo giá; Sản phẩm & vật tư; Việc làm trong xưởng; Quản lý kho; Khách hàng; Người bán/NCC; Cài đặt.

## 3. Danh sách lỗi cần sửa

Tất cả bước bên dưới phải thực hiện trên workshop QA mới, không thử trực tiếp vào chứng từ xưởng thật. Endpoint viết tắt đều có tiền tố `/api`; request cần token của đúng vai trò.

### FW-01 [P1] Tạo hóa đơn có thể ghi đè hóa đơn đã thanh toán

- Bước: tạo hóa đơn bán ra 1.000; tạo phiếu thu và phân bổ đủ 1.000; POST `/invoices` với `id` bằng ID hóa đơn cũ, mã mới và tổng 2.000.
- Thực tế: HTTP 201, trả lại cùng ID; hóa đơn cũ bị thay nội dung, paidAmount từ 1.000 về 0, openBalance từ 0 thành 2.000; phân bổ cũ vẫn tồn tại.
- Kỳ vọng: POST chỉ tạo mới, không upsert hóa đơn bằng ID do client gửi; không đi vòng qua hạn chế sửa chứng từ đã thanh toán.
- Nguồn: `server.js:952`; `db.js:389,416`. Đã chứng minh trong cùng workshop, không khẳng định ghi đè chéo xưởng.
- Kiểm tra lại: POST ID cũ phải bị từ chối hoặc sinh ID mới; hóa đơn và phân bổ ban đầu không đổi.

### FW-02 [P1] Sửa số dư tài khoản trực tiếp, không có giao dịch

- Bước: PUT `/cash-accounts/{id}` với `{"balance":9876543}`.
- Thực tế: HTTP 200; số dư 1.001.311 thành 9.876.543, openingBalance vẫn 1.000.000; không có giao dịch đối ứng.
- Kỳ vọng: số dư phát sinh phải do số đầu kỳ và giao dịch/điều chỉnh hợp lệ tạo ra, không nhận trực tiếp từ form danh mục.
- Nguồn: `server.js:1052,1082`; `operations.js:21`.
- Kiểm tra lại: sửa tên tài khoản được phép; sửa riêng balance bị chặn; mọi thay đổi số tiền đều có chứng từ và audit.

### FW-03 [P1] Xuất kho làm giá trị tồn âm dù còn hàng

- Bước: vật tư tồn đầu 10 đơn vị x 1 đồng; nhập 1 đơn vị x 7 đồng; sau đó xuất điều chỉnh 10 đơn vị với lý do.
- Thực tế: trước xuất tồn 11, giá trị 17, đơn giá làm tròn 2; API ghi xuất 20, còn 1 nhưng giá trị và đơn giá đều -3.
- Kỳ vọng: tính giá xuất từ bình quân chưa làm tròn; ví dụ nếu làm tròn theo từng bút toán thì xuất round(10 x 17/11)=15, còn giá trị 2. Không cho giá trị tồn âm do làm tròn.
- Nguồn: `operations.js:172,176`. Đây là ca biên giá nhỏ để tái hiện rõ lỗi số học.

### FW-04 [P1] Đổi đơn giá danh mục làm thay giá vốn của hàng đang tồn

- Bước: tồn đầu 10 kg x 1.000=10.000; PUT vật tư `unitCost:9000`; xuất 1 kg.
- Thực tế: HTTP 200/201; giá xuất 9.000, còn 9 kg nhưng giá trị chỉ 1.000.
- Kỳ vọng: giá vốn bình quân vẫn 1.000/kg, giá trị còn 9.000. Nếu cần điều chỉnh giá trị tồn phải có nghiệp vụ riêng.
- Nguồn: `operations.js:35,38,144,172`.

### FW-05 [P1] Báo giá sản phẩm B dùng BOM của A và chuyển được thành lệnh

- Bước: tạo sản phẩm A/B, BOM của A; tạo báo giá productId=B nhưng bomId=BOM_A; gửi duyệt -> duyệt -> gửi khách -> chấp nhận -> tạo sản xuất.
- Thực tế: tạo báo giá HTTP 201; các bước sau thành công; lệnh có sản phẩm B và BOM thuộc A.
- Kỳ vọng: kiểm tra BOM thuộc sản phẩm ở cả báo giá và bước chuyển lệnh, giống luồng tạo lệnh trực tiếp.
- Nguồn: `operations.js:77,82`; `server.js:1215`.

### FW-06 [P1] Chọn lệnh B trong phiếu lấy vật tư nhưng lưu vào lệnh A

- Bước UI: mở lệnh A -> Lấy vật tư -> đổi dropdown Việc làm sang B -> chọn vật tư và lưu.
- Thực tế: HTTP 201, request gửi và bản ghi lưu đều là ID A; người dùng nhìn thấy đang chọn B.
- Kỳ vọng: lưu đúng B hoặc khóa dropdown khi phiếu bắt buộc thuộc A; không âm thầm đổi đối tượng.
- Nguồn: `apps/web-client/src/pages.tsx:194`; `BusinessForms.tsx:64`.
- Bằng chứng: [ảnh trước lưu](screenshots/bug-stock-job-B-before-save.png), `ui-deep-qa.json` có cả ID chọn, ID gửi và ID lưu.

### FW-07 [P2] Ngày không tồn tại vẫn được lưu

- Bước: tạo hóa đơn với `date:"2026-10-32"` hoặc `"not-a-date"`; tạo kỳ từ 30/02/2027 đến 31/02/2027.
- Thực tế: đều HTTP 201 và lưu nguyên ngày sai. Đối chứng ngày thật 27/10 thuộc kỳ khóa trả 409 đúng.
- Kỳ vọng: kiểm tra ngày lịch hợp lệ trước khi lưu/so kỳ khóa/lập báo cáo, không chỉ kiểm tra chuỗi hoặc regex.
- Nguồn: `server.js:967-968`; `db.js:448-453`.
- Không mô tả ca này là thay đổi được ngày thật trong kỳ khóa; lỗi đã chứng minh là nhận ngày vô nghĩa.

### FW-08 [P2] Tài khoản đã ngừng sử dụng vẫn nhận thanh toán mới

- Bước: tạo tài khoản số dư 1.000 -> INACTIVE -> POST payment nhận 222 vào tài khoản đó.
- Thực tế: HTTP 201, số dư tăng 1.222 dù vẫn INACTIVE.
- Kỳ vọng: chặn giao dịch mới vào tài khoản ngừng sử dụng, giữ nguyên lịch sử.
- Nguồn: `server.js:1006-1008`.

### FW-09 [P2] Phiếu thanh toán chấp nhận đối tác không tồn tại

- Bước: POST payment với counterpartyId=`nonexistent-qa-customer`, amount=111, tài khoản hợp lệ.
- Thực tế: HTTP 201, lưu ID không có thật và tạo luồng tiền.
- Kỳ vọng: kiểm tra đối tác, loại khách/NCC, trạng thái và workshop.
- Nguồn: `server.js:1005-1014`.

### FW-10 [P2] Quy tắc trùng số hóa đơn không thống nhất khi tạo và sửa

- Bước: tạo hai hóa đơn mua cùng số nhưng khác nhà cung cấp; sau đó sửa ghi chú hóa đơn thứ nhất.
- Thực tế: hai lần tạo đều 201; sửa ghi chú lại 409 “Số hóa đơn đã được sử dụng”.
- Kỳ vọng: dùng cùng khóa nghiệp vụ hướng hóa đơn/đối tác/ký hiệu/số ở cả tạo và sửa, loại trừ chính bản ghi đang sửa.
- Nguồn: `server.js:1075`; `db.js:394-402`.

### FW-11 [P2] Đổi mật khẩu không kiểm tra cùng chính sách với đăng ký/reset

- Bước: đổi mật khẩu thành 8 ký tự; tiếp tục thử mật khẩu ASCII dài 73 byte.
- Thực tế: đều HTTP 200; mật khẩu dài 73 byte và tiền tố 72 byte của nó đều đăng nhập được do bcrypt cắt phần vượt giới hạn.
- Kỳ vọng: thống nhất tối thiểu 10 ký tự/tối đa 72 byte UTF-8 như đăng ký và reset; không nhận mật khẩu mà một phần bị bỏ qua.
- Nguồn: `server.js:642,652`, đối chiếu `:510,605`.
- Không ghi mật khẩu hoặc bearer token thực vào báo cáo.

### FW-12 [P2] Đổi số lượng lệnh không tính lại chi phí kế hoạch

- Bước: BOM 2 giờ và 10.000 tiền máy cho 1 thành phẩm; tạo lệnh 1; PUT quantity=10.
- Thực tế: HTTP 200, plannedLaborHours vẫn 2 và plannedMachineCost vẫn 10.000.
- Kỳ vọng: 20 giờ và 100.000, hoặc yêu cầu xác nhận lại kế hoạch trước khi cho tiếp tục.
- Nguồn: `server.js:1055`. Gửi lại bomId mới kích hoạt tính lại là điều kiện ngầm mà người dùng không nên phải biết.

### FW-13 [P2] Bỏ số lượng khi tạo lệnh tạo dữ liệu tự mâu thuẫn

- Bước: POST lệnh có productId và BOM 2 giờ/10.000, không gửi quantity.
- Thực tế: HTTP 201, quantity mặc định 1 nhưng plannedLaborHours và plannedMachineCost đều 0.
- Kỳ vọng: cùng dùng số lượng mặc định 1 trong tính kế hoạch, hoặc yêu cầu nhập số lượng.
- Nguồn: `server.js:963-964`.

### FW-14 [P2] Sửa lệnh về số lượng 0 vẫn thành công

- Bước: tạo lệnh quantity=1; PUT quantity=0.
- Thực tế: HTTP 200 và lưu 0; nghiệm thu mới phát hiện muộn.
- Kỳ vọng: trả 400 ngay khi sửa, giống quy tắc khi tạo.
- Nguồn: `server.js:1053`, đối chiếu `:964`.

### FW-15 [P2] Giao lệnh cho ID người phụ trách không tồn tại

- Bước: sửa assignedTo thành `00000000-0000-0000-0000-000000000000`.
- Thực tế: HTTP 200; lệnh lưu người phụ trách không có thật.
- Kỳ vọng: phải là người đang hoạt động thuộc workshop; dùng cùng kiểm tra của bước tạo lệnh.
- Nguồn: `server.js:1053`, đối chiếu `:961`.

### FW-16 [P2] Chủ xưởng không có nút gửi duyệt báo giá nháp

- Bước: đăng nhập OWNER -> Báo giá -> mở báo giá DRAFT.
- Thực tế: có Chi tiết, Excel, PDF/In, Sửa, Hủy nhưng không có Gửi duyệt; không đi tiếp chuỗi duyệt bằng UI dù API cho phép.
- Kỳ vọng: OWNER tự thực hiện được bước gửi duyệt hoặc có cơ chế tự duyệt rõ ràng.
- Nguồn: `apps/web-client/src/pages.tsx:134`; đối chiếu `server.js:959,1206`. Chi tiết: [ui-findings.md](ui-findings.md).
- Bằng chứng: [ảnh báo giá nháp](screenshots/bug-owner-draft-no-submit.png).

### FW-17 [P2] Chọn “Không dùng công thức” nhưng báo giá vẫn giữ BOM/giá cũ

- Bước: tạo báo giá -> chọn BOM -> đổi sang Không dùng công thức.
- Thực tế: vẫn hiện vật tư BOM; giá gợi ý 341.250, khách trả 368.550 không đổi. Probe API cũng xác nhận bomId rỗng nhưng snapshot BOM và chi phí cũ vẫn được lưu.
- Kỳ vọng: xóa snapshot/chi phí kế thừa và tính lại hoặc yêu cầu người dùng xác nhận dữ liệu nhập tay.
- Nguồn: `BusinessForms.tsx:43-44`; `operations.js:75-101`.
- Bằng chứng: [ảnh BOM đã bỏ chọn](screenshots/bug-bom-cleared.png).

### FW-18 [P2] Tìm kiếm toàn cục không áp dụng khi đang ở trang Thu chi

- Bước: tại /transactions, tìm từ khóa chắc chắn không tồn tại bằng thanh tìm kiếm trên cùng.
- Thực tế: URL có `?q=UI-QA-NOT-EXISTS-815799` nhưng bảng vẫn 10 dòng, ô lọc bảng rỗng.
- Kỳ vọng: đồng bộ từ khóa URL với dữ liệu và ô tìm kiếm, trả danh sách rỗng.
- Nguồn: `apps/web-client/src/Portal.tsx:183`; `DataTable.tsx:42`. Chi tiết: [ui-findings.md](ui-findings.md).
- Bằng chứng: [ảnh tìm kiếm](screenshots/bug-global-search-same-route.png).

### FW-19 [P3] Form quảng cáo phím ESC nhưng không đóng

- Bước: Khách hàng -> Thêm mới -> bấm Escape.
- Thực tế: drawer không đóng dù footer ghi ESC để đóng.
- Kỳ vọng: thực hiện đúng phím tắt hoặc sửa hướng dẫn; thống nhất với các form khác.
- Nguồn: `apps/web-client/src/components.tsx:91,165` (RecordModal), xem [ui-findings.md](ui-findings.md).
- Bằng chứng: [ảnh drawer](screenshots/bug-escape-customer.png).

### FW-20 [P2] Repo mới tải không cài được bằng npm ci

- Bước: clone commit trên -> `npm ci --no-audit --no-fund`.
- Thực tế: EUSAGE; lock thiếu swagger-ui-express@5.0.1, swagger-ui-dist@5.34.1, @scarf/scarf@1.4.0.
- Kỳ vọng: package.json và package-lock.json đồng bộ để cài tái lập được trên máy mới/CI.
- Để tiếp tục kiểm thử, chỉ cài cục bộ bằng `npm install --package-lock=false`; không sửa lock của bạn. Build sau đó thành công.
- Nguồn: `apps/middleware-api/package.json` và `package-lock.json`.

## 4. Vấn đề trong bộ kiểm thử, không nhầm thành lỗi ứng dụng

### TEST-01: ca cache dùng ngày cố định tháng 10

`test-workflows.js:162` ghi thu ngày 27/10/2026 nhưng yêu cầu Dashboard mặc định tháng hiện tại tăng 100. Ngày chạy là tháng 11 nên kỳ vọng này sai. Probe bổ sung chứng minh: giao dịch hôm nay làm Dashboard tăng 100; giao dịch tháng 10 tăng 100 trong bộ lọc tháng 10 và tăng 0 trong tháng 11. Sửa dữ liệu ngày/bộ lọc của test, không kết luận cache hỏng.

### TEST-02: so sánh hai cơ sở chi phí khác nhau

`test-big-update.js:46` dừng vì operatingCost 30.575.995 khác tổng S3 31.821.000. Đối chiếu cho thấy chênh 1.245.005 được giải thích bằng 1.345.000 nhân công vốn hóa WIP, 100.000 VAT không khấu trừ và 5 thu nhập tài chính. Cần chọn lại cơ sở kỳ vọng và thuyết minh S3/SME, không tự sửa số cho bằng nhau. Công nợ khách/NCC đã đối chiếu khớp trong demo đọc riêng.

### TEST-03: test xuất Excel lỗi sandbox VM

`test-export.mjs` dừng với `ReferenceError: require is not defined` vì module presentation đã import language mà VM giả lập không cung cấp require tương ứng. Xuất thật trên Edge ở Khách hàng/Hóa đơn/Báo cáo đều tải XLSX hợp lệ, lần lượt 18.153/33.584/70.804 byte. Sửa harness test, không quy thành nút xuất lỗi.

### TEST-04: test contract phụ thuộc fixture/ngày cũ

`test-odoo-contract.js` dùng cash-accounts của workshop mặc định nhưng database mới không có account, dừng ở dòng 51. Sau khi bổ sung riêng fixture test (không sửa script), test đi tiếp rồi dừng do báo giá không có ngày, dùng ngày hiện tại trong khi XML-RPC mock chỉ cho rate 27/10/2026. Cần self-contained fixture và ngày thống nhất. Chuỗi addon Odoo thật riêng đã đạt và rollback; không vì contract test lỗi mà kết luận addon không chạy.

## 5. Ba hành vi cần xác nhận yêu cầu

Không tính các mục này vào 20 lỗi chắc chắn:

1. **Quyền nghiệm thu và giá thành:** WAREHOUSE gửi machineCost=1.000.000 khi kế hoạch 1.000 vẫn được nhận; OWNER đọc thấy giá thành/tồn thành phẩm 1.000.000. Code ẩn chi phí ở phản hồi thủ kho nhưng nhận chi phí do thủ kho gửi. Nếu thủ kho chỉ nghiệm thu vật lý, cần chặn trường này; nếu có quyền tính giá thành phải mô tả rõ. `operations.js:14,229,235`.
2. **Lý do thiếu giờ công:** lệnh kế hoạch 8 giờ, ghi 0,01 giờ rồi hoàn thành body rỗng vẫn thành công. Cần chốt có bắt buộc giải trình chênh lệch hay chỉ yêu cầu đã ghi công. `operations.js:225`.
3. **Thu hồi phiên khi đổi/reset mật khẩu:** JWT cũ vẫn dùng được sau đổi mật khẩu. Cần chốt chính sách đăng xuất phiên cũ/tokenVersion; hiện chưa có yêu cầu để khẳng định vi phạm.

## 6. Thứ tự sửa và kiểm thử lại đề xuất

1. FW-01, FW-02: khóa đường ghi đè và can thiệp số tiền; thêm regression kiểm tra hóa đơn đã trả và mọi đường cập nhật tài khoản.
2. FW-03..06: tính giá vốn, ánh xạ BOM và đúng lệnh nhận vật tư; giữ phép tính tiền chính xác, đối chiếu tồn lượng/tồn giá trị/WIP/giá vốn.
3. FW-07..15: chuẩn hóa validation tạo/sửa và tham chiếu; thêm negative case ở cả UI/API.
4. FW-16..19: hoàn thiện đường đi của chủ xưởng, đồng bộ trạng thái form/tìm kiếm, ESC.
5. FW-20 và TEST-01..04: cài sạch, build, chạy lại test trên ngày khác, database rỗng; không phụ thuộc dữ liệu máy cũ.

Với mỗi lỗi, xác nhận sửa bằng cùng ca đã tái hiện + một ca hợp lệ + một ca sai liền kề. Không chỉ dựa vào status HTTP, phải đọc lại dữ liệu sau thao tác.

## 7. Bằng chứng và phần chưa kiểm chứng

- [API: request/response](api-candidate-evidence.json), [chi tiết API và dòng mã](api-findings.md).
- [Kho/sản xuất: request/response](stock-production-probes.json), [chi tiết và dòng mã](db-findings.md).
- [52 lượt route/role và mobile](ui-qa.json), [tương tác sâu](ui-deep-qa.json), [chi tiết UI](ui-findings.md).
- [Xuất Excel thật](ui-export-qa.json); file `export-customers.xlsx`, `export-invoices.xlsx`, `export-reports.xlsx`.
- [API Odoo thật và OTP](odoo-live.json). OTP đã bị loại khỏi evidence.
- [Đối chiếu công nợ/chi phí](dashboard-debt-readonly.json).
- Mọi ảnh nằm trong [thư mục screenshots](screenshots).

Chưa kiểm chứng: gửi/nhận Gmail thật; chữ ký số và hóa đơn thuế thật; kết nối ngân hàng thật; tỷ giá trực tuyến đang được áp dụng trong môi trường của bạn; tải lớn/soak test; mọi luồng PDF/In trên máy in; mọi viewport và mọi browser; trạng thái trên server triển khai thật. Một probe chọn trường đối tác bằng locator không hoàn thành, không được tính là lỗi ứng dụng. Các luồng còn ngoài bằng chứng trên phải kiểm thử bổ sung trước khi phát hành.

Đây là báo cáo lỗi để bạn tự sửa. Không có lỗi ứng dụng nào được tự sửa trong phiên kiểm thử này.
