/**
 * MAPPING SERVICE — Bộ dịch "ngôn ngữ đời thường" → Định khoản kế toán Nợ/Có
 *
 * Logic chuẩn của Hệ thống tài khoản kế toán Việt Nam (Thông tư 200/2014/TT-BTC)
 */

/**
 * Bảng định khoản: { "loại giao dịch" → { debit, credit } }
 * Key = `${type}_${category}` hoặc keyword mapping nâng cao
 */
const ACCOUNTING_MAP = {
  // CHI SẢN XUẤT (mua nguyên vật liệu, hàng hóa phục vụ sản xuất)
  expense_production_material: {
    debit: { account: '152', name: 'Nguyên liệu, vật liệu' },
    credit: { account: '111', name: 'Tiền mặt' },
  },
  // CHI SẢN XUẤT (thanh toán chuyển khoản cho nguyên vật liệu)
  expense_production_material_bank: {
    debit: { account: '152', name: 'Nguyên liệu, vật liệu' },
    credit: { account: '112', name: 'Tiền gửi ngân hàng' },
  },
  // CHI SẢN XUẤT (mua hàng hóa để bán lại)
  expense_production_goods: {
    debit: { account: '156', name: 'Hàng hóa' },
    credit: { account: '111', name: 'Tiền mặt' },
  },
  // CHI SẢN XUẤT (chi phí nhân công trực tiếp)
  expense_production_labor: {
    debit: { account: '622', name: 'Chi phí nhân công trực tiếp' },
    credit: { account: '334', name: 'Phải trả người lao động' },
  },
  // CHI SẢN XUẤT (chi phí sản xuất chung: điện, nước, thuê kho...)
  expense_production_overhead: {
    debit: { account: '627', name: 'Chi phí sản xuất chung' },
    credit: { account: '111', name: 'Tiền mặt' },
  },
  // CHI CÁ NHÂN (rút tiền sinh hoạt, chi tiêu cá nhân chủ hộ)
  expense_personal: {
    debit: { account: '128', name: 'Cho vay / Rút vốn cá nhân chủ hộ' },
    credit: { account: '111', name: 'Tiền mặt' },
  },
  // THU SẢN XUẤT (thu tiền bán hàng/dịch vụ)
  income_production: {
    debit: { account: '111', name: 'Tiền mặt' },
    credit: { account: '511', name: 'Doanh thu bán hàng và cung cấp dịch vụ' },
  },
  // THU SẢN XUẤT (thu tiền qua ngân hàng)
  income_production_bank: {
    debit: { account: '112', name: 'Tiền gửi ngân hàng' },
    credit: { account: '511', name: 'Doanh thu bán hàng và cung cấp dịch vụ' },
  },
  // THU CÁ NHÂN (góp vốn cá nhân vào xưởng)
  income_personal: {
    debit: { account: '111', name: 'Tiền mặt' },
    credit: { account: '411', name: 'Vốn đầu tư của chủ sở hữu' },
  },
};

/**
 * Phân tích từ khóa trong mô tả để quyết định loại chi tiết hơn.
 * Tránh viết if/else dài, dùng từ điển keyword → key.
 */
const KEYWORD_HINTS = {
  // Nhân công
  'nhân công': 'labor', 'lương': 'labor', 'thợ': 'labor', 'công nhân': 'labor',
  // Nguyên vật liệu
  'sắt': 'material', 'thép': 'material', 'gỗ': 'material', 'vải': 'material',
  'nhựa': 'material', 'xi măng': 'material', 'vật tư': 'material', 'nguyên liệu': 'material',
  // Hàng hóa
  'hàng hóa': 'goods', 'mua hàng': 'goods', 'nhập hàng': 'goods',
  // Chi phí chung
  'điện': 'overhead', 'nước': 'overhead', 'thuê': 'overhead', 'sửa chữa': 'overhead',
  'vận chuyển': 'overhead', 'bảo trì': 'overhead',
};

/**
 * Hàm core: map dữ liệu người dùng nhập → entry kế toán.
 *
 * @param {Object} data - { type: 'income'|'expense', category: 'production'|'personal', description: string }
 * @returns {{ debit: {account, name}, credit: {account, name} }}
 */
export const resolveAccountingEntry = ({ type, category, description }) => {
  if (category === 'personal') {
    const key = `${type}_personal`;
    return ACCOUNTING_MAP[key] || ACCOUNTING_MAP['expense_personal'];
  }

  // Phân tích keyword trong description (lowercase để match dễ hơn)
  const desc = description.toLowerCase();
  let subCategory = null;

  for (const [keyword, cat] of Object.entries(KEYWORD_HINTS)) {
    if (desc.includes(keyword)) {
      subCategory = cat;
      break;
    }
  }

  const detailKey = subCategory ? `${type}_production_${subCategory}` : `${type}_production`;

  // Safe fallback: luôn trả về entry hợp lệ, không bao giờ undefined
  const entry = ACCOUNTING_MAP[detailKey] || ACCOUNTING_MAP[`${type}_production`];
  if (!entry) {
    // Fallback cuối cùng khi type không khớp bất kỳ key nào
    return type === 'income'
      ? ACCOUNTING_MAP['income_production']
      : ACCOUNTING_MAP['expense_production_overhead'];
  }
  return entry;
};
