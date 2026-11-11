# FinWorkshop - phát hiện bổ sung vòng 2

Ngày 11/11/2026; cùng commit `399cbdd` của vòng 1, không thay source. Đã kiểm thử sâu trên các workshop QA2 riêng, không dựa vào đoán từ mã nguồn.

**25 phát hiện mới = 6 tài chính/API + 7 kho/sản xuất + 5 sao kê/báo cáo + 7 UI/UX.** Cộng với 20 phát hiện vòng 1 thành **45**. Đây là số vấn đề có bước tái hiện, không phải bảo đảm tìm hết lỗi. Các ID FW-21..45 dưới đây là ID chính thức; mã R2-API/DB2/IMP/R2-UI là khóa để tìm trong báo cáo chi tiết.

## Danh sách

| ID | Ưu tiên | Phát hiện và kết quả đã quan sát | Chứng cứ chi tiết |
|---|---|---|---|
| FW-21 | P1 | Hủy khách còn chứng từ đầu kỳ: phải thu 5.000 thành 0, chứng từ nợ vẫn hiệu lực | R2-API-01 |
| FW-22 | P1 | POST giao dịch CANCELLED vẫn tăng số dư 333, nhưng giao dịch bị loại khỏi sổ | R2-API-02 |
| FW-23 | P2 | Lưu cấu hình trả400 nhưng tên/MST doanh nghiệp đã bị thay đổi một phần | R2-API-03 |
| FW-24 | P2 | Đổi tên khách khiến phiếu thu và hóa đơn cùng counterpartyId không phân bổ được,409 | R2-API-04 |
| FW-25 | P2 | Hủy đồng thời hai vế chuyển nội bộ gây deadlock/HTTP500, tái hiện4/4; log PostgreSQL xác nhận | R2-API-05 |
| FW-26 | P2 | Hóa đơn đã có mã mô phỏng sửa được tổng tiền mà giữ mã; retry cấp lại sinh mã khác | R2-API-06 |
| FW-27 | P1 | Hủy phiếu xuất sau nghiệm thu hoàn nguyên vật tư nhưng giữ thành phẩm: tổng tồn10.000 thành12.000 | DB2-01 |
| FW-28 | P1 | Phiếu nhập vật tư gửi sourceProductionOrderId làm báo cáo coi WIP2.000 đã thành thành phẩm, dù lệnh đang chạy | DB2-02 |
| FW-29 | P1 | Nhập thành phẩm lùi ngày ghi nhận tồn trước chi phí máy: tài khoản154 kỳ cũ âm3.000, báo cáo giá thành không khớp nhật ký | DB2-03 |
| FW-30 | P2 | BOM INACTIVE vẫn được dùng lập lệnh mới | DB2-04 |
| FW-31 | P2 | Sản phẩm INACTIVE vẫn được lập/start/complete lệnh, chỉ đến nhập thành phẩm mới bị chặn400 | DB2-05 |
| FW-32 | P1 | Sửa ghi chú đồng thời Start: cả hai200 nhưng trạng thái sau cùng bị đưa từ IN_PROGRESS về DRAFT | DB2-06 |
| FW-33 | P1 | Mở lại lệnh dịch vụ bằng ngày kỳ mới làm giá vốn kỳ đã khóa2.000 thành0 mà không unlock | DB2-07 |
| FW-34 | P2 | Import nhận diện trùng sai: thu/chi khác chiều hoặc hai ngân hàng khác nhau bị bỏ nhầm dù reference khác | IMP-01 |
| FW-35 | P2 | Một dòng có cả credit2.000/debit3.000 được preview không lỗi, chỉ ghi thu2.000 | IMP-02 |
| FW-36 | P1 | XLSX chuỗi "1,000.00"/"1.000,00" được ghi thành100.000 thay vì1.000 | IMP-03 |
| FW-37 | P1 | Hai request commit cùng phiên12 dòng, đều200 và mỗi bên ghi12: thực tế24 giao dịch | IMP-04 |
| FW-38 | P2 | Books/SME nhận khoảng ngày đảo hoặc banana/potato, trả200 thay vì báo lỗi bộ lọc | IMP-05 |
| FW-39 | P1 | Đổi khách A có MST sang B không MST: hóa đơn B được lưu thật nhưng giữ MST A | R2-UI-01 |
| FW-40 | P2 UX | Truy cập deep link khi chưa đăng nhập, login xong mất trang đích/query và về Dashboard | R2-UI-02 |
| FW-41 | P2 UX | Browser Back về URL hóa đơn bán nhưng giao diện vẫn ở hóa đơn mua; reload lại đổi nghĩa trang | R2-UI-03 |
| FW-42 | P2 | Nhấp đúp Tạo phiên bản mới khi mạng chậm tạo hai phiên bản v2/v3 thật, haiHTTP201 | R2-UI-04 |
| FW-43 | P2 A11y | Tab thoát khỏi drawer vào nút điều hướng nền; không giữ focus trong giao diện modal | R2-UI-05 |
| FW-44 | P3 UX | Tab BOM không giữ khi reload; URL tab=boms mở nhầm Sản phẩm | R2-UI-06 |
| FW-45 | P3 UX | Cài đặt đang xem Tài khoản tiền nhưng URL vẫn tab=users; reload mở Người dùng | R2-UI-07 |

