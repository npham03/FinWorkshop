# FinWorkshop - QA giao diện vòng 2

## Phạm vi

- Commit kiểm thử: `399cbddfa0be540a80a3facc1c6ef0569e695068`.
- UI `http://127.0.0.1:5184`; API QA `http://127.0.0.1:3005/api`.
- Microsoft Edge headless qua Playwright, context riêng. Không thay đổi profile trình duyệt cá nhân.
- Không chỉnh sửa mã nguồn ứng dụng. Chỉ ghi script, JSON và ảnh trong `qa-results/`.
- Không lặp 5 lỗi UI đã báo ở vòng 1. Không tính locator timeout thành lỗi sản phẩm.
- Script tái chạy: `node qa-results/round2-ui-qa.cjs`; script tạo fixture mới có tiền tố `QA2-UI-<timestamp>` trong CSDL QA.
- Bằng chứng chi tiết: `round2-ui-qa.json`; ảnh có tiền tố `screenshots/round2-`.
- Kết quả: 7/7 probe hoàn tất, không có `harnessError`, không có JavaScript `pageerror`. Có 2 nghiệp vụ ghi dữ liệu thật: lưu hóa đơn và tạo phiên bản báo giá. Các probe còn lại kiểm tra thao tác điều hướng/keyboard.

## R2-UI-01 [P1 - sai dữ liệu] Đổi khách hàng nhưng lưu mã số thuế của khách trước

**Điều kiện:** khách A có mã số thuế, khách B không khai báo mã số thuế. Cả hai đang hoạt động.

**Tái hiện:**

1. OWNER mở Hóa đơn, chọn `Lập hóa đơn bán`.
2. Ở ô đối tác, chọn A. Mở `Mã số thuế & thông tin phụ` để thấy MST của A.
3. Đổi đối tác sang B. Không tự sửa MST.
4. Điền số hóa đơn mới, một dòng dịch vụ 100.000 đồng, sang bước kiểm tra và lưu.

**Thực tế đã xác nhận:** UI vẫn giữ MST `0312345678` của A. API trả HTTP 201, hóa đơn `QA2-UI-1794335902855-STALETAX` có tên và ID của B nhưng `taxCode=0312345678` của A. ID hóa đơn: `55ea0dce-9b84-4c3a-9449-17db68055c8a`.

**Mong đợi:** thay đối tác phải đồng bộ thông tin nhận dạng với đúng đối tác mới; không mang MST của A sang B một cách tự động/ẩn.

**Ảnh hưởng:** chứng từ chứa sai thông tin nhận dạng đối tác. Không khẳng định công nợ bị chuyển sai: lần thử này công nợ B tăng đúng 100.000 đồng, A vẫn 0.

**Nguồn:** `apps/web-client/src/InvoiceModal.tsx:63` dùng `partner?.taxCode || header.taxCode`; `apps/middleware-api/src/workflows.js:31` tiếp tục giữ MST đầu vào khi B không có MST.

**Bằng chứng:** `screenshots/round2-invoice-stale-tax-before-save.png`; JSON mục `invoice-partner-stale-tax-persisted` chứa ID đối tác, HTTP status và dữ liệu đã lưu, không chứa token.

**Tiêu chí nghiệm thu sửa lỗi:**

- A có MST → B không MST: trường và bản lưu không còn MST A; nếu cho phép nhập MST riêng thì phải là thao tác rõ ràng, chủ động của người dùng.
- A → C có MST khác: cả UI và bản lưu dùng MST C.
- Lặp lại cho hóa đơn mua với nhà cung cấp; quay lại bước đầu rồi đổi đối tác vẫn không giữ nhầm dữ liệu.

## R2-UI-02 [P2 - UX điều hướng] Đăng nhập xong mất trang đích và query ban đầu

**Tái hiện:** mở context chưa đăng nhập, truy cập `/inventory?new=1`; hệ thống đưa đến `/login`; đăng nhập tài khoản OWNER hợp lệ.

**Thực tế:** kết thúc tại `/app`, không trở lại trang Kho và không mở biểu mẫu đã yêu cầu.

**Mong đợi:** sau xác thực, trở lại đường dẫn nội bộ được yêu cầu, gồm query hợp lệ; vẫn phải kiểm tra quyền truy cập. Đây là gián đoạn UX, không phải tài khoản bị chặn làm việc hoàn toàn.

**Nguồn:** `apps/web-client/src/Portal.tsx:114` có lưu `state.from` nhưng chỉ lấy `pathname`; `apps/web-client/src/AuthPages.tsx:42` bỏ qua state và luôn `navigate('/app')`.

