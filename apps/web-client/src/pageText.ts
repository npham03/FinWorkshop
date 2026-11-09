// Lời nhắc bằng tiếng thường cho từng trang danh sách: tiêu đề, giới thiệu ngắn, tên nút thêm, lời khi chưa có gì.
export type PageText = { title?: string; intro: string; add: string; empty: string };
export const pageText: Record<string, PageText> = {
  transactions: { title: 'Thu chi', intro: 'Ghi lại tiền vào và tiền ra mỗi ngày.', add: 'Ghi thu chi', empty: 'Chưa ghi khoản thu chi nào' },
  payments: { title: 'Ai nợ ai', intro: 'Xem khách còn nợ bạn bao nhiêu và bạn còn nợ người bán bao nhiêu.', add: 'Ghi khoản trả tiền', empty: 'Chưa có khoản trả tiền nào' },
  reconciliations: { title: 'Khớp với ngân hàng', intro: 'So tiền trong sao kê ngân hàng với những gì bạn đã ghi.', add: 'Thêm một dòng cần khớp', empty: 'Chưa có dòng nào cần khớp' },
  quotations: { title: 'Báo giá', intro: 'Báo giá cho khách và để hệ thống gợi ý giá bán.', add: 'Lập báo giá', empty: 'Chưa có báo giá nào' },
  'production-orders': { title: 'Việc làm trong xưởng', intro: 'Các việc đang làm, ai phụ trách và làm đến đâu rồi.', add: 'Tạo việc mới', empty: 'Chưa có việc nào' },
  customers: { title: 'Khách hàng', intro: 'Danh sách những người mua hàng của bạn.', add: 'Thêm khách hàng', empty: 'Chưa có khách hàng nào' },
  suppliers: { title: 'Người bán', intro: 'Danh sách nơi bạn mua hàng và vật tư.', add: 'Thêm người bán', empty: 'Chưa có người bán nào' },
  'stock-movements': { title: 'Kho', intro: 'Vật tư vào kho và ra khỏi kho.', add: 'Ghi vật tư vào hoặc ra', empty: 'Chưa có phiếu kho nào' },
  products: { intro: 'Những thứ bạn làm ra để bán.', add: 'Thêm sản phẩm', empty: 'Chưa có sản phẩm nào' },
  materials: { intro: 'Vật tư dùng để làm ra sản phẩm.', add: 'Thêm vật tư', empty: 'Chưa có vật tư nào' },
  boms: { intro: 'Mỗi sản phẩm cần những vật tư gì, bao nhiêu.', add: 'Thêm công thức', empty: 'Chưa có công thức nào' },
  invoices: { intro: 'Hóa đơn bạn bán ra và hóa đơn bạn mua vào.', add: 'Lập hóa đơn', empty: 'Chưa có hóa đơn nào' },
  'cash-accounts': { intro: 'Tiền mặt và các tài khoản ngân hàng của bạn.', add: 'Thêm tài khoản', empty: 'Chưa có tài khoản nào' },
  'tax-rules': { intro: 'Các mức thuế dùng khi lập hóa đơn.', add: 'Thêm mức thuế', empty: 'Chưa có mức thuế nào' },
  'classification-rules': { intro: 'Dạy hệ thống tự xếp khoản thu chi vào đúng loại.', add: 'Thêm cách tự xếp loại', empty: 'Chưa có cách tự xếp loại nào' },
  branches: { intro: 'Địa điểm kinh doanh của bạn.', add: 'Thêm địa điểm', empty: 'Chưa có địa điểm nào' },
};
