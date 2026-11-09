export const labels: Record<string, string> = {
  OUTPUT: 'Hóa đơn bán ra (Thu)', INPUT: 'Hóa đơn mua vào (Chi)', RECEIPT: 'Phiếu thu', RECEIVED: 'Phiếu thu', INCOME: 'Phiếu thu', PAYMENT: 'Phiếu chi', EXPENSE: 'Phiếu chi',
  UNPAID: 'Chưa thanh toán', PARTIAL: 'Thanh toán 1 phần', PAID: 'Đã tất toán', ALLOCATED: 'Đã gán vào hóa đơn', UNALLOCATED: 'Đã gỡ khỏi hóa đơn',
  DRAFT: 'Bản nháp', PENDING_APPROVAL: 'Chờ duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Từ chối', ACCEPTED: 'Khách chốt', SENT: 'Đã gửi khách',
  VOID: 'Đã hủy', CANCELLED: 'Đã hủy', DEMO_CODE_ISSUED: 'Đã cấp mã hóa đơn', REVIEW_REQUIRED: 'Cần rà soát', NEEDS_REVIEW: 'Cần rà soát', REVIEWED: 'Đã rà soát', SAVED: 'Đã ghi lại', CONFIRMED: 'Đã ghi sổ',
  SYNCED: 'Đã đồng bộ Odoo', PENDING: 'Đang chờ đẩy', PENDING_ODOO: 'Đang chờ đẩy', PENDING_SYNC: 'Đang chờ đồng bộ', PROCESSING: 'Đang đồng bộ', PENDING_RETRY: 'Lỗi kết nối · Chờ thử lại', PENDING_MAPPING: 'Chưa khớp danh mục Odoo',
  LOCKED: 'Đã chốt sổ', OPEN: 'Đang mở', ACTIVE: 'Đang hoạt động', INACTIVE: 'Ngừng hoạt động', SUSPENDED: 'Đã khóa tài khoản', PENDING_OWNER: 'Chờ Chủ xưởng duyệt',
  IN_PROGRESS: 'Đang gia công', COMPLETED: 'Hoàn thành', MATCHED: 'Đã khớp ngân hàng', MISMATCH: 'Lệch khớp ngân hàng', UNRESOLVED: 'Chưa khớp ngân hàng', RESOLVED: 'Đã xử lý',
  BUSINESS_INCOME: 'Thu kinh doanh', BUSINESS_EXPENSE: 'Chi kinh doanh', PERSONAL: 'Cá nhân', INTERNAL_TRANSFER: 'Chuyển nội bộ', TRANSFER: 'Chuyển nội bộ', OWNER_FUNDING: 'Vốn chủ nạp', OWNER_DRAW: 'Chủ rút vốn', UNCLASSIFIED: 'Chưa phân loại',
  ISSUE: 'Xuất sản xuất', RETURN: 'Trả kho', WASTE: 'Hao hụt', CASH: 'Tiền mặt', BANK: 'Ngân hàng', BUSINESS: 'Kinh doanh',
  WAREHOUSE:'Thủ kho', READY_FOR_RECEIPT:'Chờ nghiệm thu', OPENING:'Tồn đầu kỳ', FINISHED_RECEIPT:'Nhập thành phẩm', DELIVERY:'Xuất bán', ADJUST_IN:'Kiểm kê tăng', ADJUST_OUT:'Kiểm kê giảm', CUSTOMER:'Khách hàng', SUPPLIER:'Người bán', INVENTORY:'Hàng tồn kho', OPERATING:'Chi phí kỳ', ASSET:'Tài sản', OWNER: 'Chủ doanh nghiệp', ACCOUNTANT: 'Kế toán', WORKSHOP: 'Nhân viên xưởng', HIGH: 'Ưu tiên cao', MEDIUM: 'Cần xử lý', LOW: 'Theo dõi',
  VAT_CREDIT: 'VAT khấu trừ', HKD_REVENUE: 'HKD · Tỷ lệ doanh thu', MANUAL_REVIEW: 'Chờ phân loại thuế', EXEMPT: 'Không chịu thuế', ZERO_RATED: 'Mức thuế 0%', VAT: 'Thuế VAT', REVENUE_TAX_ESTIMATE: 'Thuế trên doanh thu',
  INPUT_INVOICE: 'Hóa đơn mua vào', LABOR: 'Nhân công', ALLOCATION_FEE: 'Phí ngân hàng', TRANSACTION: 'Thu chi trực tiếp', SETTLEMENT_ADJUSTMENT: 'Điều chỉnh thanh toán', IMPORT: 'Sao kê ngân hàng', DEMO_SEED: 'Dữ liệu mẫu', LOCAL_DEMO: 'Lưu nội bộ',
  REGISTER_USER: 'Đăng ký tài khoản', UPSERT: 'Cập nhật dữ liệu', RULE: 'Theo quy tắc', MANUAL: 'Nhập trực tiếp', OCR_REVIEW_REQUIRED: 'Chờ kiểm tra giấy tờ', REVIEW_REQUIRED_TAX: 'Cần rà soát thuế',
};
export const displayLabel = (value: unknown) => {
  const text = String(value ?? '').trim();
  return labels[text] || (!text ? '—' : /^[A-Z][A-Z0-9_:-]*$/.test(text) ? 'Chưa phân loại' : text);
};
export const entityLabels: Record<string, string> = { invoices: 'Hóa đơn', transactions: 'Giao dịch', payments: 'Phiếu thanh toán', 'payment-allocations': 'Gán vào hóa đơn', quotations: 'Báo giá', 'production-orders': 'Việc làm', 'stock-movements': 'Phiếu kho', 'labor-logs': 'Giờ công', materials: 'Vật tư', products: 'Sản phẩm', boms: 'Công thức làm', customers: 'Khách hàng', suppliers: 'Người bán', 'cash-accounts': 'Tài khoản tiền', 'tax-rules': 'Mức thuế', 'tax-periods': 'Kỳ kế toán', users: 'Người dùng', 'audit-logs': 'Nhật ký', 'file-assets': 'Giấy tờ đính kèm', 'role-permissions': 'Phân quyền', 'classification-rules': 'Quy tắc phân loại', branches: 'Cơ sở', reconciliations: 'Khớp ngân hàng', alerts: 'Cảnh báo', 'accounting-adjustments': 'Bút toán điều chỉnh' };
export const actionLabels: Record<string, string> = { RECORD_CREATED: 'Lập giấy tờ', RECORD_UPDATED: 'Cập nhật giấy tờ', RECORD_CANCELLED: 'Hủy giấy tờ', INVOICE_VOIDED: 'Hủy hóa đơn', PAYMENT_ALLOCATED: 'Gán tiền vào hóa đơn', PAYMENT_UNALLOCATED: 'Gỡ khỏi hóa đơn', QUOTATION_REVISED: 'Tạo phiên bản mới', QUOTATION_VERSION_CREATED: 'Tạo phiên bản mới', APPROVE: 'Duyệt báo giá', REJECT: 'Từ chối báo giá', 'SUBMIT-FOR-APPROVAL': 'Gửi duyệt', 'SIMULATE-CODE': 'Cấp mã hóa đơn thử nghiệm', 'MARK-SENT': 'Gửi khách hàng', ACCEPT: 'Khách chốt', 'CREATE-PRODUCTION': 'Chuyển sản xuất', LOCK: 'Chốt sổ', UNLOCK: 'Mở chốt sổ', REOPEN: 'Mở lại khớp ngân hàng', CLASSIFY: 'Phân loại giao dịch', COMPLETE: 'Hoàn thành sản xuất', START: 'Bắt đầu sản xuất', PROGRESS: 'Cập nhật tiến độ', CONFIRM: 'Xác nhận khớp ngân hàng', USER_ACTIVATED: 'Duyệt tài khoản', USER_SUSPENDED: 'Khóa tài khoản', USER_CREATED: 'Tạo tài khoản', USER_REGISTERED: 'Đăng ký tài khoản', PASSWORD_CHANGED: 'Đổi mật khẩu', ROLE_PERMISSIONS_UPDATED: 'Cập nhật quyền', STATEMENT_IMPORTED: 'Nhập sao kê', ODOO_CURRENCY_CONFIGURED: 'Cập nhật tỷ giá VND', ODOO_SYNC_ATTEMPT: 'Đồng bộ Odoo', ODOO_BACKFILL_ENQUEUED: 'Đưa vào hàng đợi Odoo', INTERNAL_TRANSFER_CREATED: 'Chuyển nội bộ' };
export const actionLabel = (value: unknown) => actionLabels[String(value)] || labels[String(value)] || 'Cập nhật hồ sơ';
export const fieldLabels: Record<string, string> = { code: 'Mã giấy tờ', name: 'Tên', title: 'Sản phẩm / Dịch vụ', counterparty: 'Khách / người bán', customerName: 'Khách hàng', supplierName: 'Người bán', taxCode: 'Mã số thuế', date: 'Ngày giấy tờ', dueDate: 'Hạn thanh toán', total: 'Tổng thanh toán', totalAmount: 'Tổng thanh toán', amount: 'Số tiền', subtotal: 'Tiền trước thuế', taxAmount: 'Tiền thuế', taxRate: 'Mức thuế', discountAmount: 'Chiết khấu', paidAmount: 'Đã thanh toán', settledAmount: 'Đã tất toán tiền còn nợ', openBalance: 'Còn nợ', status: 'Trạng thái', paymentStatus: 'Thanh toán', syncStatus: 'Đồng bộ Odoo', quantity: 'Số lượng', unit: 'Đơn vị tính', unitPrice: 'Đơn giá', description: 'Nội dung', note: 'Ghi chú', notes: 'Ghi chú', reason: 'Lý do', cancellationReason: 'Lý do hủy', rejectionNote: 'Lý do từ chối', progress: 'Tiến độ', stage: 'Công đoạn', laborHours: 'Giờ công', hours: 'Giờ công', materialCost: 'Chi phí vật tư', laborCost: 'Chi phí nhân công', machineCost: 'Chi phí máy', costEstimate: 'Vốn hàng bán dự kiến', version: 'Phiên bản', stock: 'Trong kho còn', minStock: 'Tồn tối thiểu', receivable: 'Phải thu', payable: 'Phải trả', balance: 'Số dư', openingBalance: 'Số dư đầu kỳ', bankFeeAmount: 'Phí ngân hàng', roundingAdjustment: 'Làm tròn', allocatedAmount: 'Đã gán vào hóa đơn', unallocatedAmount: 'Chưa gán vào hóa đơn', employeeName: 'Người thực hiện', accountName: 'Tài khoản tiền', productName: 'Sản phẩm', materialName: 'Vật tư', createdAt: 'Thời gian lập' };
const moneyFields = new Set(['total', 'totalAmount', 'amount', 'subtotal', 'taxAmount', 'discountAmount', 'paidAmount', 'settledAmount', 'openBalance', 'unitPrice', 'unitCost', 'materialCost', 'laborCost', 'machineCost', 'costEstimate', 'receivable', 'payable', 'balance', 'openingBalance', 'bankFeeAmount', 'roundingAdjustment', 'allocatedAmount', 'unallocatedAmount']);
export const isMoneyField = (key: string) => moneyFields.has(key) || /Amount$/.test(key);
export const formatNumber = (value: unknown) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(Number(value || 0));
export const formatMoney = (value: unknown) => `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Number(value || 0))} ₫`;
export function vietnamDate(value: unknown, time = false) {
  if (!value) return '—';
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text.slice(8, 10)}/${text.slice(5, 7)}/${text.slice(0, 4)}`;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return '—';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('vi-VN', { timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23' }).formatToParts(date).map((part) => [part.type,part.value]));
  return `${parts.day}/${parts.month}/${parts.year}${time ? ` ${parts.hour}:${parts.minute}` : ''}`;
}
export function formatTaxRate(rate: unknown, treatment?: string) {
  if (treatment === 'EXEMPT') return 'Không chịu thuế';
  return `${formatNumber(rate)}%${Number(rate) === 8 ? ' · Giảm 2% NĐ 174' : ''}`;
}
export function formatAxisMoney(value: number, _maxVal?: number) {
  if (value === 0) return '0 ₫';
  const abs = Math.abs(value), unit = abs >= 1e9 ? 1e9 : abs >= 1e6 ? 1e6 : abs >= 1e3 ? 1e3 : 1;
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: unit === 1 ? 0 : 2 }).format(value / unit)}${unit === 1e9 ? ' tỷ' : unit === 1e6 ? ' tr' : unit === 1e3 ? 'k' : ' ₫'}`;
}
export function moneyTicks(max: number) {
  const target = Math.max(1, max) / 4, power = 10 ** Math.floor(Math.log10(target));
  const step = Math.max(1, ([1, 2, 2.5, 5, 10].find((factor) => factor * power >= target) || 10) * power);
  return Array.from({ length: 5 }, (_, index) => index * step);
}
export const referenceText = (row: Record<string, any>, key: string) => row[key.replace(/Id$/, 'Code')] || row[key.replace(/Id$/, 'Name')] || 'Chưa liên kết';
export function plainValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  if (Array.isArray(value)) return value.length ? `${value.length} dòng chi tiết` : 'Không có dòng chi tiết';
  if (typeof value === 'object') return 'Có hồ sơ chi tiết';
  if (typeof value === 'number') return formatNumber(value);
  return labels[String(value)] || String(value);
}
