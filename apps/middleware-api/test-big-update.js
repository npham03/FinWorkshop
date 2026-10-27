import 'dotenv/config';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { initDb, getPool, decodeData } from './src/db.js';
import { normalizeInvoice } from './src/workflows.js';
import { booksFromData } from './src/ledgers.js';
import { dashboardSnapshot, dateRange, shiftDay } from './src/dashboard.js';
import { businessDate } from './src/accounting.js';
import { seedThirtyDays } from './src/seed-thirty-days.js';

if (process.env.DB_NAME !== 'finworkshop_big_update_test') throw new Error('Use the isolated finworkshop_big_update_test database.');
const base = process.env.TEST_API_URL || 'http://127.0.0.1:3002/api';
assert.ok(base.includes(':3002/'));
const wid = '00000000-0000-0000-0000-000000000002';
const today = businessDate(), from = `${today.slice(0,7)}-01`, headers = {};
async function call(path, token = headers.token, expected = 200) {
  const response = await fetch(base + path,{ headers:{ Authorization:`Bearer ${token}` } });
  const data = await response.json(); assert.equal(response.status,expected,JSON.stringify(data)); return data;
}
async function login(email) {
  const res = await fetch(`${base}/auth/login`,{ method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:process.env.DEMO_PASSWORD || 'FinTax@2026'}) });
  assert.equal(res.status,200);return (await res.json()).token;
}
await initDb();
try {
  headers.token = await login('owner.workflow@fintax.demo');
  const entities = ['invoices','transactions','cash-accounts','customers','suppliers','materials','production-orders','labor-logs','payment-allocations','tax-rules','tax-periods'];
  const data = Object.fromEntries(await Promise.all(entities.map(async (entity) => [entity,await call(`/${entity}`)])));
  const [adjustments] = await getPool().query("SELECT record_id,data FROM records WHERE workshop_id = ? AND entity = 'accounting-adjustments'",[wid]);
  data['accounting-adjustments'] = adjustments.map((row)=>({...decodeData(row.data),id:row.record_id}));
  const demoInvoices = data.invoices.filter((row) => row.seedBatch === 'DEMO_30_DAYS');
  assert.equal(demoInvoices.length,60); assert.equal(new Set(demoInvoices.map((row) => row.date)).size,30);
  for(const row of data.invoices) {
    assert.ok(row.items.length && row.statusHistory.length,`${row.code} must have items/history`);
    assert.equal(row.items.reduce((sum,item) => sum+item.subtotal,0),row.subtotal);
    assert.equal(row.subtotal+row.taxAmount-(row.discountAmount||0)+(row.roundingAdjustment||0),row.total);
    assert.equal(row.total-(row.settledAmount ?? row.paidAmount ?? 0),row.openBalance);
  }
  const books = (await call(`/reports/books?from=${from}&to=${today}`)).books;
  const dashboard = await call(`/dashboard?from=${from}&to=${today}&chartFrom=${shiftDay(today,-29)}&chartTo=${today}`);
  const sum = (rows,key) => rows.reduce((sum,row) => sum+Number(row[key]||0),0);
  assert.equal(dashboard.trend.length,30);
  assert.equal(dashboard.metrics.netRevenue,sum(books.find((row)=>row.code==='S1-HKD').rows,'revenue'));
  assert.equal(dashboard.metrics.operatingCost,sum(books.find((row)=>row.code==='S3-HKD').rows,'expense'));
  assert.equal(dashboard.metrics.taxLiability,Math.max(0,books.find((row)=>row.code==='S4-HKD').rows.at(-1).taxDue));
  assert.equal(dashboard.metrics.receivable,sum(data.customers,'receivable'));
  assert.equal(dashboard.metrics.payable,sum(data.suppliers,'payable'));
  assert.equal(dashboard.trend.at(-1).balance,dashboard.metrics.balance);
  for(const [code,key] of [['S6-HKD','cashBalance'],['S7-HKD','bankBalance']]) {
    const last = new Map(books.find((row)=>row.code===code).rows.map((row)=>[row.accountName,row.balance]));
    assert.equal([...last.values()].reduce((sum,value)=>sum+value,0),dashboard.metrics[key]);
  }
  const totals = data['cash-accounts'].map((row)=>({id:row.id,balance:row.balance}));
  const result = await seedThirtyDays(wid); assert.equal(result.createdInvoices,0);
  assert.deepEqual((await call('/cash-accounts')).map((row)=>({id:row.id,balance:row.balance})),totals);
  console.log('PASS 60 invoice items/history, 30-day seed idempotency, cash balances, dashboard versus all financial ledgers');

  for(const rule of data['tax-rules'].filter((row)=>row.taxMode==='HKD_REVENUE')) {
    const result = await normalizeInvoice({direction:'OUTPUT',date:today,subtotal:1000000,taxRuleId:rule.id},wid);
    assert.equal(result.taxRate,rule.taxRate); assert.equal(result.taxAmount,Math.round(1000000*rule.taxRate/100));
  }
  const material = data.materials.find((row)=>row.code==='MAT-STL-SS400');
  const custom = await normalizeInvoice({direction:'INPUT',date:today,items:[{materialId:material.id,quantity:2,unitPrice:100000,taxRuleId:'',taxRate:5}]},wid);
  assert.equal(custom.taxAmount,10000);
  const sample = {invoices:[{id:'mixed',direction:'OUTPUT',date:today,subtotal:200000,taxAmount:12500,items:[{subtotal:100000,taxAmount:4500,taxMode:'HKD_REVENUE',vatRate:3,pitRate:1.5},{subtotal:100000,taxAmount:8000,taxMode:'VAT_CREDIT'}]}]};
  const tax = booksFromData(sample).books.find((row)=>row.code==='S4-HKD').rows[0];
  assert.equal(tax.vatOutput,11000);assert.equal(tax.pit,1500);assert.equal(tax.taxDue,12500);
  console.log('PASS HKD rates are not double counted; mixed VAT/HKD ledger preserves both tax components');

  const module = {exports:{},Intl,Date};
  const file = new URL('../web-client/src/presentation.ts',import.meta.url);
  vm.runInNewContext(ts.transpileModule(await fs.readFile(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,module);
  const ui = module.exports;
  for(const max of [0,1,7,100,999,1000,1200000,1500000,9500000,10000000,55000000,1500000000]) {
    const ticks = ui.moneyTicks(max), labels = ticks.map((value)=>ui.formatAxisMoney(value,max));
    assert.equal(new Set(labels).size,5,JSON.stringify({max,labels}));assert.ok(ticks.at(-1)>=max);
  }
  assert.equal(ui.formatMoney(2200000),'2.200.000 ₫');assert.equal(ui.vietnamDate('2026-10-27'),'27/10/2026');assert.equal(ui.vietnamDate('2026-10-26T12:57:00Z',true),'26/10/2026 19:57');
  assert.equal(dateRange(shiftDay(today,-13),today).length,14);assert.throws(()=>dateRange('2026-02-31',today));
  const empty = dashboardSnapshot({}, {from,to:today,chartFrom:shiftDay(today,-6),chartTo:today});
  assert.equal(empty.trend.length,7);assert.equal(empty.chartTotals.net,0);
  const month = dashboardSnapshot(data,{from,to:today,chartFrom:shiftDay(today,-29),chartTo:today,chartMode:'month'});
  assert.equal(month.trend.length,new Set(dateRange(shiftDay(today,-29),today).map((day)=>day.slice(0,7))).size);
  console.log('PASS unique money axis labels at 13 scales, zero-filled 7/14/30 days, monthly aggregation, Vietnamese formatting');

  const invoice = data.invoices.find((row)=>row.code==='DEMO-HD-OUTPUT');
  const detail = await call(`/invoices/${invoice.id}/details`);
  assert.ok(detail.record.items.length && detail.allocations.length);
  assert.ok(detail.allocations.every((row)=>row.paymentCode && row.invoiceCode));
  assert.equal(detail.references[invoice.counterpartyId]?.taxCode,'0102345678');
  const worker = await login('workshop.workflow@fintax.demo');
  await call(`/invoices/${invoice.id}/details`,worker,403);
  const jobs = await call('/production-orders',worker);
  const workerDetail = await call(`/production-orders/${jobs[0].id}/details`,worker);
  for(const key of ['costEstimate','laborRate','bom','total','paidAmount','workshopId']) assert.equal(workerDetail.record[key],undefined);
  assert.ok((await call('/workshop-members')).every((row)=>row.name && !row.password_hash));
  const otherTenant = await login('owner@fintax.demo'); await call(`/invoices/${invoice.id}/details`,otherTenant,404);
  console.log('PASS document business references, worker financial redaction, cross-tenant detail access denied');
} finally { await getPool().end(); }
