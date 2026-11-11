import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const base='http://127.0.0.1:3005/api';
const tag=`QA2-API-${Date.now()}`;
const password=`LocalQa@${crypto.randomBytes(6).toString('hex')}`;
const email=`${tag.toLowerCase()}@qa.invalid`;
const evidence={tag,api:base,executedAt:new Date().toISOString(),probes:[]};
let token,account,customer;
const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
async function req(method,path,body,auth=true){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(auth&&token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json().catch(()=>({}))};}
async function create(entity,body){const r=await req('POST',`/${entity}`,body);if(r.status!==201)throw new Error(`${entity} setup ${r.status} ${JSON.stringify(r.data)}`);return r.data;}
async function row(entity,id){return (await req('GET',`/${entity}`)).data.find(r=>r.id===id)}
function record(name,data){evidence.probes.push({name,...data});console.log(name,JSON.stringify(data))}
async function check(name,run){try{await run()}catch(e){record(name,{probeError:e.message})}}
try{
 const reg=await req('POST','/auth/register',{email,name:`${tag} tester`,password,workshopName:`${tag} workspace`,mode:'CREATE_WORKSHOP'},false);
 if(reg.status!==201)throw new Error(`register ${reg.status} ${JSON.stringify(reg.data)}`);
 evidence.workshopId=reg.data.workshopId;
 const login=await req('POST','/auth/login',{email,password},false);if(login.status!==200)throw new Error('Own QA login failed');token=login.data.token;
 account=await create('cash-accounts',{name:`${tag} cash`,type:'CASH',openingBalance:1000000,ownerScope:'BUSINESS'});
 customer=await create('customers',{code:`${tag}-C`,name:`${tag} original customer`});

 await check('Settings error partial commit',async()=>{
  const before=(await req('GET','/workshop')).data;
  const changed=await req('PUT','/workshop',{name:`${tag} SHOULD-ROLLBACK`,taxId:'0312345678',settings:{taxMethod:'NOT_A_TAX_METHOD'}});
  const after=(await req('GET','/workshop')).data;
  record('Settings error partial commit',{status:changed.status,error:changed.data.error,beforeName:before.name,afterName:after.name,beforeTaxId:before.tax_id,afterTaxId:after.tax_id,afterTaxMethod:after.settings?.taxMethod});
 });
 await check('Opening balance customer dependency',async()=>{
  const partner=await create('customers',{code:`${tag}-OPEN-C`,name:`${tag} opening debt customer`});
  const opening=await create('opening-balances',{partnerType:'CUSTOMER',partnerId:partner.id,amount:5000,date,reason:'QA own opening receivable'});
  const before=(await req('GET','/dashboard')).data.metrics.receivable;
  const cancelled=await req('DELETE',`/customers/${partner.id}`,{reason:'QA verify dependent balance'});
  const after=(await req('GET','/dashboard')).data.metrics.receivable;
  const balance=await row('opening-balances',opening.id);
  record('Opening balance customer dependency',{status:cancelled.status,customerStatus:cancelled.data.status,openingBalanceId:opening.id,openingStillActive:balance?.status,receivableBefore:before,receivableAfter:after});
 });
 await check('Partner rename blocks allocation',async()=>{
  const p=await create('payments',{code:`${tag}-NAME-P`,direction:'RECEIVED',counterparty:customer.name,counterpartyId:customer.id,amount:1000,accountId:account.id,date});
  const renamed=await req('PUT',`/customers/${customer.id}`,{name:`${tag} renamed customer`});
  const inv=await create('invoices',{code:`${tag}-NAME-I`,type:'OUTPUT',counterpartyId:customer.id,subtotal:1000,taxRate:0,date});
  const result=await req('POST','/payment-allocations',{paymentId:p.id,invoiceId:inv.id,allocatedAmount:1000});
  record('Partner rename blocks allocation',{renameStatus:renamed.status,status:result.status,error:result.data.error,paymentPartnerId:p.counterpartyId,invoicePartnerId:inv.counterpartyId,paymentStoredName:p.counterparty,invoiceStoredName:inv.counterparty,paymentListDisplayName:(await row('payments',p.id)).counterparty});
  customer=renamed.data;
 });
 await check('Cancelled transaction creates phantom money',async()=>{
  const before=(await row('cash-accounts',account.id)).balance;
  const tx=await req('POST','/transactions',{code:`${tag}-CANCELLED-TX`,date,description:'QA already cancelled income',direction:'INCOME',classification:'BUSINESS_INCOME',amount:333,accountId:account.id,status:'CANCELLED'});
  const after=(await row('cash-accounts',account.id)).balance;
  const books=(await req('GET',`/reports/books?from=${date}&to=${date}`)).data;
  const included=JSON.stringify(books).includes(tx.data.id);
  record('Cancelled transaction creates phantom money',{status:tx.status,transactionStatus:tx.data.status,id:tx.data.id,balanceBefore:before,balanceAfter:after,activeBookIncludesTransaction:included});
 });
 await check('Transfer opposite-leg concurrent cancellation',async()=>{
  const bank=await create('cash-accounts',{name:`${tag} bank`,type:'BANK',openingBalance:100000,ownerScope:'BUSINESS'});
  const attempts=[];
  for(let index=0;index<4;index++){
   const transfer=await req('POST','/transfers',{fromAccountId:account.id,toAccountId:bank.id,amount:20,date,note:`${tag} race ${index}`});
   if(transfer.status!==201)throw new Error(`transfer setup ${transfer.status}`);
   const pair=transfer.data.transactions;
   const results=await Promise.all(pair.map(t=>req('DELETE',`/transactions/${t.id}`,{reason:'QA concurrent cancellation'})));
   attempts.push(results.map(r=>({status:r.status,error:r.data.error})));
  }
  record('Transfer opposite-leg concurrent cancellation',{attempts});
 });
 await check('Payment duplicate reference',async()=>{
  const before=(await row('cash-accounts',account.id)).balance;
  const body={code:`${tag}-DUPLICATE-P`,externalReference:`${tag}-BANK-REF`,direction:'RECEIVED',counterparty:customer.name,counterpartyId:customer.id,amount:777,accountId:account.id,date};
  const results=await Promise.all([req('POST','/payments',body),req('POST','/payments',body)]);
  record('Payment duplicate reference',{statuses:results.map(r=>r.status),ids:results.map(r=>r.data.id),balanceBefore:before,balanceAfter:(await row('cash-accounts',account.id)).balance});
 });
 await check('Invoice coded then edited',async()=>{
  const inv=await create('invoices',{code:`${tag}-CODE-I`,type:'OUTPUT',counterpartyId:customer.id,subtotal:1000,taxRate:0,date});
  const coded=await req('POST',`/invoices/${inv.id}/actions/simulate-code`,{});
  if(coded.status!==200){record('Invoice coded then edited',{codingStatus:coded.status,error:coded.data.error,blockedByEnvironment:true});return;}
  const edit=await req('PUT',`/invoices/${inv.id}`,{subtotal:2000});
  record('Invoice coded then edited',{codingStatus:coded.status,originalTotal:coded.data.total,originalCode:coded.data.mockTaxCode,editStatus:edit.status,editedTotal:edit.data.total,editedCode:edit.data.mockTaxCode,editedStatus:edit.data.status});
  const recode=await req('POST',`/invoices/${inv.id}/actions/simulate-code`,{});
  record('Already coded invoice recode',{status:recode.status,beforeCode:edit.data.mockTaxCode,afterCode:recode.data.mockTaxCode});
 });
 await check('Quotation pending-approval edit',async()=>{
  const quote=await create('quotations',{code:`${tag}-PENDING-Q`,title:'QA quote',customerName:customer.name,quantity:1,unitPrice:1000,taxRate:0});
  const submit=await req('POST',`/quotations/${quote.id}/actions/submit-for-approval`,{});
  const edit=await req('PUT',`/quotations/${quote.id}`,{unitPrice:2000});
  record('Quotation pending-approval edit',{submitStatus:submit.status,editStatus:edit.status,oldTotal:quote.total,newTotal:edit.data.total,status:edit.data.status,idSame:edit.data.id===quote.id});
 });
}catch(error){evidence.fatal=error.message;console.error(error.stack);process.exitCode=1}finally{await fs.writeFile(new URL('./round2-api-evidence.json',import.meta.url),JSON.stringify(evidence,null,2))}
