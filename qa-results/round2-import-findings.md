# Vòng 2: Nhập sao kê và bộ lọc báo cáo

Commit 399cbdd; 11/11/2026; API QA riêng 3006, workshop QA2-IMPORT. Không sửa source hoặc dữ liệu đang sử dụng. Script: round2-import-probes.mjs; dữ liệu HTTP đã loại credential: round2-import-evidence.json.

Hai probe đầu cùng một nguyên nhân xác định trùng, được gộp một phát hiện để không tăng số lỗi giả tạo.

## IMP-01 [P2] Bỏ nhầm giao dịch khác chiều hoặc khác tài khoản vì fingerprint thiếu khóa

Repro 1: XLSX có hai dòng cùng ngày/nội dung/1.000 đồng, dòng thứ nhất thu, dòng thứ hai chi; reference khác nhau. Preview đánh dấu dòng chi là trùng; commit mặc định chỉ tạo 1 thay vì 2.

Repro 2: nhập thu 700 vào ngân hàng A; nhập khoản thu cùng ngày/nội dung/700 nhưng reference khác vào ngân hàng B. Khoản của B bị bỏ là trùng.

Kỳ vọng: phân biệt ít nhất tài khoản, chiều giao dịch và định danh ngân hàng; không dùng fingerprint yếu để bác bỏ hai mã tham chiếu độc lập. Preview và commit phải dùng cùng định nghĩa. Nếu không đủ dữ liệu để quyết định thì cảnh báo cần rà soát, không kết luận chắc chắn là dòng trùng.

Nguồn: apps/middleware-api/src/server.js:1267-1269,1283-1285,1311.

Acceptance: cả hai ví dụ tạo đủ 2 giao dịch khi hợp lệ; nhập lại đúng cùng giao dịch trên cùng tài khoản vẫn bị nhận diện trùng. includeDuplicates không được là cách duy nhất cứu dòng hợp lệ đồng thời bỏ qua mọi chống trùng.

## IMP-02 [P2] Dòng có cả tiền vào và tiền ra vẫn được ghi nhận một phía

XLSX một dòng credit=2.000, debit=3.000. Preview trả errorCount=0, commit tạo 1 giao dịch INCOME 2.000. Giá trị debit bị bỏ mà không có thông báo.

Kỳ vọng: xác định dòng mâu thuẫn và yêu cầu sửa/tách, không tự chọn một chiều cho dữ liệu bất hợp lệ.

Nguồn: server.js:1274-1286.

Acceptance: hai cột cùng dương phải có lỗi theo dòng và không được ghi; một cột dương/cột còn lại trống hoặc 0 vẫn xử lý đúng.

## IMP-03 [P1] Số tiền dạng chuỗi thập phân bị nhân 100

XLSX giữ ô dạng chuỗi: credit="1,000.00" và credit="1.000,00". Hai giá trị đều mang nghĩa 1.000,00 trong các quy ước định dạng tương ứng; API preview/commit đều nhận thành 100.000 đồng. Hai dòng đã được ghi vào tài khoản QA.

Nguồn: server.js:186-193,1274-1277. parseImportedAmount xóa cả dấu phân cách hàng nghìn và dấu thập phân.

Kỳ vọng: nhận diện định dạng file/cột một cách rõ ràng; chuẩn hóa đúng hoặc chặn khi mơ hồ. Không được âm thầm đổi giá trị tiền.

Acceptance: kiểm thử số dạng number1000, chuỗi1000, 1.000, 1,000, 1.000,00, 1,000.00 theo định dạng đã chọn; kiểm tra giá trị preview bằng số đã commit và số dư sau import. VND lẻ cần có chính sách làm tròn rõ, không nhân 100.

## IMP-04 [P1] Hai yêu cầu commit cùng phiên import tạo trùng cả lô

Tạo preview12 dòng có reference khác nhau. Gửi đồng thời hai POST /api/import/transactions/{importId}/commit cùng accountId, không bật includeDuplicates.

Thực tế: hai response đều200, mỗi response createdCount=12; đọc lại có24 dòng mang đúng12 reference. Không chỉ là lỗi hiển thị.

Nguồn: server.js:1294-1326. Preview được SELECT ngoài transaction, không khóa/nhận quyền commit nguyên tử; kiểm tra trùng trên snapshot trước cập nhật.

Acceptance: cùng importId chỉ một request được ghi. Request còn lại trả409/đã xử lý hoặc trả lại kết quả idempotent; không làm thay đổi số dư lần hai. Test cả double-click, retry khi mạng chậm và hai phiên đồng thời.

## IMP-05 [P2] Báo cáo trả200 cho khoảng ngày đảo ngược hoặc vô nghĩa

GET /api/reports/books?from=2026-12-31&to=2026-01-01 và GET /api/reports/sme?from=banana&to=potato đều200, tạo cấu trúc báo cáo thay vì báo sai khoảng lọc.

Nguồn: server.js:773-776,864-866; ledgers.js:6-16; sme-reports.js:9-11. Dashboard có kiểm tra ngày chặt hơn.

Acceptance: kiểm tra ngày lịch thực, from<=to và giới hạn khoảng phù hợp tại server; trả400/422 có thông báo rõ. UI không cho xuất file rỗng gây hiểu nhầm là không phát sinh. Khoảng hợp lệ không phát sinh vẫn phải200 với empty state hợp lệ, khác lỗi bộ lọc.
