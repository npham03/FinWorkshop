# QA kho, giá thành và sản xuất - commit 399cbdd

Ngày kiểm tra: 11/11/2026. Không sửa mã nguồn. Chỉ tạo dữ liệu mang tiền tố QA-DB trong workshop mới trên API cô lập `http://127.0.0.1:3002/api`, không sửa dữ liệu demo mặc định. Odoo offline. Lần chạy cuối: `QA-DB-1794334037670`.

Chứng cứ: `stock-production-probes.json` lưu request/response đã loại token và mật khẩu. Các `cases[].requests` trỏ tới chỉ số phần tử trong mảng `http`. Script tái hiện: `stock-production-probes.mjs`. Tám lỗi chính dưới đây đã tái hiện qua HTTP. Mục 9 là hành vi đã xác minh nhưng yêu cầu lý do thiếu giờ công cần xác nhận riêng; không tính là lỗi chắc chắn. Kỳ vọng phân quyền ở mục 3 dựa trên chủ đích redaction chi phí hiện có.

## 1. Giá trị tồn âm dù số lượng còn dương - P1

- Nguồn: `apps/middleware-api/src/operations.js:172`, `:176`.
- Tạo vật tư; OPENING 10 đơn vị x 1 đồng; RECEIPT 1 đơn vị x 7 đồng. Sau nhập: tồn 11, giá trị 17, đơn giá làm tròn thành 2.
- POST `/stock-movements`: `{type:"ADJUST_OUT",materialId,quantity:10,date:"2026-11-11",reason:"QA"}` trả 201.
- Thực tế: ghi xuất 20 đồng, tồn 1, giá trị -3, đơn giá -3. Không được phép tồn kho có giá trị âm như vậy.
- Kỳ vọng nếu làm tròn đến đồng ở bút toán: xuất round(10 x 17/11) = 15; giá trị còn 2. Không dùng đơn giá bình quân đã làm tròn để tính xuất.
- Test hiện có chỉ xuất giá đồng nhất hoặc xuất toàn bộ nên không bắt được.

## 2. Sửa đơn giá danh mục làm sai giá vốn xuất của hàng đang tồn - P1

- Nguồn: `apps/middleware-api/src/operations.js:35`, `:38`, `:144`, `:172`.
- OPENING 10 kg x 1.000 = 10.000; PUT `/materials/{id}` `{unitCost:9000}` trả 200, giá trị tồn vẫn 10.000.
- ADJUST_OUT 1 kg trả 201, ghi xuất 9.000; còn 9 kg nhưng giá trị chỉ 1.000.
- Kỳ vọng giá xuất bình quân dựa vào 10.000/10 = 1.000, giá trị còn 9.000. Đơn giá tham khảo mới không được sửa ngược giá vốn đã tồn.

## 3. Thủ kho có thể tự đặt chi phí tài chính khi nghiệm thu - P1 nếu chính sách cấm thủ kho điều chỉnh giá thành

- Nguồn: `apps/middleware-api/src/operations.js:14`, `:229`, `:235`.
- Lệnh 1 thành phẩm có plannedMachineCost 1.000. Thợ start, complete.
- Đăng nhập WAREHOUSE, POST `/production-orders/{id}/actions/receive-finished` `{date:"2026-11-11",machineCost:1000000}` trả 200.
- Đọc lại bằng OWNER: actualMachineCost = totalCost = stockValue thành phẩm = 1.000.000.
- API ẩn chi phí khỏi phản hồi thủ kho nhưng vẫn nhận trường chi phí do thủ kho tự gửi. Cần thống nhất chính sách: nghiệm thu vật lý không đồng nghĩa được quyền điều chỉnh giá thành. Hành vi đã xác minh; mức quyền kỳ vọng cần chủ sản phẩm xác nhận.

## 4. Báo giá gắn BOM của sản phẩm khác và chuyển được thành lệnh sai BOM - P1

- Nguồn: `apps/middleware-api/src/operations.js:77`, `:82`; `apps/middleware-api/src/server.js:1215`.
- Tạo sản phẩm A và B; BOM có productId=A.
- POST `/quotations` `{title:B.name,productId:B.id,bomId:BOM_A.id,quantity:1,unitPrice:1000000,date}` trả 201.
- Thực hiện submit-for-approval, approve, mark-sent, accept, create-production: đều thành công.
- Lệnh sinh ra có productId=B nhưng bom.productId=A. Định mức vật tư/nhân công của A được dùng để sản xuất B.
- Kỳ vọng từ chối ngay khi tạo/sửa báo giá hoặc chuyển lệnh. Luồng tạo lệnh trực tiếp đã có kiểm tra này, luồng qua báo giá chưa có.

