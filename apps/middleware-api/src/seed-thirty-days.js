import { createHash, randomUUID } from 'node:crypto';
import { getPool, decodeData, saveRecord } from './db.js';
import { calculateInvoice, businessDate, active } from './accounting.js';
import { transaction, updateInvoicePartner } from './workflows.js';
import { shiftDay } from './dashboard.js';

export async function seedThirtyDays(wid) {
  const today = businessDate(), actor = 'workflow-seed';
  const [stored] = await getPool().query('SELECT entity, record_id, data FROM records WHERE workshop_id = ?', [wid]);
  const rows = stored.map((row) => ({ entity: row.entity, ...decodeData(row.data), id: row.record_id }));
  const find = (entity, code) => rows.find((row) => row.entity === entity && row.code === code);
  const accounts = rows.filter((row) => row.entity === 'cash-accounts' && active(row));
  const customer = find('customers', 'DEMO-KH'), supplier = find('suppliers', 'DEMO-NCC');
  if (!customer || !supplier || accounts.length < 2) throw new Error('Cần khởi tạo xưởng Demo trước chuỗi dữ liệu 30 ngày.');
  const [workers] = await getPool().query("SELECT id FROM users WHERE workshop_id = ? AND role = 'WORKSHOP' LIMIT 1", [wid]);
  const lockedPeriods = rows.filter((row) => row.entity === 'tax-periods' && row.status === 'LOCKED');
  const unlocked = (date) => !lockedPeriods.some((period) => date >= period.startDate && date <= period.endDate);
  const inputCodes = ['MAT-STL-SS400', 'MAT-INX-304', 'MAT-WOD-MDF17', 'MAT-PNT', 'EXP-ELEC', 'EXP-TRUCK'];
  const outputCodes = ['PRD-CAB', 'PRD-TBL', 'PRD-RCK', 'SVC-CNC', 'SVC-MAINT'];
  let created = 0;
  for (let index = 0; index < 30; index++) {
    const date = shiftDay(today, index - 29);
    if (!unlocked(date)) continue;
    for (const direction of ['OUTPUT', 'INPUT']) {
      const code = `DEMO-30D-${direction === 'OUTPUT' ? 'BR' : 'MV'}-${date.replaceAll('-', '')}`;
      if (find('invoices', code)) continue;
      const isOutput = direction === 'OUTPUT', partner = isOutput ? customer : supplier;
      const product = find(isOutput ? 'products' : 'materials', (isOutput ? outputCodes : inputCodes)[index % (isOutput ? outputCodes.length : inputCodes.length)]);
      const unitPrice = isOutput ? product.price : product.unitCost;
      const quantity = isOutput ? (product.code.startsWith('SVC') ? 3 + index % 5 : 1 + index % 2) : [90 + index, 35 + index, 4 + index % 3, 12 + index % 5, 850 + index * 8, 1][index % 6];
      const taxRate = isOutput ? product.outputTaxRate : product.inputTaxRate;
      const at = `${date}T${isOutput ? '09:15' : '14:30'}:00+07:00`;
      const base = calculateInvoice({ id: randomUUID(), code, direction, date, dueDate: shiftDay(date, isOutput ? 7 : 12), counterparty: partner.name, counterpartyId: partner.id, taxCode: partner.taxCode, taxMode: 'VAT_CREDIT', vatRate: taxRate, taxRate, inputVatDeductible: !isOutput, category: isOutput ? 'Bán hàng & gia công' : index % 6 >= 4 ? 'Điện, nước & vận chuyển' : 'Vật tư sản xuất', items: [{ productId: product.id, name: product.name, unit: product.unit, quantity, unitPrice, taxRate, taxMode: 'VAT_CREDIT', vatRate: taxRate }], status: isOutput ? 'DEMO_CODE_ISSUED' : 'SAVED', seeded: true, seedBatch: 'DEMO_30_DAYS', createdAt: at });
      const hash = createHash('sha256').update(code).digest('hex').toUpperCase();
      const fraction = isOutput ? [1, 0.55, 1, 0, 0.8][index % 5] : [1, 1, 0.5, 0][index % 4];
      const paidAmount = Math.round(base.total * fraction), openBalance = base.total - paidAmount;
      const history = [{ status: 'SAVED', at, actor: 'Kế toán Demo', note: 'Lập chứng từ từ bảng kê chi tiết.' }];
      if (isOutput) history.push({ status: 'DEMO_CODE_ISSUED', at: `${date}T09:20:00+07:00`, actor: 'Kế toán Demo', note: 'Cấp mã CQT thử nghiệm.' });
      if (paidAmount) history.push({ status: openBalance === 0 ? 'PAID' : 'PARTIAL', at: `${date}T16:10:00+07:00`, actor: 'Kế toán Demo', note: openBalance ? 'Nhận thanh toán đợt 1.' : 'Đã đối chiếu đủ tiền thanh toán.' });
      const newRows = await transaction(wid, async (connection) => {
        const invoice = await saveRecord('invoices', { ...base, paidAmount, settledAmount: paidAmount, openBalance, paymentStatus: openBalance === 0 ? 'PAID' : paidAmount ? 'PARTIAL' : 'UNPAID', mockTaxCode: isOutput ? `C${date.slice(2, 4)}-${hash.slice(0, 4)}-${hash.slice(4, 12)}` : undefined, mockTaxSource: isOutput ? 'DEMO_SEED' : undefined, simulatedAt: isOutput ? `${date}T09:20:00+07:00` : undefined, statusHistory: history, workshopId: wid }, actor, wid, 'DEMO_SEED', connection);
        await updateInvoicePartner(connection, actor, invoice, openBalance, wid);
        const saved = [{ entity: 'invoices', ...invoice }];
        if (paidAmount) {
          const account = accounts[(index + (isOutput ? 0 : 1)) % accounts.length];
          const paymentCode = `DEMO-30D-${isOutput ? 'PT' : 'PC'}-${date.replaceAll('-', '')}`;
          const paymentId = randomUUID();
          const movement = await saveRecord('transactions', { code: `${paymentCode}-GD`, date, description: `${isOutput ? 'Thu tiền' : 'Thanh toán'} ${product.name.toLocaleLowerCase('vi')}`, counterparty: partner.name, amount: paidAmount, direction: isOutput ? 'INCOME' : 'EXPENSE', classification: isOutput ? 'BUSINESS_INCOME' : 'BUSINESS_EXPENSE', accountId: account.id, accountName: account.name, invoiceId: invoice.id, paymentId, status: 'CONFIRMED', source: 'PAYMENT', createdAt: `${date}T16:10:00+07:00`, seeded: true, seedBatch: 'DEMO_30_DAYS' }, actor, wid, 'DEMO_SEED', connection);
          const payment = await saveRecord('payments', { id: paymentId, code: paymentCode, date, counterparty: partner.name, counterpartyId: partner.id, direction: isOutput ? 'RECEIVED' : 'PAID', amount: paidAmount, allocatedAmount: paidAmount, unallocatedAmount: 0, accountId: account.id, accountName: account.name, transactionId: movement.id, status: 'ALLOCATED', createdAt: `${date}T16:10:00+07:00`, seeded: true, seedBatch: 'DEMO_30_DAYS' }, actor, wid, 'DEMO_SEED', connection);
          const allocation = await saveRecord('payment-allocations', { id: randomUUID(), invoiceId: invoice.id, paymentId, date, allocatedAmount: paidAmount, settlementAmount: paidAmount, discountAmount: 0, roundingAdjustment: 0, bankFeeAmount: 0, status: 'ACTIVE', createdAt: `${date}T16:10:00+07:00`, seeded: true, seedBatch: 'DEMO_30_DAYS' }, actor, wid, 'DEMO_SEED', connection);
          const current = (await connection.query("SELECT data FROM records WHERE workshop_id = ? AND entity = 'cash-accounts' AND record_id = ? FOR UPDATE", [wid, account.id]))[0][0];
          const cash = decodeData(current.data);
          await saveRecord('cash-accounts', { ...cash, balance: cash.balance + (isOutput ? paidAmount : -paidAmount) }, actor, wid, 'DEMO_SEED', connection);
          saved.push({ entity: 'payments', ...payment }, { entity: 'transactions', ...movement }, { entity: 'payment-allocations', ...allocation });
        }
        return saved;
      });
      rows.push(...newRows); created += 1;
    }
  }
  // Upgrade only seeded legacy invoices; keep existing totals and payment balances unchanged.
  for (const invoice of rows.filter((row) => row.entity === 'invoices' && (row.seeded || ['DEMO-HD-INPUT','DEMO-HD-OUTPUT'].includes(row.code)) && (!row.items?.length || !row.statusHistory?.length))) {
    if (!unlocked(invoice.date)) continue;
    const rate = invoice.subtotal ? Math.round(invoice.taxAmount / invoice.subtotal * 10000) / 100 : 0;
    const details = invoice.items?.length ? invoice.items : [{ name: invoice.direction === 'INPUT' ? 'Vật tư sản xuất theo hóa đơn' : 'Gia công tủ điện công nghiệp', unit: 'bộ', quantity: 1, unitPrice: invoice.subtotal, taxRate: rate, subtotal: invoice.subtotal, amount: invoice.subtotal, taxAmount: invoice.taxAmount }];
    await saveRecord('invoices', { ...invoice, seeded: true, items: details, statusHistory: invoice.statusHistory?.length ? invoice.statusHistory : [{ status: invoice.status, at: `${invoice.date}T09:00:00+07:00`, actor: 'Kế toán Demo', note: 'Tiếp nhận và kiểm tra chứng từ.' }, ...(invoice.paidAmount ? [{ status: invoice.paymentStatus, at: `${invoice.date}T16:00:00+07:00`, actor: 'Kế toán Demo', note: 'Phân bổ khoản thanh toán đã đối chiếu.' }] : [])] }, actor, wid, 'DEMO_SEED');
  }
  if (!find('materials', 'DEMO-VT-CANH-BAO')) await saveRecord('materials', { code: 'DEMO-VT-CANH-BAO', name: 'Đá cắt inox 125 mm', unit: 'viên', stock: 12, minStock: 30, unitCost: 18000, status: 'ACTIVE', seeded: true }, actor, wid, 'DEMO_SEED');
  const bom = find('boms', 'DEMO-BOM');
  for (const [code, name, progress, stage] of [['DEMO-SX-02', 'Bàn thao tác công nghiệp', 75, 'Kiểm tra chất lượng'], ['DEMO-SX-03', 'Kệ kho hạng nặng', 25, 'Cắt & chấn']]) {
    if (!find('production-orders', code)) await saveRecord('production-orders', { code, productName: name, quantity: 4, customerName: customer.name, status: 'IN_PROGRESS', progress, stage, assignedTo: workers[0]?.id || '', dueDate: shiftDay(today, 3), laborHours: 0, bom: bom ? structuredClone(bom) : undefined, seeded: true, date: today }, actor, wid, 'DEMO_SEED');
  }
  const job = find('production-orders', 'DEMO-SX');
  for (let index = 0; index < 10; index++) {
    const date = shiftDay(today, -index * 3), code = `DEMO-GIO-${date.replaceAll('-', '')}`;
    if (!find('labor-logs', code) && unlocked(date) && job) await saveRecord('labor-logs', { code, date, productionOrderId: job.id, employeeName: 'Thợ xưởng Demo', stage: 'Gia công & lắp ráp', hours: 4 + index % 3, hourlyRate: 65000, contributions: 0, salaryPaid: 0, status: 'CONFIRMED', seeded: true }, actor, wid, 'DEMO_SEED');
  }
  const [laborRows] = await getPool().query("SELECT data FROM records WHERE workshop_id = ? AND entity = 'labor-logs' AND COALESCE(data->>'status', '') <> 'CANCELLED'", [wid]);
  const totals = new Map();
  for (const row of laborRows) { const log = decodeData(row.data); totals.set(log.productionOrderId, (totals.get(log.productionOrderId) || 0) + Number(log.hours || 0)); }
  const [jobRows] = await getPool().query("SELECT data FROM records WHERE workshop_id = ? AND entity = 'production-orders'", [wid]);
  for (const row of jobRows) { const job = decodeData(row.data); if (job.seeded && job.laborHours !== (totals.get(job.id) || 0)) await saveRecord('production-orders', { ...job, laborHours: totals.get(job.id) || 0 }, actor, wid, 'DEMO_SEED'); }
  return { createdInvoices: created, from: shiftDay(today, -29), to: today };
}