**Bằng chứng:** `screenshots/round2-auth-deeplink-lost.png`; JSON mục `auth-return-deep-link`.

**Tiêu chí nghiệm thu:** deep link được phép được khôi phục cả path/query sau login; không có đích thì về `/app`; đích không có quyền hoặc đích ngoài ứng dụng không được điều hướng trái phép.

## R2-UI-03 [P2 - UX/workflow] Browser Back trả URL cũ nhưng vẫn giữ tab hóa đơn mua

**Tái hiện:**

1. Mở `/invoices`, đang là hóa đơn bán, có nút `Lập hóa đơn bán`.
2. Chọn `Hóa đơn mua vào (Chi)`, URL thành `/invoices?type=INPUT`.
3. Bấm Back của trình duyệt.

**Thực tế:** URL trở lại `/invoices` nhưng vẫn hiện tab hóa đơn mua và nút `Ghi hóa đơn mua`; nút lập hóa đơn bán không còn. Reload cùng URL lại hiển thị bán, nên lịch sử và trạng thái trang không nhất quán.

**Mong đợi:** Back khôi phục đúng tab của trang trước, đồng nhất với cách hiển thị khi tải trực tiếp cùng URL.

**Nguồn:** `apps/web-client/src/pages.tsx:218` mặc định tab OUTPUT; effect tại `:219` chỉ cập nhật state khi có tham số `type`, bỏ qua khi Back làm tham số biến mất.

**Bằng chứng:** `screenshots/round2-invoice-browser-back.png`; JSON mục `invoice-back-navigation-mismatch` ghi URL trước/sau và loại nút tạo đang hiển thị.

**Tiêu chí nghiệm thu:** Back/Forward giữa URL không có type, OUTPUT và INPUT đều khôi phục đúng tab, bảng và loại biểu mẫu tạo mới; tải lại URL không làm đổi nghĩa trang đang xem.

## R2-UI-04 [P2 - workflow ghi dữ liệu] Nhấp đúp tạo hai phiên bản báo giá thật

**Điều kiện:** báo giá đã APPROVED, kết nối có độ trễ khoảng 650 ms trước khi gửi request. Chỉ trì hoãn mạng; không giả lập response hay thay thế dữ liệu API.

**Tái hiện:** OWNER mở báo giá đã duyệt, nhấp đúp `Tạo phiên bản mới` khi thao tác đầu chưa hoàn tất.

**Thực tế đã xác nhận:** có 2 POST thật, cả hai HTTP 201. Từ báo giá `QA2-UI-1794335902855-REV` phiên bản 1 sinh cả:

- `QA2-UI-1794335902855-REV-v2`, ID `401b35bc-1e96-421a-8984-9f4cc11cb56d`.
- `QA2-UI-1794335902855-REV-v3`, ID `a562f74b-76fc-48d2-a7bd-764a703b59d0`.

**Mong đợi:** một thao tác sửa phiên bản đang chờ không được xử lý lặp do nhấp đúp vô ý. Người dùng vẫn có thể chủ động tạo thêm phiên bản sau khi thao tác trước hoàn tất.

**Nguồn:** `apps/web-client/src/pages.tsx:68` thực thi API không có trạng thái pending theo dòng/thao tác; nút workflow tại `:72` không disabled khi request đang chạy. `apps/middleware-api/src/workflows.js:170` cấp phiên bản mới cho từng lần gọi nên cả hai được ghi thật.

**Bằng chứng:** `screenshots/round2-double-revise-generated.png`; JSON mục `double-revise-pending-real-requests` chứa hai status 201 và danh sách phiên bản đọc lại từ API.

**Tiêu chí nghiệm thu:** trong điều kiện mạng chậm 0,5-2 giây, nhấp đúp/chạm đúp chỉ tạo một phiên bản; nút có trạng thái đang xử lý; lỗi request trả nút về trạng thái dùng được; không khóa vĩnh viễn quyền tạo phiên bản tiếp theo.

## R2-UI-05 [P2 - accessibility/UX] Tab thoát khỏi drawer sang điều hướng nền

**Tái hiện:** mở `Thêm khách hàng`, đưa focus tới `Lưu thông tin`, bấm Tab tiếp.

**Thực tế:** focus không quay lại đầu drawer; đi qua BODY, link `/app`, link Tổng quan rồi các nút `Tiền & Thuế`, `Xưởng & Kho` ở nền. Các phần tử nền còn hoạt động dù biểu mẫu đang phủ màn hình. Người dùng keyboard có thể rời form/điều hướng mất dữ liệu đang nhập.

