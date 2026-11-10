import fs from 'node:fs/promises';
import crypto from 'node:crypto';

// Dedicated local QA API only. This script intentionally creates its own workshop.
const base = process.env.QA_API_BASE || 'http://127.0.0.1:3005/api';
if (!['http://127.0.0.1:3002/api','http://127.0.0.1:3005/api'].includes(base)) throw new Error('Dedicated QA API only.');
const tag = `QAAPI-${Date.now()}`;
const password = `LocalQa@${crypto.randomBytes(6).toString('hex')}`;
const email = `${tag.toLowerCase()}@qa.invalid`;
let token;
const evidence = { tag, api: base, executedAt: new Date().toISOString(), probes: [] };
async function request(method, path, body, authenticated = true) {
  const response = await fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json', ...(authenticated && token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}
async function mustCreate(entity, body) {
  const result = await request('POST', `/${entity}`, body);
  if (result.status !== 201) throw new Error(`${entity} setup ${result.status}: ${JSON.stringify(result.data)}`);
  return result.data;
}
async function getRow(entity, id) {
  const result = await request('GET', `/${entity}`);
  return result.data.find(row => row.id === id);
}
function record(name, details) { evidence.probes.push({ name, ...details }); console.log(name, JSON.stringify(details)); }
try {
  const registered = await request('POST', '/auth/register', { email, name: `${tag} tester`, password, workshopName: `${tag} isolated workshop`, mode: 'CREATE_WORKSHOP' }, false);
  if (registered.status !== 201) throw new Error(`register ${registered.status}: ${JSON.stringify(registered.data)}`);
  evidence.workshopId = registered.data.workshopId;
  const login = await request('POST', '/auth/login', { email, password }, false);
  if (login.status !== 200) throw new Error(`login ${login.status}: ${JSON.stringify(login.data)}`);
  token = login.data.token;
  const date = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const account = await mustCreate('cash-accounts', {name:`${tag} cash`,type:'CASH',openingBalance:1000000,ownerScope:'BUSINESS'});
  const supplier = await mustCreate('suppliers', {code:`${tag}-SUP`,name:`${tag} supplier`,taxCode:'0312345678'});
  const customer = await mustCreate('customers', {code:`${tag}-CUS`,name:`${tag} customer`,taxCode:'0102345678'});

  // Hold references to genuine allocations, then try create with existing identifier.
  const invoice = await mustCreate('invoices',{code:`${tag}-PAID`,type:'OUTPUT',counterparty:customer.name,counterpartyId:customer.id,subtotal:1000,taxRate:0,date});
  const payment = await mustCreate('payments',{code:`${tag}-PAY`,direction:'RECEIVED',counterparty:customer.name,counterpartyId:customer.id,amount:1000,accountId:account.id,date});
  const allocation = await mustCreate('payment-allocations',{paymentId:payment.id,invoiceId:invoice.id,allocatedAmount:1000,date});
  const beforeOverwrite = await getRow('invoices',invoice.id);
  const overwrite = await request('POST','/invoices',{id:invoice.id,code:`${tag}-REPLACED`,type:'OUTPUT',counterparty:customer.name,counterpartyId:customer.id,subtotal:2000,taxRate:0,date});
  const afterOverwrite = await getRow('invoices',invoice.id);
  record('POST existing invoice id', {status:overwrite.status,existingId:invoice.id,returnedId:overwrite.data.id,before:{code:beforeOverwrite.code,total:beforeOverwrite.total,paidAmount:beforeOverwrite.paidAmount,openBalance:beforeOverwrite.openBalance},after:{code:afterOverwrite.code,total:afterOverwrite.total,paidAmount:afterOverwrite.paidAmount,openBalance:afterOverwrite.openBalance},allocationStillPresent:Boolean(await getRow('payment-allocations',allocation.id)),customerReceivable:(await getRow('customers',customer.id)).receivable});

  const badPartner = await request('POST','/payments',{code:`${tag}-NO-PARTNER`,direction:'RECEIVED',counterparty:'Does not exist',counterpartyId:'nonexistent-qa-customer',amount:111,accountId:account.id,date});
  record('Payment nonexistent counterparty', {status:badPartner.status,persistedId:badPartner.data.id,counterpartyId:badPartner.data.counterpartyId,amount:badPartner.data.amount});
  const inactive = await mustCreate('cash-accounts',{name:`${tag} inactive`,type:'BANK',openingBalance:1000,status:'INACTIVE',ownerScope:'BUSINESS'});
  const inactivePay = await request('POST','/payments',{code:`${tag}-INACTIVE-ACCOUNT`,direction:'RECEIVED',counterparty:customer.name,counterpartyId:customer.id,amount:222,accountId:inactive.id,date});
  record('Payment inactive account',{status:inactivePay.status,accountStatus:(await getRow('cash-accounts',inactive.id)).status,balanceBefore:1000,balanceAfter:(await getRow('cash-accounts',inactive.id)).balance,paymentId:inactivePay.data.id});

  const period = await mustCreate('tax-periods',{name:`${tag}-October`,startDate:'2026-10-01',endDate:'2026-10-31'});
  const lock = await request('POST',`/tax-periods/${period.id}/actions/lock`,{});
  record('Lock QA period',{status:lock.status});
  for (const invalidDate of ['2026-10-32','not-a-date']) {
    const response = await request('POST','/invoices',{code:`${tag}-DATE-${invalidDate}`,type:'INPUT',counterparty:supplier.name,counterpartyId:supplier.id,subtotal:100,taxRate:0,date:invalidDate});
    record('Invalid invoice date',{inputDate:invalidDate,status:response.status,persistedDate:response.data.date,id:response.data.id,error:response.data.error});
  }
  const correctLock = await request('POST','/invoices',{code:`${tag}-LOCK-CONTROL`,type:'INPUT',counterparty:supplier.name,counterpartyId:supplier.id,subtotal:100,taxRate:0,date:'2026-10-27'});
  record('Locked date negative control',{status:correctLock.status,error:correctLock.data.error});
  const invalidPeriod = await request('POST','/tax-periods',{name:`${tag}-ImpossibleDate`,startDate:'2027-02-30',endDate:'2027-02-31'});
  record('Impossible period calendar date',{status:invalidPeriod.status,startDate:invalidPeriod.data.startDate,endDate:invalidPeriod.data.endDate,error:invalidPeriod.data.error});
  await request('POST',`/tax-periods/${period.id}/actions/unlock`,{note:'QA fixture period reopening'});

  const supplier2=await mustCreate('suppliers',{code:`${tag}-SUP2`,name:`${tag} supplier2`,taxCode:'0102222222'});
  const sharedCode=`${tag}-SHARED`;
  const inv1=await mustCreate('invoices',{code:sharedCode,type:'INPUT',counterparty:supplier.name,counterpartyId:supplier.id,subtotal:100,taxRate:0,date});
  const inv2=await request('POST','/invoices',{code:sharedCode,type:'INPUT',counterparty:supplier2.name,counterpartyId:supplier2.id,subtotal:100,taxRate:0,date});
  const edit=await request('PUT',`/invoices/${inv1.id}`,{note:'Nonfinancial QA edit'});
  record('Invoice same number different suppliers edit',{firstCreated:201,secondCreated:inv2.status,editStatus:edit.status,error:edit.data.error});

  const d1=await request('GET','/dashboard');
  const dCached=await request('GET','/dashboard');
  await mustCreate('transactions',{date,description:`${tag} cache current-day`,direction:'INCOME',classification:'BUSINESS_INCOME',accountId:account.id,amount:100});
  const d2=await request('GET','/dashboard');
  record('Dashboard current-day cache invalidation',{range:[d1.data.from,d1.data.to],cacheEqual:JSON.stringify(d1.data.metrics)===JSON.stringify(dCached.data.metrics),before:d1.data.metrics?.revenue,after:d2.data.metrics?.revenue,delta:d2.data.metrics?.revenue-d1.data.metrics?.revenue});
  const oldBefore=await request('GET','/dashboard?from=2026-10-01&to=2026-10-31');
  const currentBefore=await request('GET','/dashboard');
  await mustCreate('transactions',{date:'2026-10-27',description:`${tag} cache historical`,direction:'INCOME',classification:'BUSINESS_INCOME',accountId:account.id,amount:100});
  const oldAfter=await request('GET','/dashboard?from=2026-10-01&to=2026-10-31');
  const currentAfter=await request('GET','/dashboard');
  record('Dashboard historical suite assumption',{historicalRange:[oldBefore.data.from,oldBefore.data.to],historicalDelta:oldAfter.data.metrics?.revenue-oldBefore.data.metrics?.revenue,currentDelta:currentAfter.data.metrics?.revenue-currentBefore.data.metrics?.revenue});

  const weak = await request('POST','/auth/password',{currentPassword:password,newPassword:'QAshort8'});
  record('Password eight-character policy',{status:weak.status,error:weak.data.error,ok:weak.data.ok});
  const long=await request('POST','/auth/password',{currentPassword:weak.status===200?'QAshort8':password,newPassword:'Q'.repeat(73)});
  record('Password over 72-byte validation',{status:long.status,error:long.data.error,ok:long.data.ok});
  const oldToken=await request('GET','/auth/me');
  record('Old JWT after password change',{passwordChanged:weak.status===200,oldTokenStatus:oldToken.status});
} catch(error) {evidence.fatal=error.message;console.error(error.stack);process.exitCode=1;}
finally { await fs.writeFile(new URL('./api-candidate-evidence.json',import.meta.url),JSON.stringify(evidence,null,2)); }
