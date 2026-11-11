# Vòng 2 - kiểm thử sâu kho và vòng đời sản xuất

Phiên bản: `399cbdd`. API cô lập: `http://127.0.0.1:3002/api`; PostgreSQL riêng do điều phối viên chuẩn bị. Không sửa mã nguồn, không push, không sửa dữ liệu demo mặc định. Chỉ ghi fixture trong doanh nghiệp tự đăng ký có tên `QA2-DB-1794335962578`, ID `daf5e654-552f-4f71-bdd2-bb9fe05b8d5e`. Ngày nghiệp vụ `2026-11-11`; timestamp máy chủ UTC tại lúc chạy nằm trong `2026-11-10`. Báo cáo dưới đây nêu rõ cả hai khi có liên quan, không đánh đồng timestamp UTC và ngày nghiệp vụ.

Kết quả: **7 lỗi mới đã tái hiện bằng HTTP**, không trùng 20 lỗi vòng 1; 1 hành vi tách riêng để xác nhận yêu cầu. Script `round2-db-probes.mjs`, chứng cứ `round2-db-evidence.json`. Không ghi mật khẩu, bearer token vào JSON. `cases[n].requests` là đoạn chỉ số 0-based trong mảng `http`; mỗi phần tử có method/path/role/request/status/response. P1/P2 là mức ưu tiên đề xuất, không là tần suất lỗi.

## DB2-01 [P1] Hủy phiếu xuất đã cấu thành thành phẩm làm nhân đôi giá trị tồn

**Nguồn:** `apps/middleware-api/src/operations.js:183` (cancelStockMovement), `:190` (chỉ chặn hủy chính FINISHED_RECEIPT), `:194` (chỉ xét phát sinh sau trên cùng mặt hàng), `:198` (khôi phục tồn). Không xét lệnh của phiếu xuất đã COMPLETED và đã có finishedReceiptId.

**Cách tái hiện tối thiểu:**

1. Chủ xưởng tạo vật tư, ghi OPENING 10 kg x 1.000 đồng. Tạo sản phẩm và lệnh 1 thành phẩm.
2. POST `/production-orders/{job}/actions/start`.
3. POST `/stock-movements` `{type:"ISSUE",materialId,productionOrderId:job,quantity:2,date:"2026-11-11"}` -> 201.
4. Complete rồi receive-finished lệnh -> 200. Vật tư còn 8 kg/8.000 đồng; thành phẩm 1/2.000 đồng.
5. DELETE `/stock-movements/{issue}` `{reason:"QA2 kiểm tra hủy"}` -> **200**, status CANCELLED.
6. GET materials/products và `/reports/sme`: vật tư trở lại 10 kg/10.000 đồng, nhưng thành phẩm vẫn còn 1/2.000 đồng, lệnh vẫn COMPLETED/actualMaterialCost=2.000.

**Sai lệch:** tổng giá trị vật tư + thành phẩm tăng từ 10.000 lên **12.000**, không có mua hay sản xuất thêm. SME-GT của cùng lệnh lại tính materialCost=0, finishedValue=2.000. Phiếu nhập thành phẩm là mặt hàng khác nên không bị điều kiện "phát sinh sau cùng mặt hàng" bảo vệ.

**Kỳ vọng:** chặn hủy phiếu xuất đã được kết chuyển vào thành phẩm, hoặc yêu cầu quy trình đảo các phát sinh phụ thuộc; không hoàn nguyên vật tư mà giữ nguyên thành phẩm.

**Bằng chứng:** `cases[0]`, HTTP `[6..21]`.

## DB2-02 [P1] Phiếu nhập vật tư thường tự nhận là nhập thành phẩm và xóa WIP trên báo cáo

**Nguồn:** `apps/middleware-api/src/operations.js:175` lưu nguyên trường sourceProductionOrderId người gửi trong `{...data}`; `apps/middleware-api/src/sme-reports.js:54` cộng tất cả phiếu có sourceProductionOrderId, không giới hạn FINISHED_RECEIPT.

**Cách tái hiện:**

1. Tạo lệnh, start, xuất 2 kg vật tư x 1.000 đồng cho lệnh. SME-GT có materialCost=2.000, finishedValue=0, wip=2.000.
2. Đăng nhập WAREHOUSE. POST `/stock-movements` `{type:"RECEIPT",materialId,quantity:2,unitCost:1000,sourceProductionOrderId:job,date:"2026-11-11"}` -> **201**.
3. Lệnh vẫn IN_PROGRESS, không hề complete/nghiệm thu, không có thành phẩm. GET `/reports/sme`: finishedValue thành **2.000**, wip thành **0**.