**Mong đợi:** focus được đưa vào drawer khi mở, Tab/Shift+Tab ở trong drawer cho đến khi đóng, nền không tương tác; đóng thì trả focus về nút mở.

**Phân loại:** đây là lỗi accessibility/UX, không phải lỗi tính tiền hay ghi sổ.

**Nguồn:** `apps/web-client/src/components.tsx:91` RecordModal không quản lý focus hoặc inert nền; cấu trúc overlay tại `:115` và form tại `:128` không có focus trap. Không trùng lỗi Escape vòng 1: Escape là thiếu handler riêng, còn lỗi này là vùng điều hướng keyboard.

**Bằng chứng:** `screenshots/round2-drawer-keyboard-focus-background.png`; JSON mục `generic-drawer-focus-escapes-to-background` ghi 5 phần tử focus thực tế.

**Tiêu chí nghiệm thu:** keyboard-only mở/đóng/submit được; ít nhất 2 vòng Tab và Shift+Tab không thoát ra nền; focus được khôi phục sau đóng; áp dụng nhất quán cho các drawer dùng chung và không che focus indicator.

## R2-UI-06 [P3 - UX/tab] Tab BOM không giữ khi tải lại; deep link BOM mở nhầm Sản phẩm

**Tái hiện:** vào `/catalog`, chọn `Công thức làm BOM`, tải lại; sau đó thử mở trực tiếp `/catalog?tab=boms`.

**Thực tế:** trước reload heading `Công thức BOM`; sau reload và khi mở `?tab=boms` đều là `Sản phẩm`.

**Mong đợi:** tab đang dùng có URL tương ứng; tải lại hoặc mở link BOM phải hiện BOM, không chuyển người dùng về danh mục khác.

**Nguồn:** `apps/web-client/src/pages.tsx:233` chỉ nhận giá trị query `materials`, mọi giá trị khác kể cả `boms` thành products; `:240` đổi tab chỉ bằng state, không cập nhật URL.

**Bằng chứng:** `screenshots/round2-catalog-bom-before-reload.png`, `screenshots/round2-catalog-bom-deeplink-wrong.png`; JSON mục `catalog-bom-reload-and-deeplink`.

**Tiêu chí nghiệm thu:** hỗ trợ products/materials/boms; click cập nhật URL; reload và mở link phục hồi đúng tab; tham số không hợp lệ về default xác định.

## R2-UI-07 [P3 - UX/tab] URL Cài đặt ghi Người dùng dù đang xem Tài khoản tiền

**Tái hiện:** vào `/settings?tab=users`, chọn `Tài khoản tiền`, tải lại.

**Thực tế:** sau chọn đã hiện heading `Tài khoản tiền` nhưng URL vẫn `?tab=users`; reload lại mở `Mời nhân viên vào doanh nghiệp` và `Người dùng & quyền truy cập`. Copy link khi đang xem tài khoản cũng dẫn người nhận tới màn hình khác.

**Mong đợi:** tab hiện tại và URL thống nhất, reload hoặc chia sẻ link không chuyển sang phân hệ quản trị khác.

**Nguồn:** `apps/web-client/src/pages.tsx:388` khởi tạo tab từ URL một lần; `:424` các nút đổi state nhưng không đổi query.

**Bằng chứng:** `screenshots/round2-settings-accounts-url-users.png`; JSON mục `settings-tab-url-reload-mismatch` có heading và URL trước/sau.

**Tiêu chí nghiệm thu:** click cập nhật `tab`; tải lại/Back/Forward và mở link trực tiếp thể hiện đúng trang con với quyền phù hợp; không làm mất query độc lập cần giữ.

## Lưu ý bàn giao

- 5 lỗi đầu là ưu tiên chính; 2 lỗi tab cuối là UX tái hiện được nhưng ưu tiên thấp hơn và có thể gom chung một đầu việc đồng bộ URL/tab, không phải lỗi tài chính.
- Không báo thêm lỗi lệch công nợ từ probe MST vì kết quả không chứng minh điều đó.
- Không tính hành vi Odoo offline là bug; không kiểm thử tài khoản hay dịch vụ bên ngoài.
- Evidence không chứa JWT, mật khẩu ngoài thông tin tài khoản demo có sẵn hoặc file cấu hình bí mật. Thông tin đối tác có tiền tố QA2-UI là fixture tự tạo.
- Bản lưu hóa đơn và 2 báo giá nháp do probe tạo được giữ trong DB QA để đối chiếu; không phải dữ liệu production. Không thực hiện sửa mã ứng dụng hoặc tự dọn bằng cách xóa dữ liệu.
