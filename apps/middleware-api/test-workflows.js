import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { calculateInvoice, invoiceDirection, allocationAmounts } from './src/accounting.js';
import { adaptSqlAndParams } from './src/db.js';

const base = process.env.TEST_API_URL || 'http://127.0.0.1:3002/api';
if (!base.includes(':3002/') && process.env.ALLOW_WORKFLOW_TEST_WRITES !== 'true') throw new Error('Use the isolated test API on port 3002, or explicitly set ALLOW_WORKFLOW_TEST_WRITES=true.');
const tag = `E2E-${Date.now()}`, date = '2026-10-27', results = [], tokens = {}, users = {};
const call = async (method, path, body, role = 'ACCOUNTANT', expected = 200) => {
  const response = await fetch(`${base}${path}`, { method, headers: { ...(tokens[role] ? { Authorization: `Bearer ${tokens[role]}` } : {}), ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) }, body: body ? body instanceof FormData ? body : JSON.stringify(body) : undefined });
  const data = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
  return data;
};
const create = (entity, body, role = 'ACCOUNTANT') => call('POST', `/${entity}`, body, role, 201);
const action = (entity, id, name, body = {}, role = 'ACCOUNTANT', expected = 200) => call('POST', `/${entity}/${id}/actions/${name}`, body, role, expected);
const row = async (entity, id) => (await call('GET', `/${entity}`)).find((item) => item.id === id);
async function check(name, fn) {
  try { await fn(); results.push({ name, result: 'PASS' }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, result: 'FAIL', error: error.message }); console.error(`FAIL ${name}: ${error.stack}`); }
}
let account, supplier, customer, invoice, payment, allocation, quote, revised, job, material, output, paidInvoice, paidPayment, paidAllocation;