**Sai lệch:** WIP 2.000 bị coi là đã nhập thành phẩm chỉ bởi trường tham chiếu tự gửi. Nhật ký của phiếu vừa tạo thực tế là Nợ152/Có3388 (nhập nguyên vật liệu), không phải Nợ155/Có154. SME-GT vì vậy mâu thuẫn với chính nhật ký kế toán.

**Kỳ vọng:** trường liên kết nghiệm thu chỉ do hệ thống sinh; báo cáo phải xác nhận đúng loại FINISHED_RECEIPT và đúng nguồn trước khi giảm WIP.

**Bằng chứng:** `cases[1]`, HTTP `[22..31]`.

## DB2-03 [P1] Ngày nhập thành phẩm và ngày ghi nhận chi phí máy không đồng nhất

**Nguồn:** `apps/middleware-api/src/operations.js:240` dùng timestamp hiện tại cho acceptedAt, `:241` dùng data.date cho phiếu nhập; `apps/middleware-api/src/sme-reports.js:56` ghi chi phí máy theo acceptedAt.slice(0,10), không theo ngày phiếu nhập.

**Cách tái hiện:**

1. Tạo lệnh 1 sản phẩm, plannedMachineCost=3.000, không phát sinh vật tư/nhân công. Start, complete.
2. POST `/production-orders/{job}/actions/receive-finished` `{date:"2026-10-31"}` -> **200**. Thành phẩm được nhập giá trị 3.000 vào 31/10, acceptedAt lại là timestamp UTC 10/11.
3. GET `/reports/sme?from=2026-01-01&to=2026-10-31`.

**Thực tế:** nhật ký đến 31/10 có Nợ155/Có154 = 3.000, nhưng chưa có Nợ154/Có3388 chi phí máy. Tài khoản154 có debit=0, credit=3.000, **net=-3.000**. SME-GT lại trả machineCost=3.000, finishedValue=3.000, wip=0 cho cùng kỳ. Một báo cáo đang sử dụng hai mốc ngày khác nhau cho cùng chi phí.

**Kỳ vọng:** hoặc từ chối nghiệm thu sai thứ tự ngày nghiệp vụ, hoặc hạch toán nguồn chi phí cùng ngày phù hợp với phiếu nhập. Không để nguyên chi phí có ở bảng giá thành nhưng vắng ở nhật ký trong cùng kỳ.

**Bằng chứng:** `cases[2]`, HTTP `[32..39]`. Đây không chỉ là khác biệt hiển thị múi giờ; phiếu 31/10 và nguồn chi phí 10/11 thực sự nằm hai kỳ khác nhau.

## DB2-04 [P2] BOM đã ngừng sử dụng vẫn được dùng để mở lệnh mới

**Nguồn:** `apps/middleware-api/src/server.js:963` dùng active(bom); `apps/middleware-api/src/accounting.js:3` định nghĩa active không loại INACTIVE. `apps/middleware-api/src/operations.js:71` có lưu trạng thái BOM.

**Cách tái hiện:**

1. Tạo sản phẩm, vật tư và BOM hợp lệ. PUT `/boms/{id}` `{status:"INACTIVE"}` -> 200.
2. POST `/production-orders` `{productId,bomId,quantity:1,date:"2026-11-11"}` -> **201**.
3. Lệnh mới có bản chụp BOM `status:"INACTIVE"`.

**Kỳ vọng:** BOM ngừng dùng không được dùng để mở lệnh mới. Không yêu cầu sửa các snapshot hợp lệ đã tạo trước khi BOM bị ngừng.

**Bằng chứng:** `cases[4]`, HTTP `[47..53]`.

## DB2-05 [P2] Mở lệnh mới cho sản phẩm INACTIVE, chỉ phát hiện lỗi ở nghiệm thu

**Nguồn:** `apps/middleware-api/src/server.js:962` chỉ kiểm tra sản phẩm tồn tại; `apps/middleware-api/src/operations.js:226` chuyển sang READY_FOR_RECEIPT theo productId; `:131` chặn mặt hàng INACTIVE khi ghi kho.

**Cách tái hiện:**

1. Tạo sản phẩm quản lý tồn kho `trackInventory:true,status:"INACTIVE"`.
2. POST `/production-orders` dùng productId này -> **201**. Start -> 200; complete -> 200, READY_FOR_RECEIPT.
3. Receive-finished -> **400**, lỗi "Chọn mặt hàng đang quản lý tồn kho."

**Kỳ vọng:** chặn sản phẩm ngừng hoạt động ngay khi lập lệnh mới, thay vì cho thực hiện sản xuất rồi tạo lệnh không nghiệm thu được. Đây là sản phẩm vật lý có quản lý tồn kho, không phải tình huống dịch vụ.

**Bằng chứng:** `cases[5]`, HTTP `[54..60]`.

## DB2-06 [P1] Sửa ghi chú đồng thời với Start có thể đưa lệnh trở lại DRAFT