## 5. Đổi số lượng lệnh nháp không nhân lại giờ công/chi phí máy kế hoạch - P1/P2

- Nguồn: `apps/middleware-api/src/server.js:1055`.
- BOM cho 1 thành phẩm: laborHours=2, machineCost=10.000. Tạo lệnh quantity=1.
- PUT `/production-orders/{id}` `{quantity:10}` trả 200.
- Thực tế plannedLaborHours vẫn 2; plannedMachineCost vẫn 10.000. Kỳ vọng 20 giờ và 100.000.
- Chỉ khi gửi lại bomId cùng request API mới tính lại. UI/API không nên yêu cầu người dùng biết điều kiện ngầm này; chi phí máy sai tiếp tục đi vào giá thành nghiệm thu.

## 6. Tạo lệnh mặc định số lượng 1 nhưng tính kế hoạch theo số lượng 0 - P2

- Nguồn: `apps/middleware-api/src/server.js:963`, `:964`.
- Dùng BOM 2 giờ và 10.000 chi phí máy; POST lệnh chỉ gửi productId, bomId, date, không gửi quantity.
- API trả 201 với quantity=1 nhưng plannedLaborHours=0, plannedMachineCost=0. Kỳ vọng 2 và 10.000, hoặc yêu cầu nhập số lượng thay vì nhận một lệnh có dữ liệu tự mâu thuẫn.

## 7. Sửa lệnh nháp về số lượng 0 vẫn thành công - P2

- Nguồn: `apps/middleware-api/src/server.js:1053` đối chiếu kiểm tra khi tạo tại `:964`; chặn nghiệm thu muộn tại `apps/middleware-api/src/operations.js:237`.
- Tạo lệnh quantity=1 rồi PUT `{quantity:0}` trả 200 và lưu quantity=0.
- Kỳ vọng 400 ngay tại cập nhật, giống khi tạo. Hiện lỗi chỉ bị phát hiện muộn khi nghiệm thu.

## 8. Sửa người phụ trách sang ID không tồn tại vẫn thành công - P2

- Nguồn: `apps/middleware-api/src/server.js:1053`; thiếu kiểm tra đã có ở POST `:961`.
- Tạo lệnh giao thợ thật; PUT `{assignedTo:"00000000-0000-0000-0000-000000000000"}` trả 200.
- Kỳ vọng từ chối. Lệnh bị giao cho một người không tồn tại, không thợ nào có thể truy cập/thực hiện theo cơ chế lọc assignedTo.

## 9. Ghi 0,01 giờ là bỏ qua kiểm tra thiếu 8 giờ kế hoạch - P2, cần xác nhận chính sách

- Nguồn: `apps/middleware-api/src/operations.js:225`.
- Tạo lệnh dịch vụ plannedLaborHours=8; thợ start; ghi labor-log hours=0.01; complete với body rỗng trả 200, trạng thái COMPLETED, completionNote rỗng.
- Code chỉ kiểm tra có bất kỳ bản ghi giờ công nào hay không, không so tổng giờ thực tế với kế hoạch.
- Kỳ vọng theo thông báo lỗi hiện có: thiếu định mức thì phải nhập lý do. Nếu quy định chỉ yêu cầu đã có ghi công, đây là yêu cầu chưa rõ chứ không khẳng định bug nghiệp vụ.

## Đối chiếu khoản lệch trong test-big-update.js

Không phát hiện lệch công nợ trên demo gốc: receivable 35.519.700 khớp tổng khách hàng, tổng hóa đơn phải thu và phân bổ; payable 26.702.400 cũng khớp. Chỉ đọc dữ liệu.

Lỗi test tại `apps/middleware-api/test-big-update.js:46` so sánh hai cơ sở khác nhau:

- S3-HKD = 31.821.000 = hóa đơn đầu vào chưa VAT 30.475.000 + nhân công 1.345.000 + phí ngân hàng 1.000.
- Dashboard/SME operatingCost = 30.575.995 = 30.475.000 + VAT không khấu trừ 100.000 + phí 1.000 - thu nhập tài chính 5.
- Nhân công 1.345.000 đang vốn hóa vào 154/WIP, chưa là chi phí hoạt động642. Chênh lệch đúng 1.245.005 = 1.345.000 - 100.000 + 5.

Không kết luận đây là bug công nợ hay mất tiền. Đây là test oracle không phù hợp/thiếu thuyết minh cơ sở số liệu giữa S3 và báo cáo SME. Dữ liệu chi tiết trong `dashboard-debt-readonly.json`; nguồn tại `src/dashboard.js:38`, `src/sme-reports.js:34`, `:76`, `src/ledgers.js:32`.
