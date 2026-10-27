import { getPool, decodeData } from './db.js';
import { active, number } from './accounting.js';

const column = (key, label, format) => ({ key, label, ...(format ? { format } : {}) });
const dateColumns = [column('date', 'Ngày', 'date'), column('code', 'Chứng từ'), column('description', 'Nội dung')];
export async function buildBooks(wid, from = '', to = '') {
  const [records] = await getPool().query("SELECT entity, record_id, data FROM records WHERE workshop_id = ? AND entity IN ('invoices', 'transactions', 'materials', 'stock-movements', 'labor-logs', 'cash-accounts', 'accounting-adjustments', 'products') ORDER BY created_at, id", [wid]);
  const data = {};
  for (const row of records) { const value = { ...decodeData(row.data), id: row.record_id }; if (active(value)) (data[row.entity] ||= []).push(value); }
  return booksFromData(data, from, to);
}

export function booksFromData(data, from = '', to = '') {
  const all = (entity) => (data[entity] || []).filter(active);
  const inPeriod = (row) => (!from || row.date >= from) && (!to || row.date <= to);
  const invoices = all('invoices').filter(inPeriod), transactions = all('transactions').filter(inPeriod);
  const revenue = invoices.filter((row) => row.direction === 'OUTPUT').map((row) => ({ ...row, description: row.counterparty, revenue: number(row.subtotal) - number(row.discountAmount), vatRate: row.vatRate ?? row.taxRate, pitRate: row.pitRate || 0 }));
  revenue.push(...transactions.filter((row) => row.classification === 'BUSINESS_INCOME' && !row.paymentId && !row.invoiceId).map((row) => ({ ...row, revenue: number(row.amount), taxMode: 'MANUAL_REVIEW', taxAmount: 0 })));
  const materials = new Map([...all('materials'),...all('products')].map((row) => [row.id, row]));
  const movements = all('stock-movements').sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const runningStock = new Map([...materials].map(([id, row]) => [id, number(row.stock) - movements.filter((movement) => (movement.productId || movement.materialId) === id).reduce((sum, movement) => sum + (['OPENING','RETURN','RECEIPT','FINISHED_RECEIPT','ADJUST_IN'].includes(movement.type) ? 1 : -1) * number(movement.quantity), 0)]));
  const stock = movements.map((row) => {
    const material = materials.get(row.productId || row.materialId) || {};
    const opening = runningStock.get(row.productId || row.materialId) || 0;
    const incoming = ['OPENING','RETURN','RECEIPT','FINISHED_RECEIPT','ADJUST_IN'].includes(row.type) ? number(row.quantity) : 0;
    const outgoing = incoming ? 0 : number(row.quantity);
    const closing = opening + incoming - outgoing; runningStock.set(row.productId || row.materialId, closing);
    return { ...row, description: row.materialName, opening, incoming, outgoing, closing, unitCost: row.unitCost ?? material.unitCost, amount: number(row.quantity) * number(row.unitCost ?? material.unitCost) };
  }).filter(inPeriod);
  const labor = all('labor-logs').filter(inPeriod).map((row) => ({ ...row, description: row.employeeName, salary: Math.round(number(row.hours) * number(row.hourlyRate ?? row.laborRate)), salaryPaid: number(row.salaryPaid), contributions: number(row.contributions), salaryDue: Math.round(number(row.hours) * number(row.hourlyRate ?? row.laborRate)) - number(row.salaryPaid) }));
  const expenses = [
    ...invoices.filter((row) => row.direction === 'INPUT' && !['INVENTORY','ASSET'].includes(row.purchaseCategory)).map((row) => ({ ...row, description: row.counterparty, expense: number(row.subtotal) - number(row.discountAmount), source: 'INPUT_INVOICE' })),
    ...labor.map((row) => ({ ...row, expense: row.salary + row.contributions, source: 'LABOR' })),
    ...transactions.filter((row) => row.classification === 'BUSINESS_EXPENSE' && !row.paymentId && !row.invoiceId && !row.taxPaymentType).map((row) => ({ ...row, expense: number(row.amount), source: row.source || 'TRANSACTION' })),
    ...all('accounting-adjustments', 'products').filter((row) => row.direction === 'OUTPUT' && inPeriod(row)).map((row) => ({ ...row, description: row.writeOffReason, expense: number(row.discountAmount) + number(row.roundingAdjustment), source: 'SETTLEMENT_ADJUSTMENT' })),
  ];
  let vatLiability = 0, pitLiability = 0;
  const tax = all('invoices').map((row) => {
    const items = row.items || [];
    const hkd = row.taxMode === 'HKD_REVENUE';
    const lineVat = (item) => item.taxMode === 'HKD_REVENUE' ? number(item.taxAmount) - Math.round(number(item.subtotal) * number(item.pitRate) / 100) : number(item.taxAmount);
    const vat = items.length ? items.reduce((total,item) => total + lineVat(item),0) + number(row.taxAmount) - items.reduce((total,item) => total + number(item.taxAmount),0) : hkd ? number(row.taxAmount) - Math.round(number(row.subtotal) * number(row.pitRate) / 100) : number(row.taxAmount);
    const pit = row.direction === 'OUTPUT' ? items.length ? items.filter((item) => item.taxMode === 'HKD_REVENUE').reduce((total,item) => total + Math.round(number(item.subtotal) * number(item.pitRate) / 100),0) : hkd ? Math.round(number(row.subtotal) * number(row.pitRate) / 100) : 0 : 0;
    const vatOutput = row.direction === 'OUTPUT' ? vat : 0;
    const vatInput = row.direction === 'INPUT' && row.inputVatDeductible === true ? items.length ? items.filter((item) => item.taxMode !== 'HKD_REVENUE').reduce((total,item) => total + lineVat(item),0) : !hkd ? vat : 0 : 0;
    vatLiability += vatOutput - vatInput; pitLiability += pit;
    return { ...row, description: row.counterparty, vatOutput, vatInput, pit, vatPaid: 0, pitPaid: 0, taxDue: vatLiability + pitLiability };
  });
  for (const row of all('transactions').filter((row) => ['VAT', 'PIT'].includes(row.taxPaymentType) && row.direction === 'EXPENSE')) {
    const vatPaid = row.taxPaymentType === 'VAT' ? number(row.amount) : 0, pitPaid = row.taxPaymentType === 'PIT' ? number(row.amount) : 0;
    vatLiability -= vatPaid; pitLiability -= pitPaid;
    tax.push({ ...row, vatOutput: 0, vatInput: 0, pit: 0, vatPaid, pitPaid, taxDue: vatLiability + pitLiability });
  }
  vatLiability = 0; pitLiability = 0;
  tax.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  for (const row of tax) { vatLiability += number(row.vatOutput) - number(row.vatInput) - number(row.vatPaid); pitLiability += number(row.pit) - number(row.pitPaid); row.taxDue = vatLiability + pitLiability; }
  const periodTax = tax.filter(inPeriod);
  if (from) { const opening = tax.filter((row) => row.date < from).at(-1); if (opening) periodTax.unshift({ id: 'tax-opening', date: from, description: 'Nghĩa vụ thuế chuyển kỳ trước', vatOutput: 0, vatInput: 0, pit: 0, vatPaid: 0, pitPaid: 0, taxDue: opening.taxDue }); }
  const cashBooks = (type) => all('cash-accounts').filter((account) => account.type === type && account.ownerScope !== 'PERSONAL').flatMap((account) => {
    let balance = number(account.openingBalance ?? account.balance);
    const txns = all('transactions').filter((row) => row.accountId === account.id).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const openingRow = { id: `opening-${account.id}`, date: from || '', code: '', description: 'Số dư đầu kỳ', accountName: account.name, incoming: 0, outgoing: 0, balance };
    const rows = [];
    for (const row of txns) {
      const incoming = row.direction === 'INCOME' || row.direction === 'TRANSFER' && row.transferSide === 'IN' ? number(row.amount) : 0;
      const outgoing = row.direction === 'EXPENSE' || row.direction === 'TRANSFER' && row.transferSide === 'OUT' ? number(row.amount) : 0;
      balance += incoming - outgoing;
      if (from && row.date < from) openingRow.balance = balance;
      if (inPeriod(row)) rows.push({ ...row, accountName: account.name, incoming, outgoing, balance });
    }
    return [openingRow, ...rows];
  });
  const moneyColumns = (...fields) => fields.map(([key, label]) => column(key, label, 'money'));
  const books = [
    { code: 'S1-HKD', title: 'Sổ chi tiết doanh thu bán hàng hóa, dịch vụ', rows: revenue, columns: [...dateColumns, column('taxMode', 'Phương pháp'), column('vatRate', 'GTGT (%)'), column('pitRate', 'TNCN (%)'), ...moneyColumns(['revenue', 'Doanh thu'], ['taxAmount', 'Thuế theo hồ sơ'])] },
    { code: 'S2-HKD', title: 'Sổ chi tiết vật liệu, dụng cụ, sản phẩm, hàng hóa', rows: stock, columns: [...dateColumns, column('type', 'Loại'), column('opening', 'Tồn đầu'), column('incoming', 'Nhập / Trả'), column('outgoing', 'Xuất / Hao hụt'), column('closing', 'Tồn cuối'), ...moneyColumns(['unitCost', 'Đơn giá'], ['amount', 'Giá trị'])] },
    { code: 'S3-HKD', title: 'Sổ chi phí sản xuất, kinh doanh', rows: expenses, columns: [...dateColumns, column('source', 'Nguồn'), ...moneyColumns(['expense', 'Chi phí'])] },
    { code: 'S4-HKD', title: 'Sổ theo dõi nghĩa vụ thuế với NSNN', rows: periodTax, columns: [...dateColumns, column('taxMode', 'Phương pháp'), ...moneyColumns(['vatOutput', 'GTGT đầu ra'], ['vatInput', 'GTGT đủ điều kiện khấu trừ'], ['pit', 'TNCN'], ['vatPaid', 'GTGT đã nộp'], ['pitPaid', 'TNCN đã nộp'], ['taxDue', 'Thuế còn phải nộp'])] },
    { code: 'S5-HKD', title: 'Sổ theo dõi tiền lương và các khoản trích theo lương', rows: labor, columns: [...dateColumns, column('hours', 'Giờ công'), ...moneyColumns(['salary', 'Tiền lương'], ['contributions', 'Các khoản trích'], ['salaryPaid', 'Đã trả'], ['salaryDue', 'Còn phải trả'])] },
    ...[['S6-HKD', 'Sổ quỹ tiền mặt', 'CASH'], ['S7-HKD', 'Sổ tiền gửi ngân hàng', 'BANK']].map(([code, title, type]) => ({ code, title, rows: cashBooks(type), columns: [...dateColumns, column('accountName', 'Tài khoản'), ...moneyColumns(['incoming', 'Thu'], ['outgoing', 'Chi'], ['balance', 'Số dư'])] })),
  ];
  return { books, from, to, generatedAt: new Date().toISOString(), legalBasis: 'Bảng đối chiếu quản trị theo cấu trúc TT88 cũ; không phải bộ sổ HKD hiện hành. Từ 2026, chọn mẫu theo TT152/2025/TT-BTC và phương pháp thuế của đơn vị.', taxNote: 'VAT đầu vào chỉ khấu trừ khi đánh dấu inputVatDeductible sau khi kiểm tra điều kiện. HKD tính riêng tỷ lệ GTGT/TNCN trên doanh thu.' };
}
