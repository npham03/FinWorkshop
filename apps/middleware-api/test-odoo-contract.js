import 'dotenv/config';
import assert from 'node:assert/strict';
import xmlrpc from 'xmlrpc';
import { randomUUID } from 'node:crypto';
import { initDb, getPool, saveRecord, listRecords, DEFAULT_WORKSHOP_ID } from './src/db.js';
import { syncOdooInvoice, syncOdooPayment, syncOdooQuotation, syncOdooAllocation, syncOdooAdjustment } from './src/odoo-documents.js';

if (process.env.DB_NAME !== 'finworkshop_upgrade_test') throw new Error('Requires isolated finworkshop_upgrade_test database.');
process.env.ODOO_URL = 'http://127.0.0.1:8089';
process.env.ODOO_DB = 'contract'; process.env.ODOO_USERNAME = 'contract'; process.env.ODOO_PASSWORD = 'contract';
const calls = [], records = new Map(); let nextId = 500, currencyActive = true;
const server = xmlrpc.createServer({ host: '127.0.0.1', port: 8089 });
server.on('authenticate', (_error, _args, callback) => callback(null, 1));
server.on('execute_kw', (_error, params, callback) => {
  const [, , , model, method, args, kwargs] = params;
  calls.push({ model, method, args, kwargs });
  let result;
  if (method === 'search_read') {
    if (model === 'res.company') result = [{ id: 1, currency_id: [2, 'USD'] }];
    else if (model === 'res.currency.rate') result = [{id:1,name:'2026-10-27',rate:26050,currency_id:[24,'VND']},{id:2,name:'2026-10-27',rate:1,currency_id:[2,'USD']}];
    else if (model === 'res.currency') result = [{ id: 24, active: currencyActive }];
    else if (model === 'account.journal') result = [{ id: 3, default_account_id: [26, 'Expenses'] }];
    else if (model === 'account.tax') result = [{ id: 80, amount: 8 }, { id: 50, amount: 5 }];
    else if (model === 'account.payment.method.line') result = [{ id: 7 }];
    else if (model === 'product.pricelist') result = [{ id: 24 }];
    else { const key = args[0]?.find((term) => term[0] === 'fintax_source_key')?.[2]; const row = records.get(`${model}:${key}`); result = row ? [row] : []; }
  } else if (method === 'get_param') result=JSON.stringify({source:'https://portal.vietcombank.com.vn/Usercontrols/TVPortal.TyGia/pXML.aspx',side:'SELL',date:'2026-10-27',vndPerBaseUnit:26050});
  else if (method === 'create') {
    result = nextId++; records.set(`${model}:${args[0].fintax_source_key}`, { id: result, state: 'draft', ...args[0] });
  } else if (method === 'fintax_sync_adjustment') result = nextId++;
  else result = true;
  callback(null, result);
});
try {
  await initDb();
  const id = randomUUID(), wid = DEFAULT_WORKSHOP_ID;
  const invoice = await saveRecord('invoices', { id, code: `CONTRACT-${id.slice(0, 8)}`, direction: 'INPUT', counterparty: 'Contract vendor', date: '2026-10-27', subtotal: 100000, taxRate: 8, taxAmount: 8000, total: 108000, totalAmount: 108000, workshopId: wid }, 'test', wid, 'DEMO_SEED');
  const native = await syncOdooInvoice(invoice, `invoices:${id}`);
  assert.equal(calls.find((call) => call.model === 'account.move' && call.method === 'create').args[0].move_type, 'in_invoice');
  assert.equal(calls.find((call) => call.model === 'account.move' && call.method === 'create').args[0].currency_id, 24);
  await syncOdooInvoice(invoice, `invoices:${id}`);
  const update = calls.filter((call) => call.model === 'account.move' && call.method === 'write').at(-1);
  assert.deepEqual(update.args[1].invoice_line_ids[0], [5, 0, 0]);
  assert.equal(calls.filter((call) => call.model === 'account.move' && call.method === 'create').length, 1);
  currencyActive = false;
  await assert.rejects(syncOdooInvoice({ ...invoice, id: randomUUID() }, `invoices:${randomUUID()}`), (error) => error.code === 'PENDING_MAPPING' && /VND/.test(error.message));
  currencyActive = true;
  await assert.rejects(syncOdooInvoice({ ...invoice, taxMode: 'HKD_REVENUE' }, 'invoices:hkd'), /HKD/);
  const account = (await listRecords('cash-accounts', wid))[0];
  const paymentId = randomUUID();
  await syncOdooPayment({ id: paymentId, code: `CONTRACT-PAY-${paymentId.slice(0, 6)}`, direction: 'PAID', accountId: account.id, amount: 107995, counterparty: invoice.counterparty, workshopId: wid, date: invoice.date }, `payments:${paymentId}`);
  await syncOdooQuotation({ id: randomUUID(), code: 'CONTRACT-QUOTE', customerName: 'Contract customer', quantity: 1, unitPrice: 100, subtotal: 100, total: 100, workshopId: wid }, `quotations:${randomUUID()}`);
  const allocation = { id: randomUUID(), invoiceId: id, paymentId, allocatedAmount: 107995, discountAmount: 4, roundingAdjustment: 1, status: 'ACTIVE', workshopId: wid };
  await syncOdooAdjustment({ ...allocation, writeOffReason: 'Contract write-off' }, `accounting-adjustments:${allocation.id}`);
  await syncOdooAllocation(allocation, `payment-allocations:${allocation.id}`);
  await syncOdooAllocation({ ...allocation, status: 'UNALLOCATED' }, `payment-allocations:${allocation.id}`);
  await syncOdooInvoice({ ...invoice, status: 'CANCELLED' }, `invoices:${id}`);
  assert.ok(calls.some((call) => call.method === 'fintax_sync_allocation' && call.args[2].status === 'UNALLOCATED'));
  assert.ok(calls.some((call) => call.method === 'fintax_cancel_invoice' && call.args[0][0] === native.id));
  console.log('PASS XML-RPC contract: INPUT in_invoice, VND, tax match, idempotent lines, quote/payment, adjustment, unreconcile and cancel');
} finally { await new Promise((resolve) => server.close(resolve)); await getPool().end(); }