**Nguồn:** `apps/middleware-api/src/server.js:1046` đọc before trước transaction, `:1051` ghép toàn bộ before vào value, `:1103` lưu toàn bộ snapshot cũ; `apps/middleware-api/src/operations.js:205` là luồng Start có khóa riêng. Khóa tại save không làm mới snapshot mà generic PUT đã đọc.

**Cách tái hiện:**

1. Tạo lệnh dịch vụ DRAFT. Dùng Promise.all gửi đồng thời:
   - POST `/production-orders/{id}/actions/start` `{}`;
   - 4 PUT `/production-orders/{id}` chỉ có `{note:"QA2-race-n"}`.
2. Start trả **200**, status IN_PROGRESS, có startedAt.
3. Cả 4 PUT cũng trả **200**. GET sau cùng trả **DRAFT**, không còn startedAt/stage đang sản xuất.

**Kết quả chạy:** tái hiện ngay lần đầu trong hai lần chạy fixture độc lập. Request PUT không hề gửi trường status, vẫn ghi đè trạng thái của một hành động đã thành công.

**Kỳ vọng:** metadata update không được đảo state machine; xử lý bản ghi hiện hành trong khóa/transaction hoặc báo xung đột snapshot. Không suy rộng các cuộc đua complete/receive khi chưa chạy; bằng chứng ở đây chỉ khẳng định Start bị đảo.

**Bằng chứng:** `cases[6]`, `attempts[0]`, HTTP `[61..67]`.

## DB2-07 [P1] Mở lại lệnh dịch vụ với ngày tương lai làm thay đổi giá vốn của kỳ đã khóa

**Nguồn:** `apps/middleware-api/src/operations.js:243` (reopen), `:249` chỉ kiểm tra ngày action mới; `apps/middleware-api/src/db.js:7` không đặt production-orders trong datedEntities; `apps/middleware-api/src/sme-reports.js:57`-`:58` dựng lại bút toán hoàn thành dựa vào trạng thái hiện tại, làm mất bút toán lịch sử khi lệnh bị mở lại.

**Cách tái hiện:**

1. Tạo lệnh dịch vụ không có productId. Xuất 2 kg x 1.000, complete. Báo cáo đến 11/11 có COGS=2.000, WIP của lệnh=0.
2. Tạo kỳ `startDate:"2026-11-10",endDate:"2026-11-11"` và lock -> 200/LOCKED. Khoảng này bao trùm cả ngày completedAt UTC 10/11 lẫn ngày nghiệp vụ xuất vật tư 11/11.
3. POST `/production-orders/{job}/actions/reopen` `{date:"2026-11-12",note:"QA2 kiểm tra"}` -> **200**. Không gọi unlock.
4. GET lại báo cáo cùng khoảng đến 11/11: COGS từ **2.000 thành 0**, operatingProfit tăng 2.000, WIP từ **0 thành 2.000**.

**Kỳ vọng:** kỳ đã khóa không bị thay số lịch sử. Nếu cho mở lại lệnh ở kỳ mới, phải bảo toàn bút toán hoàn thành cũ và thể hiện điều chỉnh ở kỳ mới, hoặc yêu cầu mở khóa kỳ cũ có lưu vết.

**Bằng chứng:** `cases[7]`, HTTP `[68..78]`; response lock trong mảng http xác nhận LOCKED. Trường period trong cases là response lúc tạo (OPEN), không phải trạng thái sau lock, nên cần xem đúng request lock.

## Tách riêng - cần xác nhận nghiệp vụ sản phẩm không quản lý kho

`cases[3]`, HTTP `[40..46]`: sản phẩm `trackInventory:false` vẫn mở được lệnh, complete chuyển READY_FOR_RECEIPT, receive trả400. Hành vi đã xác minh nhưng **không đếm là lỗi chắc chắn**: sản phẩm dịch vụ không nhập kho có thể là chủ đích. Cần xác định UI/đặc tả có yêu cầu hoàn thành loại lệnh này theo luồng dịch vụ (COMPLETED) hay không. Không dùng lỗi400 đơn lẻ để kết luận hệ thống sai.

## Giới hạn

- Không đánh giá tính hợp pháp thuế; chỉ đối chiếu nhất quán nghiệp vụ và dữ liệu.
- Hai ca hiện dùng HTTP gửi trường hệ thống có chủ ý (sourceProductionOrderId, action date) để kiểm tra API, không khẳng định UI có nút tương ứng.
- Ca race có thể phụ thuộc timing, nhưng đã thu được HTTP và snapshot cuối chứng minh một lần vi phạm thực tế; script thử tối đa15 lần, dừng ngay khi có bằng chứng.
- Không có sửa source, migration, cấu hình, Docker hoặc dữ liệu thật. Hai lần chạy chỉ tạo fixture trong hai workshop QA2 riêng.
