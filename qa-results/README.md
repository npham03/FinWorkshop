# FinWorkshop QA - đọc từ đây

**45 phát hiện đã tái hiện** trên commit `399cbddfa0be540a80a3facc1c6ef0569e695068`: 20 vòng 1 + **25 mới vòng 2**. Vòng 2 gồm 20 vấn đề workflow/chức năng/dữ liệu và 5 điểm UX/accessibility/điều hướng. Không phải 45 lỗi đều nghiêm trọng như nhau.

Ngày: 11/11/2026. Tất cả hiện để OPEN, chưa sửa ứng dụng. Chỉ ghi dữ liệu QA riêng. Không commit/push tự động.

**Cập nhật sau vòng QA:** website công khai đã được triển khai ở một công việc riêng; xem [kiểm thử website mới](website/QA-results.md) và [bàn giao](../docs/WEBSITE-PRODUCT-HANDOFF.md). Bốn mươi lăm phát hiện phía trên vẫn là mốc kiểm thử trên399cbdd, không được tự coi đã sửa/đóng khi thay trang chủ. Source hiện có thay đổi cho website và form liên hệ; câu “chưa sửa ứng dụng” phía trên mô tả thời điểm kết thúc hai vòng tìm lỗi.

## Dùng để sửa, ít tốn ngữ cảnh

1. Đọc [bảng lỗi mới](BAO_CAO_BO_SUNG_VONG_2.md).
2. Chọn **một nhóm** trong [prompt sửa theo nhóm](PROMPT_SUA_THEO_NHOM.md).
3. Chỉ mở báo cáo chi tiết của nhóm đó. Chỉ đọc case liên quan trong JSON khi cần xác minh; không nạp cả thư mục ảnh/JSON lớn vào prompt.
4. [ISSUE_INDEX.json](ISSUE_INDEX.json) có ID ổn định FW-01..45, mức ưu tiên, báo cáo và khóa chứng cứ. Dùng ID để trao đổi, không đổi số khi sửa.

| Tài liệu | Nội dung |
|---|---|
| [Vòng 1](BAO_CAO_KIEM_THU_FINWORKSHOP.md) | FW-01..20, 4 lỗi bộ test và các yêu cầu cần chốt |
| [Vòng 2](BAO_CAO_BO_SUNG_VONG_2.md) | FW-21..45; không lặp lỗi cũ |
| [Tài chính/API](round2-api-findings.md) | 6 phát hiện mới, repro, source, acceptance |
| [Kho/sản xuất](round2-db-findings.md) | 7 phát hiện mới, số liệu trước/sau và ca đồng thời |
| [Nhập sao kê/báo cáo](round2-import-findings.md) | 5 phát hiện; 6 probe, đã gộp 2 probe chung nguyên nhân |
| [UI/UX](round2-ui-findings.md) | 7 phát hiện, gồm 5 UX và 2 thao tác ghi sai/trùng dữ liệu |
| [Prompt sửa](PROMPT_SUA_THEO_NHOM.md) | Quy tắc chung + 5 nhóm công việc có tiêu chí nghiệm thu |
| [Ảnh](screenshots) | Ảnh thật từ Edge, tên round2-* là vòng bổ sung |

## Lưu ý trước khi đưa GitHub

- Đường dẫn giữa các báo cáo là tương đối, đọc được ngay trong repo GitHub.
- Chỉ thêm `qa-results/`. Không thêm `.env`, uploads, database hoặc node_modules. Không có source ứng dụng bị sửa trong phiên QA.
- Các JSON chứng cứ đã loại bearer token, mật khẩu, OTP. Tài khoản/UUID trong báo cáo là fixture QA hoặc demo. Mật khẩu cố định trong script là dữ liệu kiểm thử cục bộ, không phải credential sản xuất.
- Các script có ghi dữ liệu thử, dùng cổng local và database cô lập đã mô tả trong báo cáo. Không đổi base URL sang môi trường thật rồi chạy.
- Kết quả thuộc commit trên. Nếu source đã thay đổi, cần tái hiện lại trước khi coi phát hiện còn OPEN; tuyệt đối không đánh CLOSED chỉ vì build thành công.
- Không tính ca cần xác nhận nghiệp vụ thành lỗi chắc chắn. Không coi kiểm thử này là chứng nhận thuế, bảo mật toàn diện hay kiểm tra hết mọi tổ hợp.

Bạn tự commit/push theo quy trình của mình; tài liệu này không tạo GitHub issue hoặc PR.