await check('Money / aliases / SQL adapter regressions', async () => {
  assert.equal(calculateInvoice({ type: 'EXPENSE', subtotal: 100000, taxRate: 8 }).total, 108000);
  assert.equal(invoiceDirection({ type: 'INPUT', direction: 'INPUT' }), 'INPUT');
  assert.throws(() => invoiceDirection({ type: 'INPUT', direction: 'OUTPUT' }));
  assert.throws(() => calculateInvoice({ direction: 'INPUT', subtotal: 100, taxRate: 10, taxAmount: 17 }));
  assert.throws(() => allocationAmounts({ allocatedAmount: 100, discountAmount: 10 }));
  assert.deepEqual(adaptSqlAndParams('SELECT * FROM records WHERE workshop_id = ? AND entity IN (?) LIMIT ?', ['tenant', ['invoices', 'payments'], 10]).params, ['tenant', 'invoices', 'payments', 10]);
  assert.deepEqual(adaptSqlAndParams('SELECT $1', [1]).params, [1]);
});
await check('Login OWNER / ACCOUNTANT / WORKSHOP and RBAC 401/403', async () => {
  for (const [role, email] of [['OWNER', 'owner.workflow@fintax.demo'], ['ACCOUNTANT', 'accountant.workflow@fintax.demo'], ['WORKSHOP', 'workshop.workflow@fintax.demo']]) {
    const data = await call('POST', '/auth/login', { email, password: process.env.DEMO_PASSWORD || 'FinTax@2026' }, 'ANONYMOUS');
    tokens[role] = data.token; users[role] = data.user;
  }
  await call('GET', '/invoices', null, 'ANONYMOUS', 401);
  await call('GET', '/invoices', null, 'WORKSHOP', 403);
  await call('GET', '/users', null, 'ACCOUNTANT', 403);
  await call('POST', '/tax-rules', { code: tag }, 'ACCOUNTANT', 403);
});
await check('Idempotent TaxRules and 20 products/materials available', async () => {
  const rules = await call('GET', '/tax-rules'), products = await call('GET', '/products'), materials = await call('GET', '/materials');
  assert.ok(rules.some((rule) => rule.code === 'VAT_EXEMPT' && rule.taxTreatment === 'EXEMPT'));
  assert.ok(rules.some((rule) => rule.code === 'HKD_MANUFACTURE' && rule.vatRate === 3 && rule.pitRate === 1.5));
  assert.ok(products.length + materials.length >= 20);
  assert.equal(new Set(rules.map((rule) => rule.code)).size, rules.length);
});
await check('Create cash account and counterparties', async () => {
  account = await create('cash-accounts', { name: `${tag} ngân hàng`, type: 'BANK', openingBalance: 5000000, ownerScope: 'BUSINESS' });
  supplier = await create('suppliers', { code: `${tag}-NCC`, name: `${tag} NCC`, taxCode: '0312345678', payable: 0 });
  customer = await create('customers', { code: `${tag}-KH`, name: `${tag} KH`, taxCode: '0102345678', receivable: 0 });
});
await check('INPUT auto tax/total, Payable only, +/-5 tolerance and bad aliases', async () => {
  invoice = await create('invoices', { code: `${tag}-INPUT`, type: 'INPUT', counterparty: supplier.name, counterpartyId: supplier.id, subtotal: 100000, taxRate: 8, date });
  assert.equal(invoice.direction, 'INPUT'); assert.equal(invoice.type, 'INPUT'); assert.equal(invoice.taxAmount, 8000); assert.equal(invoice.total, 108000);
  assert.equal((await row('suppliers', supplier.id)).payable, 108000);
  assert.equal((await row('customers', customer.id)).receivable, 0);
  await call('POST', '/invoices', { code: `${tag}-WRONG`, direction: 'OUTPUT', type: 'INPUT', subtotal: 100, taxRate: 10 }, 'ACCOUNTANT', 400);
  await call('POST', '/invoices', { code: `${tag}-WRONG2`, direction: 'INPUT', subtotal: 100000, taxRate: 8, total: 108006 }, 'ACCOUNTANT', 400);
  const rounded = await create('invoices', { code: `${tag}-ROUND`, direction: 'INPUT', counterparty: supplier.name, subtotal: 100, taxRate: 10, taxAmount: 11, totalAmount: 114, date });
  assert.equal(rounded.total, 114);
  await call('DELETE', `/invoices/${rounded.id}`, { reason: 'Kiểm thử làm tròn' }, 'OWNER');
});
await check('Mixed line tax rules and OUTPUT mock tax code', async () => {
  const rules = await call('GET', '/tax-rules');
  output = await create('invoices', { code: `${tag}-OUTPUT`, direction: 'OUTPUT', counterparty: customer.name, counterpartyId: customer.id, date, items: [{ name: 'Dòng 8%', quantity: 2, unitPrice: 10000, taxRuleId: rules.find((rule) => rule.code === 'VAT_8').id }, { name: 'Dòng 5%', quantity: 1, unitPrice: 10000, taxRuleId: rules.find((rule) => rule.code === 'VAT_5').id }] });
  assert.equal(output.subtotal, 30000); assert.equal(output.taxAmount, 2100); assert.equal(output.total, 32100);
  const coded = await action('invoices', output.id, 'simulate-code'); assert.ok(coded.mockTaxCode);
  await action('invoices', invoice.id, 'simulate-code', {}, 'ACCOUNTANT', 400);
});
await check('Allocation discount + fee + rounding closes invoice without double counting', async () => {
  payment = await create('payments', { code: `${tag}-PAY`, amount: 107995, direction: 'PAID', accountId: account.id, counterparty: supplier.name, date });
  await call('POST', '/payment-allocations', { paymentId: payment.id, invoiceId: invoice.id, allocatedAmount: 107995, discountAmount: 4, roundingAdjustment: 1 }, 'ACCOUNTANT', 400);
  allocation = await create('payment-allocations', { paymentId: payment.id, invoiceId: invoice.id, allocatedAmount: 107995, discountAmount: 4, bankFeeAmount: 3, roundingAdjustment: 1, writeOffReason: 'Chiết khấu + phí NH riêng + làm tròn' });
  const value = await row('invoices', invoice.id); assert.equal(value.paymentStatus, 'PAID'); assert.equal(value.openBalance, 0); assert.equal(value.paidAmount, 107995); assert.equal(value.settledAmount, 108000);
  assert.equal((await row('suppliers', supplier.id)).payable, 0);
  assert.equal((await row('cash-accounts', account.id)).balance, 5000000 - 107995 - 3);
  assert.equal((await row('payments', payment.id)).unallocatedAmount, 0);
});
await check('Direct paid cancellation blocked; accountant unallocates; repeat rejected', async () => {
  await call('DELETE', `/invoices/${invoice.id}`, { reason: 'Hủy trực tiếp' }, 'OWNER', 409);
  await action('payment-allocations', allocation.id, 'unallocate', {}, 'ACCOUNTANT', 400);
  await action('payment-allocations', allocation.id, 'unallocate', { reason: 'Gỡ để sửa hóa đơn' });
  assert.equal((await row('payments', payment.id)).unallocatedAmount, payment.amount);
  assert.equal((await row('invoices', invoice.id)).openBalance, 108000);
  assert.equal((await row('suppliers', supplier.id)).payable, 108000);
  assert.equal((await row('cash-accounts', account.id)).balance, 5000000 - 107995);
  await action('payment-allocations', allocation.id, 'unallocate', { reason: 'Gỡ lặp' }, 'ACCOUNTANT', 409);
  await call('DELETE', `/invoices/${invoice.id}`, { reason: 'Hủy sau gỡ phân bổ' }, 'OWNER');
  assert.equal((await row('suppliers', supplier.id)).payable, 0);
});
await check('Owner auto-unallocate + void is atomic and audited', async () => {
  paidInvoice = await create('invoices', { code: `${tag}-AUTO`, direction: 'INPUT', counterparty: supplier.name, subtotal: 1000, taxRate: 0, date });
  paidPayment = await create('payments', { code: `${tag}-AUTO-PAY`, amount: 1000, direction: 'PAID', accountId: account.id, counterparty: supplier.name, date });
  paidAllocation = await create('payment-allocations', { invoiceId: paidInvoice.id, paymentId: paidPayment.id, allocatedAmount: 1000 });
  await call('DELETE', `/invoices/${paidInvoice.id}`, { reason: 'Owner hủy tự động', autoUnallocate: true }, 'ACCOUNTANT', 403);
  await call('DELETE', `/invoices/${paidInvoice.id}`, { reason: 'Owner hủy tự động', autoUnallocate: true }, 'OWNER');
  assert.equal((await row('payments', paidPayment.id)).unallocatedAmount, 1000);
  assert.equal((await row('invoices', paidInvoice.id)).openBalance, 0);
  const logs = await call('GET', '/audit-logs', null, 'OWNER');
  assert.ok(logs.some((log) => log.action === 'INVOICE_VOIDED' && log.recordId === paidInvoice.id && log.reason && log.role === 'OWNER' && log.beforeData && log.afterData));
});
await check('Rejected quotation clones BOM/items/labor/machine into draft v2', async () => {
  quote = await create('quotations', { code: `${tag}-BG`, customerName: customer.name, title: 'Tủ điện', quantity: 2, unitPrice: 500000, date, materialCost: 300000, laborHours: 2, laborRate: 50000, machineCost: 50000, bom: { materials: [{ name: 'Thép', quantity: 5 }], waste: 0.05 }, items: [{ name: 'Tủ điện', quantity: 2, unitPrice: 500000 }] });
  await action('quotations', quote.id, 'submit-for-approval');
  await action('quotations', quote.id, 'approve', {}, 'ACCOUNTANT', 403);
  await action('quotations', quote.id, 'reject', { note: 'Giảm chi phí máy và rà soát định mức' }, 'OWNER');
  revised = await action('quotations', quote.id, 'revise', {}, 'ACCOUNTANT', 201);
  assert.equal(revised.status, 'DRAFT'); assert.equal(revised.version, 2); assert.equal(revised.parentQuoteId, quote.id); assert.equal(revised.code, `${tag}-BG-v2`);
  assert.deepEqual(revised.bom, quote.bom); assert.deepEqual(revised.items, quote.items); assert.equal(revised.laborHours, 2); assert.equal(revised.machineCost, 50000); assert.ok(revised.sourceRejectionNote);
  assert.equal((await row('quotations', quote.id)).status, 'REJECTED');
  await action('quotations', revised.id, 'submit-for-approval'); await action('quotations', revised.id, 'approve', {}, 'OWNER'); await action('quotations', revised.id, 'mark-sent'); await action('quotations', revised.id, 'accept');
  const created = await action('quotations', revised.id, 'create-production', { assignedTo: users.WORKSHOP.id }); job = created.createdProduction;
});
await check('Workshop assigned orders, stock ISSUE/RETURN/WASTE, overdraw, labor', async () => {
  const visible = await call('GET', '/production-orders', null, 'WORKSHOP'); assert.ok(visible.some((item) => item.id === job.id));
  const hidden = await create('production-orders', { code: `${tag}-HIDDEN`, productName: 'Ẩn', assignedTo: '' });
  await action('production-orders', hidden.id, 'start', {}, 'WORKSHOP', 403);
  material = await create('materials', { code: `${tag}-MAT`, name: `${tag} Thép`, stock: 0, unit:'kg', unitCost: 22000 });
  await create('stock-movements',{code:`${tag}-OPENING`,materialId:material.id,type:'OPENING',quantity:20,unitCost:22000,date,note:'Tồn đầu kỳ kiểm thử'},'OWNER');
  await action('production-orders',job.id,'start',{},'WORKSHOP');
  for (const [type, quantity] of [['ISSUE', 2], ['RETURN', 1], ['WASTE', 1]]) await create('stock-movements', { code: `${tag}-${type}`, materialId: material.id, type, quantity, productionOrderId: job.id, date }, 'WORKSHOP');
  assert.equal((await row('materials', material.id)).stock, 18);
  await call('POST', '/stock-movements', { materialId: material.id, type: 'ISSUE', quantity: 1000, productionOrderId: job.id, date }, 'WORKSHOP', 409);
  await create('labor-logs', { productionOrderId: job.id, hours: 2, hourlyRate: 50000, date }, 'WORKSHOP');
  await action('production-orders', job.id, 'complete', {}, 'WORKSHOP'); assert.equal((await row('production-orders', job.id)).progress, 100);
});
await check('Statement preview duplicates/errors, commit, reconcile and seven ledgers', async () => {
  const form = new FormData(); form.append('file', new Blob([`date,description,credit,reference\n${date},${tag} thu,250000,${tag}-ST\n${date},${tag} thu,250000,${tag}-ST\ninvalid,error,abc,${tag}-ERR\n`], { type: 'text/csv' }), 'statement.csv');
  const preview = await call('POST', '/import/transactions/preview', form); assert.ok(preview.duplicateCount >= 1); assert.ok(preview.errorCount >= 1);
  const committed = await call('POST', `/import/transactions/${preview.importId}/commit`, { accountId: account.id }); assert.equal(committed.createdCount, 1);
  const reconciliation = await create('reconciliations', { code: `${tag}-DS`, invoiceAmount: 100, paymentAmount: 99, date });
  await action('reconciliations', reconciliation.id, 'confirm', {}, 'ACCOUNTANT', 409);
  const books = await call('GET', `/reports/books?from=2026-10-01&to=2026-10-31`); assert.equal(books.books.length, 7);
  assert.ok(books.books.find((book) => book.code === 'S2-HKD').rows.some((item) => item.materialId === material.id && item.closing === 18));
  assert.ok(books.books.find((book) => book.code === 'S5-HKD').rows.some((item) => item.productionOrderId === job.id && item.salary === 100000));
  const cashBook = books.books.find((book) => book.code === 'S7-HKD').rows.filter((item) => item.accountName === account.name); assert.equal(cashBook.at(-1).balance, (await row('cash-accounts', account.id)).balance);
});
await check('Locked period blocks create/update/re-date/allocate/unallocate/void', async () => {
  const lockInvoice = await create('invoices', { code: `${tag}-LOCK`, direction: 'INPUT', counterparty: supplier.name, subtotal: 100, taxRate: 0, date });
  const lockPayment = await create('payments', { code: `${tag}-LOCK-PAY`, direction: 'PAID', counterparty: supplier.name, amount: 100, accountId: account.id, date });
  const lockAllocation = await create('payment-allocations', { paymentId: lockPayment.id, invoiceId: lockInvoice.id, allocatedAmount: 50 });
  const period = await create('tax-periods', { name: `${tag}-Kỳ`, startDate: '2026-10-01', endDate: '2026-10-31', status: 'OPEN' }, 'OWNER');
  try {
    await action('tax-periods', period.id, 'lock', {}, 'OWNER');
    await call('POST', '/invoices', { code: `${tag}-LOCK-FAIL`, direction: 'INPUT', subtotal: 10, taxRate: 0, date }, 'ACCOUNTANT', 409);
    await call('PUT', `/invoices/${output.id}`, { date: '2026-11-01' }, 'ACCOUNTANT', 409);
    await create('invoices', { code: `${tag}-NEXT`, direction: 'INPUT', counterparty: supplier.name, subtotal: 10, taxRate: 0, date: '2026-11-01' });
    await action('payment-allocations', lockAllocation.id, 'unallocate', { reason: 'Thử kỳ khóa' }, 'ACCOUNTANT', 409);
    await call('POST', '/payment-allocations', { paymentId: lockPayment.id, invoiceId: lockInvoice.id, allocatedAmount: 50 }, 'ACCOUNTANT', 409);
    await call('DELETE', `/invoices/${lockInvoice.id}`, { reason: 'Thử kỳ khóa', autoUnallocate: true }, 'OWNER', 409);
    await action('tax-periods', period.id, 'unlock', {}, 'OWNER', 400);
  } finally { await action('tax-periods', period.id, 'unlock', { note: 'Kết thúc kiểm thử kỳ khóa' }, 'OWNER'); }
});
await check('Dashboard TTL avoids audit writes; transaction invalidates cache', async () => {
  const before = await call('GET', '/dashboard'), logsBefore = await call('GET', '/audit-logs', null, 'OWNER');
  const cached = await call('GET', '/dashboard'); assert.deepEqual(cached.metrics, before.metrics);
  assert.equal((await call('GET', '/audit-logs', null, 'OWNER')).length, logsBefore.length);
  await create('transactions', { date, description: `${tag} thu kiểm cache`, direction: 'INCOME', classification: 'BUSINESS_INCOME', accountId: account.id, amount: 100 });
  assert.equal((await call('GET', '/dashboard')).metrics.revenue, before.metrics.revenue + 100);
});
await check('Offline registration durable queue, approval stays pending sync, login blocked', async () => {
  if (process.env.EXPECT_ODOO_OFFLINE !== 'true') return;
  const legacy=await call('POST','/auth/login',{email:'owner@fintax.demo',password:process.env.DEMO_PASSWORD||'FinTax@2026'},'ANONYMOUS'); tokens.OWNER=legacy.token;
  const email = `${tag.toLowerCase()}@fintax.invalid`, password = 'FinTaxTest@2026';
  const registered = await call('POST', '/auth/register', { email, name: 'Kiểm thử đăng ký', password }, 'ANONYMOUS', 201);
  assert.equal(registered.approvalStatus, 'PENDING_OWNER'); assert.equal(registered.odooSyncStatus, 'PENDING_SYNC');
  await call('POST', '/auth/login', { email, password }, 'ANONYMOUS', 403);
  const user = (await call('GET', '/users', null, 'OWNER')).find((item) => item.email === email); assert.equal(user.active, false);
  const queue = await call('GET', '/integrations/odoo/queue', null, 'OWNER'); assert.ok(queue.some((item) => item.record_id === user.id && item.status === 'PENDING_RETRY'));
  const approved = await call('PATCH', `/users/${user.id}/status`, { active: true }, 'OWNER'); assert.equal(approved.active, false); assert.equal(approved.approvalStatus, 'APPROVED');
  await call('POST', '/auth/login', { email, password }, 'ANONYMOUS', 403);
  await writeFile(new URL('./test-registration.json', import.meta.url), JSON.stringify({ id: user.id, email, password }));
});
console.table(results.map(({ name, result }) => ({ name, result })));
await writeFile(new URL('./test-results.json', import.meta.url), JSON.stringify({ tag, at: new Date().toISOString(), base, results }, null, 2));
if (results.some((result) => result.result === 'FAIL')) process.exitCode = 1;
