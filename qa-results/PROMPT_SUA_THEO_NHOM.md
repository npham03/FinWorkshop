# Prompt sửa FinWorkshop theo nhóm - không nạp lại toàn bộ lịch sử

Dùng đoạn chung bên dưới, sau đó nối **một** đoạn nhóm A/B/C/D/E. Không yêu cầu sửa cả45 một lượt. Khóa lỗi và đường dẫn chi tiết có trong ISSUE_INDEX.json.

## Đoạn chung

```text
Bạn đang sửa FinWorkshop, không xây lại dự án. Đọc qa-results/README.md và ISSUE_INDEX.json để xác định các ID thuộc nhóm được giao, sau đó chỉ đọc báo cáo chi tiết và source liên quan. Chỉ xem JSON/ảnh của case đang sửa, không nạp toàn bộ lịch sử hoặc mọi bằng chứng.

Baseline kiểm thử là commit399cbdd; nếu HEAD khác, đối chiếu code và tái hiện trước, không mặc định lỗi còn tồn tại. Giữ mã ID FW ổn định. Không sửa file evidence gốc để làm biến mất kết quả lỗi; lưu kết quả retest mới trong qa-results/retest/.

Mỗi lỗi: (1) tái hiện và thêm regression; (2) sửa ít nhất cần thiết tại đúng tầng; (3) chạy ca sai + ca hợp lệ + ca biên/race liên quan; (4) đọc lại dữ liệu sau thao tác; (5) ghi PASS/FAIL/BLOCKED kèm bằng chứng. Build thành công không đủ để đóng lỗi.

Không refactor ngoài phạm vi, không đổi giao diện/thương hiệu không liên quan, không bỏ chức năng, không hardcode số liệu, không tắt validation/period lock/RBAC hoặc xóa dữ liệu để test xanh. Không tự sửa nguồn ảnh/caption Word/Flutter. Dùng database QA riêng, không xóa volume hoặc gọi dịch vụ thuế/ngân hàng thật.

Tách BUG khỏi UX và REQUIREMENT-DECISION. Nếu cần đổi nghiệp vụ chưa chốt, nêu lựa chọn và dừng đúng phần đó; không tự mở rộng quyền. Kiểm tra schema/migration tương thích dữ liệu hiện có nếu cần.

Handoff ngắn: ID đã sửa, file chính, regression đã chạy, tác động dữ liệu và phần chưa kiểm chứng. Không tự push/commit nếu chưa được yêu cầu.
```

## Nhóm A - Tiền, công nợ và nhất quán chứng từ

```text
Sửa FW-01,02,08,09,10,21,22,23,24,25,26,39.
Đọc: BAO_CAO_KIEM_THU_FINWORKSHOP.md (chỉ các ID này), round2-api-findings.md, R2-UI-01 trong round2-ui-findings.md.

Đích nghiệm thu:
- POST không ghi đè hóa đơn cũ; sửa/cancel không làm lệch phân bổ, công nợ, số dư.
- Số dư không nhận từ client; không tăng tiền cho giao dịch CANCELLED; không ghi vào tài khoản INACTIVE.
- Tham chiếu dùng ID cùng workspace; đổi tên không phá phân bổ; đối tác đổi không giữ MST người cũ.
- Settings thất bại phải rollback toàn bộ. Hồ sơ còn chứng từ đầu kỳ không được hủy làm mất nợ.
- Hai vế chuyển tiền khóa cùng thứ tự/giải quyết xung đột an toàn, hoàn số dư chỉ một lần, không500.
- Hóa đơn/mã mô phỏng/trạng thái nhất quán; retry cấp mã không sinh mã mới vô ý.
Test cả CUSTOMER/SUPPLIER, INPUT/OUTPUT, rollback, hai phiên và đọc lại báo cáo.
```

## Nhóm B - Kho, BOM, giá thành, vòng đời và kỳ khóa

