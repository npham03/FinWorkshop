import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { initDb, getPool, createWorkshop, getWorkshop, listRecords, saveRecord } from './db.js';
import { seedWorkshopCatalog } from './seed.js';
import { normalizeInvoice, updateInvoicePartner, allocatePayment, transaction } from './workflows.js';
import { businessDate } from './accounting.js';

export const WORKFLOW_DEMO_ID = '00000000-0000-0000-0000-000000000002';
export async function seedWorkflows() {
  const wid = WORKFLOW_DEMO_ID, name = 'Xưởng Demo Kiểm thử FinWorkshop', date = businessDate();
  const workshop = await getWorkshop(wid);
  if (workshop && workshop.name !== name) throw new Error('Demo workshop ID is already in use by another workshop.');
  if (!workshop) await createWorkshop({ id: wid, name, code: 'WORKFLOW-DEMO' });
  if(!workshop?.settings?.accountingRegime) await getPool().query("UPDATE workshops SET settings=CAST(? AS JSON) WHERE id=?",[JSON.stringify({accountingRegime:'DEMO',taxMethod:'MIXED_DEMO',currency:'VND'}),wid]);
  const actor = { id: 'workflow-seed', name: 'FinWorkshop Demo Seed', role: 'OWNER', workshopId: wid };
  const passwordHash = await bcrypt.hash(process.env.DEMO_PASSWORD || 'FinTax@2026', 12);
  const users = [];
  for (const [email, fullName, role] of [['owner.workflow@fintax.demo', 'Chủ xưởng Demo', 'OWNER'], ['accountant.workflow@fintax.demo', 'Kế toán Demo', 'ACCOUNTANT'], ['warehouse.workflow@fintax.demo','Thủ kho Demo','WAREHOUSE'], ['workshop.workflow@fintax.demo', 'Thợ xưởng Demo', 'WORKSHOP']]) {
    await getPool().query("INSERT INTO users (id, workshop_id, email, full_name, role, password_hash, active, approval_status) VALUES (?, ?, ?, ?, ?, ?, TRUE, 'APPROVED') ON CONFLICT (email) DO NOTHING", [randomUUID(), wid, email, fullName, role, passwordHash]);
    const [rows] = await getPool().query('SELECT id, role FROM users WHERE email = ? AND workshop_id = ?', [email, wid]);
    if (!rows[0]) throw new Error(`Demo email ${email} is already in use by another workshop.`);
    users.push(rows[0]);
  }
  await seedWorkshopCatalog(wid, { demo: true });
  if ((await listRecords('classification-rules', wid)).some((row) => row.code === 'DEMO-SEED-COMPLETE')) return { workshopId: wid, status: 'ALREADY_SEEDED' };
  const put = async (entity, code, data) => {
    const existing = (await listRecords(entity, wid)).find((row) => row.code === code);
    return existing || saveRecord(entity, { ...data, code, date, seeded: true, workshopId: wid }, actor.id, wid, 'DEMO_SEED');
  };
  const cash = await put('cash-accounts', 'DEMO-CASH', { name: 'Quỹ tiền mặt Demo', type: 'CASH', ownerScope: 'BUSINESS', openingBalance: 50000000, balance: 50000000, status: 'ACTIVE' });
  const bank = await put('cash-accounts', 'DEMO-BANK-1', { name: 'Vietcombank Demo', type: 'BANK', bankName: 'Vietcombank', maskedAccountNo: '***2026', ownerScope: 'BUSINESS', openingBalance: 100000000, balance: 100000000, status: 'ACTIVE' });
  await put('cash-accounts', 'DEMO-BANK-2', { name: 'Techcombank Demo', type: 'BANK', bankName: 'Techcombank', maskedAccountNo: '***8888', ownerScope: 'BUSINESS', openingBalance: 80000000, balance: 80000000, status: 'ACTIVE' });
  const supplier = await put('suppliers', 'DEMO-NCC', { name: 'Nhà cung cấp vật tư Demo', taxCode: '0312345678', payable: 0, status: 'ACTIVE' });
  const customer = await put('customers', 'DEMO-KH', { name: 'Khách hàng sản xuất Demo', taxCode: '0102345678', receivable: 0, status: 'ACTIVE' });
  const material = (await listRecords('materials', wid)).find((row) => row.code === 'MAT-STL-SS400');
  const bom = await put('boms', 'DEMO-BOM', { productName: 'Tủ điện Demo', version: 1, items: [{ materialId: material.id, name: material.name, quantity: 5, unitCost: material.unitCost }], materialCost: 110000, laborHours: 2, laborRate: 50000, laborCost: 100000, machineCost: 50000, wasteRate: 0.05, marginRate: 0.2, status: 'ACTIVE' });
  for (const status of ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'ACCEPTED']) await put('quotations', `DEMO-BG-${status}`, { customerName: customer.name, title: 'Tủ điện Demo', quantity: 2, unitPrice: 500000, subtotal: 1000000, taxAmount: 100000, total: 1100000, taxRate: 10, version: 1, bomId: bom.id, bom: structuredClone(bom), materialCost: 110000, laborHours: 2, laborRate: 50000, machineCost: 50000, wasteRate: 0.05, marginRate: 0.2, items: [{ name: 'Tủ điện Demo', quantity: 2, unitPrice: 500000 }], status, rejectionNote: status === 'REJECTED' ? 'Giảm chi phí máy và bổ sung vật tư vào định mức.' : '' });
  const job = await put('production-orders', 'DEMO-SX', { productName: 'Tủ điện Demo', customerName: customer.name, quantity: 2, assignedTo: users.find((user) => user.role === 'WORKSHOP').id, stage: 'Lắp ráp', progress: 50, status: 'IN_PROGRESS', laborHours: 2, laborRate: 50000 });
  for (const [type, quantity] of [['ISSUE', 5], ['RETURN', 1], ['WASTE', 1]]) {
    const code = `DEMO-KHO-${type}`;
    if ((await listRecords('stock-movements', wid)).some((row) => row.code === code)) continue;
    await transaction(wid, async (connection) => {
      const current = (await listRecords('materials', wid, connection)).find((row) => row.id === material.id);
      await saveRecord('stock-movements', { code, materialId: material.id, materialName: material.name, type, quantity, productionOrderId: job.id, date, status: 'CONFIRMED' }, actor.id, wid, 'DEMO_SEED', connection);
      await saveRecord('materials', { ...current, stock: current.stock + (type === 'RETURN' ? quantity : -quantity) }, actor.id, wid, 'DEMO_SEED', connection);
    });
  }
  await put('labor-logs', 'DEMO-LABOR', { productionOrderId: job.id, employeeName: 'Thợ xưởng Demo', stage: 'Lắp ráp', hours: 2, hourlyRate: 50000, salaryPaid: 0, contributions: 10000, status: 'CONFIRMED' });
  async function invoice(code, direction, partner, subtotal) {
    const existing = (await listRecords('invoices', wid)).find((row) => row.code === code);
    if (existing) return existing;
    const data = await normalizeInvoice({ code, direction, counterpartyId: partner.id, counterparty: partner.name, taxCode: partner.taxCode, subtotal, taxRate: 10, date }, wid);
    return transaction(wid, async (connection) => {
      const saved = await saveRecord('invoices', { ...data, paidAmount: 0, settledAmount: 0, openBalance: data.total, paymentStatus: 'UNPAID', status: 'REVIEW_REQUIRED' }, actor.id, wid, 'DEMO_SEED', connection);
      await updateInvoicePartner(connection, actor.id, saved, saved.total, wid);
      return saved;
    });
  }
  const input = await invoice('DEMO-HD-INPUT', 'INPUT', supplier, 1000000), output = await invoice('DEMO-HD-OUTPUT', 'OUTPUT', customer, 2000000);
  async function payment(code, direction, partner, amount, account) {
    const existing = (await listRecords('payments', wid)).find((row) => row.code === code);
    if (existing) return existing;
    return transaction(wid, async (connection) => {
      const saved = await saveRecord('payments', { code, direction, counterparty: partner.name, amount, accountId: account.id, accountName: account.name, allocatedAmount: 0, unallocatedAmount: amount, status: 'CONFIRMED', date }, actor.id, wid, 'DEMO_SEED', connection);
      const txn = await saveRecord('transactions', { code: `${code}-TX`, date, paymentId: saved.id, direction: direction === 'PAID' ? 'EXPENSE' : 'INCOME', classification: direction === 'PAID' ? 'BUSINESS_EXPENSE' : 'BUSINESS_INCOME', counterparty: partner.name, description: `Thanh toán mẫu ${code}`, amount, accountId: account.id, accountName: account.name, status: 'CONFIRMED' }, actor.id, wid, 'DEMO_SEED', connection);
      const current = (await listRecords('cash-accounts', wid, connection)).find((row) => row.id === account.id);
      await saveRecord('cash-accounts', { ...current, balance: current.balance + (direction === 'PAID' ? -amount : amount) }, actor.id, wid, 'DEMO_SEED', connection);
      return saveRecord('payments', { ...saved, transactionId: txn.id }, actor.id, wid, 'DEMO_SEED', connection);
    });
  }
  const outgoing = await payment('DEMO-PHIEU-CHI', 'PAID', supplier, 1099995, bank), incoming = await payment('DEMO-PHIEU-THU', 'RECEIVED', customer, 1000000, cash);
  if (!(await listRecords('payment-allocations', wid)).some((row) => row.paymentId === outgoing.id)) await allocatePayment({ paymentId: outgoing.id, invoiceId: input.id, allocatedAmount: 1099995, roundingAdjustment: 5, bankFeeAmount: 1000, writeOffReason: 'Làm tròn hóa đơn và phí ngân hàng chi riêng — dữ liệu Demo' }, actor);
  if (!(await listRecords('payment-allocations', wid)).some((row) => row.paymentId === incoming.id)) await allocatePayment({ paymentId: incoming.id, invoiceId: output.id, allocatedAmount: 1000000 }, actor);
  await put('reconciliations', 'DEMO-DOI-SOAT', { counterparty: supplier.name, invoiceId: input.id, paymentId: outgoing.id, period: date.slice(0, 7), invoiceAmount: input.total, paymentAmount: input.total, status: 'MATCHED', note: 'Đã đối chiếu thanh toán, làm tròn 5 đồng và phí NH riêng.' });
  await put('tax-periods', 'DEMO-KY', { name: `Kỳ ${date.slice(0, 7)}`, startDate: `${date.slice(0, 7)}-01`, endDate: `${date.slice(0, 7)}-${new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0).getDate()}`, status: 'OPEN' });
  await put('classification-rules', 'DEMO-SEED-COMPLETE', { name: 'Thu bán hàng Demo', keyword: 'bán hàng', matchField: 'description', classification: 'BUSINESS_INCOME', confidence: 90, status: 'ACTIVE' });
  return { workshopId: wid, status: 'SEEDED', users: ['owner.workflow@fintax.demo', 'accountant.workflow@fintax.demo', 'workshop.workflow@fintax.demo'] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await initDb(); const base = await seedWorkflows(); const { seedThirtyDays } = await import('./seed-thirty-days.js'); console.log(JSON.stringify({ ...base, timeline: await seedThirtyDays(WORKFLOW_DEMO_ID) }, null, 2)); }
  finally { await getPool().end(); }
}
