import { type Language, getStoredLanguage } from './language';

// Lời nhắc cho từng trang danh sách: tiêu đề, giới thiệu ngắn, tên nút thêm, lời khi chưa có gì.
export type PageText = { title?: string; intro: string; add: string; empty: string };

export const pageTextVi: Record<string, PageText> = {
  transactions: { title: 'Thu chi', intro: 'Ghi lại tiền vào và tiền ra mỗi ngày.', add: 'Ghi thu chi', empty: 'Chưa ghi khoản thu chi nào' },
  payments: { title: 'Ai nợ ai', intro: 'Xem khách còn nợ bạn bao nhiêu và bạn còn nợ người bán bao nhiêu.', add: 'Ghi khoản trả tiền', empty: 'Chưa có khoản trả tiền nào' },
  reconciliations: { title: 'Khớp với ngân hàng', intro: 'So tiền trong sao kê ngân hàng với những gì bạn đã ghi.', add: 'Thêm một dòng cần khớp', empty: 'Chưa có dòng nào cần khớp' },
  quotations: { title: 'Báo giá', intro: 'Báo giá cho khách và để hệ thống gợi ý giá bán.', add: 'Lập báo giá', empty: 'Chưa có báo giá nào' },
  'production-orders': { title: 'Việc làm trong xưởng', intro: 'Các việc đang làm, ai phụ trách và làm đến đâu rồi.', add: 'Tạo việc mới', empty: 'Chưa có việc nào' },
  customers: { title: 'Khách hàng', intro: 'Danh sách những người mua hàng của bạn.', add: 'Thêm khách hàng', empty: 'Chưa có khách hàng nào' },
  suppliers: { title: 'Người bán', intro: 'Danh sách nơi bạn mua hàng và vật tư.', add: 'Thêm người bán', empty: 'Chưa có người bán nào' },
  'stock-movements': { title: 'Kho', intro: 'Vật tư vào kho và ra khỏi kho.', add: 'Ghi vật tư vào hoặc ra', empty: 'Chưa có phiếu kho nào' },
  products: { title: 'Sản phẩm', intro: 'Những thứ bạn làm ra để bán.', add: 'Thêm sản phẩm', empty: 'Chưa có sản phẩm nào' },
  materials: { title: 'Vật tư', intro: 'Vật tư dùng để làm ra sản phẩm.', add: 'Thêm vật tư', empty: 'Chưa có vật tư nào' },
  boms: { title: 'Công thức BOM', intro: 'Mỗi sản phẩm cần những vật tư gì, bao nhiêu.', add: 'Thêm công thức', empty: 'Chưa có công thức nào' },
  invoices: { title: 'Hóa đơn', intro: 'Hóa đơn bạn bán ra và hóa đơn bạn mua vào.', add: 'Lập hóa đơn', empty: 'Chưa có hóa đơn nào' },
  'cash-accounts': { title: 'Tài khoản tiền', intro: 'Tiền mặt và các tài khoản ngân hàng của bạn.', add: 'Thêm tài khoản', empty: 'Chưa có tài khoản nào' },
  'tax-rules': { title: 'Mức thuế', intro: 'Các mức thuế dùng khi lập hóa đơn.', add: 'Thêm mức thuế', empty: 'Chưa có mức thuế nào' },
  'classification-rules': { title: 'Tự phân loại', intro: 'Dạy hệ thống tự xếp khoản thu chi vào đúng loại.', add: 'Thêm cách tự xếp loại', empty: 'Chưa có cách tự xếp loại nào' },
  branches: { title: 'Cơ sở xưởng', intro: 'Địa điểm kinh doanh của bạn.', add: 'Thêm địa điểm', empty: 'Chưa có địa điểm nào' },
};

export const pageTextEn: Record<string, PageText> = {
  transactions: { title: 'Cashflow', intro: 'Record daily money in and money out.', add: 'Record transaction', empty: 'No transactions recorded yet' },
  payments: { title: 'Debts & Receivables', intro: 'Track customer balances and unpaid supplier bills.', add: 'Record payment', empty: 'No payments recorded yet' },
  reconciliations: { title: 'Bank Reconciliation', intro: 'Compare bank statements against your recorded books.', add: 'Add match line', empty: 'No reconciliation lines yet' },
  quotations: { title: 'Quotations', intro: 'Create customer quotes with smart cost and price estimations.', add: 'New quotation', empty: 'No quotations created yet' },
  'production-orders': { title: 'Workshop Orders', intro: 'Track production orders, assignees, and progress stages.', add: 'Create order', empty: 'No workshop orders yet' },
  customers: { title: 'Customers', intro: 'Directory of your buyers and corporate clients.', add: 'Add customer', empty: 'No customers found' },
  suppliers: { title: 'Suppliers', intro: 'List of vendors and raw material providers.', add: 'Add supplier', empty: 'No suppliers found' },
  'stock-movements': { title: 'Inventory Movements', intro: 'Record incoming, outgoing, and inventory adjustments.', add: 'Record movement', empty: 'No stock movement tickets yet' },
  products: { title: 'Products', intro: 'Goods and items manufactured or distributed.', add: 'Add product', empty: 'No products found' },
  materials: { title: 'Materials', intro: 'Raw materials and supplies used for production.', add: 'Add material', empty: 'No materials found' },
  boms: { title: 'Bill of Materials', intro: 'Material formulas and input components required for each product.', add: 'Add BOM formula', empty: 'No BOM formulas found' },
  invoices: { title: 'Invoices', intro: 'Sales invoices and supplier purchase bills.', add: 'New invoice', empty: 'No invoices found' },
  'cash-accounts': { title: 'Cash & Bank Accounts', intro: 'Cash vaults and connected company bank accounts.', add: 'Add account', empty: 'No accounts found' },
  'tax-rules': { title: 'Tax Rates & Rules', intro: 'Applicable VAT, PIT, and tax calculation rules.', add: 'Add tax rate', empty: 'No tax rules found' },
  'classification-rules': { title: 'Auto-Classification', intro: 'Configure smart auto-categorization for bank and cash records.', add: 'Add rule', empty: 'No classification rules found' },
  branches: { title: 'Locations & Branches', intro: 'Workshop and retail branch locations.', add: 'Add location', empty: 'No locations found' },
};

export function getPageText(entity: string, lang: Language = getStoredLanguage()): PageText {
  const dict = lang === 'en' ? pageTextEn : pageTextVi;
  return dict[entity] || pageTextVi[entity] || { intro: '', add: lang === 'en' ? 'Add New' : 'Thêm mới', empty: lang === 'en' ? 'No records yet' : 'Chưa có bản ghi nào' };
}

// Proxy fallback for backward compatibility
export const pageText = new Proxy(pageTextVi, {
  get(target, prop: string) {
    const lang = getStoredLanguage();
    const dict = lang === 'en' ? pageTextEn : pageTextVi;
    return dict[prop] || target[prop];
  }
});