Chi tiết đầy đủ (bước, dữ liệu, vị trí mã và tiêu chí sửa):

- [FW-21..26: tài chính/API](round2-api-findings.md), [JSON](round2-api-evidence.json).
- [FW-27..33: kho/sản xuất](round2-db-findings.md), [JSON](round2-db-evidence.json). Các case có requests=[đầu,cuối] trỏ tới mảng HTTP để đọc đúng đoạn, không cần nạp cả file.
- [FW-34..38: sao kê/báo cáo](round2-import-findings.md), [JSON](round2-import-evidence.json).
- [FW-39..45: UI/UX](round2-ui-findings.md), [JSON](round2-ui-qa.json), [ảnh](screenshots).
- [Log deadlock đã lược thông tin](round2-postgres-deadlock.log).

## Ưu tiên sửa

1. Chặn ghi sai tiền/tồn và sửa ngược kỳ khóa: FW-21,22,27,28,29,33,36,37.
2. Chống ghi đè trạng thái/thao tác lặp và sai định danh: FW-24,25,32,39,42.
3. Validation, nguyên tử khi lưu, vòng đời chứng từ: FW-23,26,30,31,34,35,38.
4. Hoàn thiện điều hướng và bàn phím: FW-40,41,43,44,45.

Không tắt nghiệp vụ hoặc chuyển mọi lỗi thành thông báo chung chỉ để test xanh. Phải đọc lại số dư, tồn, công nợ, trạng thái và báo cáo sau thao tác.

## Không tăng số lỗi bằng các trường hợp chưa rõ

- Hai probe import khác chiều/khác ngân hàng gộp FW-34 vì chung fingerprint thiếu chiều/tài khoản.
- Sửa hóa đơn có mã và cấp mã lặp gộp FW-26. Chỉ nói Mock Tax, không kết luận đã sai với cơ quan thuế thật.
- Lệnh dịch vụ/sản phẩm không quản lý kho: tách để xác nhận luồng hoàn thành, không tính400 đơn lẻ là lỗi.
- Phiếu tiền cùng code/reference được tạo hai lần: chưa chốt hợp đồng idempotency, không cộng vào25.
- Báo giá đang chờ duyệt vẫn sửa được: cần xác nhận chính sách; không cộng vào25.
- FW-40,41,43,44,45 là vấn đề UX/accessibility được quan sát, không mô tả là mất tiền hay hỏng tài khoản.
- Ca race đã có kết quả thực tế nhưng có phụ thuộc timing; cần lặp có kiểm soát khi kiểm thử lại.

Nguồn ứng dụng chưa được sửa, chưa stage/commit/push. Báo cáo vòng 1 được giữ làm mốc; dùng [README](README.md) và [ISSUE_INDEX.json](ISSUE_INDEX.json) để theo dõi tổng45.