```text
Sửa FW-03,04,05,06,12,13,14,15,27,28,29,30,31,32,33.
Đọc: db-findings.md, round2-db-findings.md; đối chiếu FW-06 trong ui-findings.md và kiểm tra source liên quan.

Đích nghiệm thu:
- Bình quân không dùng đơn giá đã làm tròn để tạo giá trị tồn âm; đổi giá tham khảo không thay giá vốn cũ.
- BOM phải đúng sản phẩm và hoạt động; sản phẩm INACTIVE bị chặn từ đầu.
- Quantity mặc định/đổi quantity/assignedTo được validate và tính kế hoạch đồng nhất giữa create/update.
- Chọn lệnh nào thì vật tư gắn lệnh đó; nhập/xuất/hoàn tác không nhân đôi tài sản hoặc làm mất WIP.
- Trường nguồn nhập thành phẩm chỉ do nghiệp vụ hệ thống sinh; báo cáo kiểm tra đúng loại phiếu.
- Ngày ghi chi phí và nhập thành phẩm nhất quán; reopen ở kỳ mới không xóa số đã khóa của kỳ trước.
- Metadata PUT không đảo Start/Complete; chống snapshot cũ bằng khóa/version/patch đúng trường.
Test bảo toàn nguyên vật liệu + WIP + thành phẩm + giá vốn; đọc nhật ký và báo cáo cùng kỳ.
Chưa tự quyết quyền WAREHOUSE sửa machineCost hoặc cách hoàn thành sản phẩm không quản lý kho: hai mục này cần chốt chính sách riêng.
```

## Nhóm C - Nhập sao kê và bộ lọc báo cáo

```text
Sửa FW-07,34,35,36,37,38.
Đọc: round2-import-findings.md và FW-07 trong báo cáo vòng1.

Đích nghiệm thu:
- Chống trùng dựa trên đúng tài khoản/chiều/reference, preview và commit đồng nhất; không bỏ nhầm hai giao dịch hợp lệ.
- Dòng có cả debit/credit dương phải được rà soát, không tự bỏ một phía.
- Định dạng tiền được chọn/nhận diện rõ, số1.000 không thành100.000. Kiểm tra ô Excel số và chuỗi, dấu Việt/Anh, làm tròn nếu áp dụng.
- Một importId chỉ commit đúng một lần kể cả hai phiên/retry/mạng chậm;12 dòng không thành24; tiền không cộng hai lần.
- Ngày và khoảng lọc phải là ngày lịch thật; from<=to; phân biệt invalid range với khoảng hợp lệ không phát sinh.
Chạy lại round2-import-probes.mjs hoặc regression tương đương trên database test riêng; đọc lại số dư và từng externalReference.
```

## Nhóm D - Workflow giao diện, điều hướng và accessibility

```text
Sửa FW-16,17,18,19,40,41,42,43,44,45. Phối hợp FW-06 và39 nếu nhóm dữ liệu chưa sửa.
Đọc: ui-findings.md và round2-ui-findings.md; chỉ mở ảnh của case đang xử lý.

Đích nghiệm thu:
- OWNER có đường đi tiếp báo giá DRAFT; bỏ BOM không giữ snapshot/giá ẩn.
- Query, tab, Back/Forward và reload phản ánh cùng trạng thái. Login khôi phục deep link nội bộ có quyền, không tạo open redirect.
- Pending action có loading/disabled; double-click khi chậm0,5-2s chỉ tạo một phiên bản, lỗi trả trạng thái nút dùng được. Không khóa việc tạo phiên bản chủ động lần sau.
- Drawer giữ focus, có tên/role phù hợp, Tab/Shift+Tab không chạy xuống nền, Escape hoạt động và đóng xong trả focus.
- Chạy Edge desktop và390px, kiểm tra thao tác bằng bàn phím. Không đổi toàn bộ UI hoặc thêm hiệu ứng chỉ để che thiếu workflow.
Với các mục UX, ghi rõ hành vi trước/sau và tiêu chí chấp nhận, không khẳng định là sai số liệu tài chính.
```

## Nhóm E - Mật khẩu, cài sạch và bộ regression

```text
Sửa FW-11,20 và TEST-01..04; đọc phần tương ứng trong báo cáo vòng1.

Đích nghiệm thu:
- Đăng ký/đổi/reset thống nhất độ dài và giới hạn72byte UTF-8, không chấp nhận mật khẩu bị bcrypt cắt.
- Clone sạch -> npm ci -> build chạy được, lock đồng bộ với manifest.
- Test tự tạo fixture cần dùng, dùng ngày hợp lệ/đồng nhất. Không sửa số kỳ vọng để bỏ qua khác biệt cơ sở kế toán.
- VM export test tải đúng module phụ thuộc; đối chiếu bằng XLSX tải thật.
- Không kết luận cache hỏng từ test tháng10 chạy trên Dashboard tháng11. Không kết luận Odoo hỏng từ mock tỷ giá cũ hoặc fixture thiếu.
Chạy trên database rỗng, ngày khác tháng và lần chạy thứ hai; báo rõ môi trường SMTP/Odoo thật hay mock. Chính sách revoke JWT sau đổi mật khẩu cần chốt riêng.
```
