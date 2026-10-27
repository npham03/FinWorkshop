import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const base=process.env.TEST_API_URL||'http://127.0.0.1:3005/api';
if(!/^http:\/\/(127\.0\.0\.1|localhost):3005\/api$/.test(base))throw new Error('Use the isolated review-fixes API on port 3005.');
const tag=`FIX-${Date.now()}`,date='2026-10-27',tokens={},users={},results=[];
async function call(method,path,body,role='OWNER',status=200){
  const response=await fetch(base+path,{method,headers:{...(tokens[role]?{Authorization:`Bearer ${tokens[role]}`}:{ }),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  const data=await response.json();assert.equal(response.status,status,`${method} ${path}: ${JSON.stringify(data)}`);return data;
}
const create=(entity,data,role='OWNER')=>call('POST',`/${entity}`,data,role,201);
const action=(entity,id,name,data={},role='OWNER',status=200)=>call('POST',`/${entity}/${id}/actions/${name}`,data,role,status);
const rows=(entity,role='OWNER')=>call('GET',`/${entity}`,null,role);
const row=async(entity,id,role='OWNER')=>(await rows(entity,role)).find(item=>item.id===id);
async function check(name,run){try{await run();results.push({name,result:'PASS'});console.log(`PASS ${name}`);}catch(error){results.push({name,result:'FAIL',error:error.message});console.error(`FAIL ${name}: ${error.message}`);}}
let company,otherCompany,supplier,customer,material,product,bom,quote,job,input,output,bank,issue;

await check('Business registration creates a separate empty workspace and owner can log in offline',async()=>{
  company=await call('POST','/auth/register',{name:'Chủ doanh nghiệp kiểm thử',email:`${tag.toLowerCase()}@fintax.invalid`,password:'FinTaxTest@2026',workshopName:`Doanh nghiệp ${tag}`,mode:'CREATE_WORKSHOP'},'ANON',201);
  assert.equal(company.approvalStatus,'APPROVED');
  const login=await call('POST','/auth/login',{email:`${tag.toLowerCase()}@fintax.invalid`,password:'FinTaxTest@2026'},'ANON');tokens.OWNER=login.token;users.OWNER=login.user;
  assert.equal(login.user.role,'OWNER');assert.notEqual(login.user.workshopId,'00000000-0000-0000-0000-000000000001');assert.equal((await rows('materials')).length,0);assert.equal((await rows('products')).length,0);
  const profile=await call('GET','/workshop');assert.equal(profile.settings.currency,'VND');assert.equal(profile.settings.taxMethod,'VAT_CREDIT');
});
await check('Create four roles and no finance access for warehouse or worker',async()=>{
  for(const [role,name]of [['ACCOUNTANT','Kế toán'],['WAREHOUSE','Thủ kho'],['WORKSHOP','Thợ']]){
    const email=`${tag.toLowerCase()}-${role.toLowerCase()}@fintax.invalid`;
    await call('POST','/users',{name,email,role,password:'FinTaxTest@2026'},'OWNER',201);
    const login=await call('POST','/auth/login',{email,password:'FinTaxTest@2026'},'ANON');tokens[role]=login.token;users[role]=login.user;
  }
  await call('GET','/invoices',null,'WORKSHOP',403);await call('GET','/invoices',null,'WAREHOUSE',403);await call('GET','/users',null,'ACCOUNTANT',403);
});
await check('Invitation is bound to email, company, role and consumed once',async()=>{
  const email=`${tag.toLowerCase()}-invite@fintax.invalid`;
  const invite=await call('POST','/invitations',{email,role:'WAREHOUSE'},'OWNER',201),token=invite.path.split('=')[1];
  await call('POST','/auth/register',{email:`wrong-${email}`,name:'Sai người nhận',password:'FinTaxTest@2026',inviteToken:token},'ANON',400);
  const registered=await call('POST','/auth/register',{email,name:'Người được mời',password:'FinTaxTest@2026',inviteToken:token},'ANON',201);assert.equal(registered.workshopId,company.workshopId);
  const login=await call('POST','/auth/login',{email,password:'FinTaxTest@2026'},'ANON');assert.equal(login.user.role,'WAREHOUSE');
  await call('GET',`/invitations/${token}`,null,'ANON',404);
});
await check('Master schema rejects blank data, duplicate codes, negative cost and invented stock',async()=>{
  await call('POST','/materials',{name:'',unit:''},'OWNER',400);
  await call('POST','/materials',{name:'Vật tư thiếu ĐVT'},'OWNER',400);
  await call('POST','/materials',{name:'Tồn giả',unit:'kg',stock:1000},'OWNER',400);
  await call('POST','/materials',{name:'Giá âm',unit:'kg',unitCost:-1},'OWNER',400);
  supplier=await create('suppliers',{code:`${tag}-NCC`,name:`${tag} Nhà cung cấp`,payable:0});
  await call('POST','/suppliers',{code:`${tag}-NCC`,name:'Nhà cung cấp khác'},'OWNER',409);
  customer=await create('customers',{code:`${tag}-KH`,name:`${tag} Khách hàng`,receivable:0});
  material=await create('materials',{code:`${tag}-VT`,name:'Thép dùng sản xuất',unit:'kg',unitCost:1000,stock:0,minStock:5,trackInventory:true});
  product=await create('products',{code:`${tag}-SP`,name:'Bàn thao tác kiểm thử',unit:'cái',price:4000,trackInventory:true});
  bank=await create('cash-accounts',{name:`${tag} Ngân hàng`,type:'BANK',ownerScope:'BUSINESS',openingBalance:500000});
});
await check('INPUT posts correct tax and debt, partner editor cannot overwrite balance',async()=>{
  input=await create('invoices',{code:`${tag}-INPUT`,type:'INPUT',counterpartyId:supplier.id,date,inputVatDeductible:true,items:[{materialId:material.id,name:material.name,quantity:100,unitPrice:1000,taxRate:8,purchaseCategory:'INVENTORY'}]});
  assert.equal(input.total,108000);assert.equal(input.taxAmount,8000);assert.equal(input.purchaseCategory,'INVENTORY');assert.equal((await row('suppliers',supplier.id)).payable,108000);
  await call('PUT',`/suppliers/${supplier.id}`,{payable:0},'ACCOUNTANT',409);
  assert.equal((await row('suppliers',supplier.id)).payable,108000);
});
await check('Receipt links invoice line, updates quantity/value, duplicate receipt is rejected',async()=>{
  const receipt=await create('stock-movements',{code:`${tag}-NK`,type:'RECEIPT',materialId:material.id,invoiceId:input.id,invoiceLineIndex:0,quantity:100,date},'WAREHOUSE');
  assert.equal(receipt.unitCost,undefined);const stored=await row('materials',material.id);assert.equal(stored.stock,100);assert.equal(stored.stockValue,100000);
  await call('POST','/stock-movements',{type:'RECEIPT',materialId:material.id,invoiceId:input.id,invoiceLineIndex:0,quantity:1,date},'WAREHOUSE',409);
  await call('PUT',`/materials/${material.id}`,{stock:999},'OWNER',409);
  await call('DELETE',`/invoices/${input.id}`,{reason:'Hàng đã nhập'},'OWNER',409);
});
await check('Inventory purchases are capitalized and not counted as operating expense',async()=>{
  const report=await call('GET','/reports/sme');assert.equal(report.summary.operatingExpense,0);assert.equal(report.summary.cogs,0);assert.equal(report.summary.rawMaterials,100000);
});
await check('Create itemized BOM and quotation headers remain consistent after editing',async()=>{
  bom=await create('boms',{code:`${tag}-BOM`,productId:product.id,productName:product.name,version:1,items:[{materialId:material.id,quantity:2}],laborHours:0.1,laborRate:5000,machineCost:100,wasteRate:0,marginRate:0.2});
  assert.equal(bom.materialCost,2000);
  quote=await create('quotations',{code:`${tag}-BG`,title:product.name,productId:product.id,customerId:customer.id,customerName:customer.name,bomId:bom.id,quantity:2,unitPrice:4000,taxRate:8,date});
  quote=await call('PUT',`/quotations/${quote.id}`,{quantity:10,unitPrice:4000,taxRate:8,subtotal:40000,taxAmount:3200,total:43200},'ACCOUNTANT');
  assert.equal(quote.items[0].quantity,10);assert.equal(quote.subtotal,40000);assert.equal(quote.total,43200);
});
await check('Approval and conversion preserve BOM and planned costs in production',async()=>{
  await action('quotations',quote.id,'submit-for-approval',{},'ACCOUNTANT');await action('quotations',quote.id,'approve');await action('quotations',quote.id,'mark-sent',{},'ACCOUNTANT');await action('quotations',quote.id,'accept',{},'ACCOUNTANT');
  const converted=await action('quotations',quote.id,'create-production',{assignedTo:users.WORKSHOP.id});job=converted.createdProduction;
  assert.equal(job.bom.items.length,1);assert.equal(job.bom.items[0].quantity,2);assert.equal(job.laborRate,5000);assert.equal(job.plannedLaborHours,1);assert.equal(job.laborHours,0);assert.equal(job.plannedMachineCost,1000);
});
await check('State machine blocks finish-before-start and financial field injection',async()=>{
  await action('production-orders',job.id,'complete',{},'WORKSHOP',409);
  await call('PUT',`/production-orders/${job.id}`,{status:'COMPLETED'},'ACCOUNTANT',409);
  const started=await action('production-orders',job.id,'start',{},'WORKSHOP');assert.equal(started.status,'IN_PROGRESS');assert.equal(started.laborRate,undefined);
  await action('production-orders',job.id,'start',{},'WORKSHOP',409);
});
await check('Returns require source issue and cannot exceed issued remainder',async()=>{
  await call('POST','/stock-movements',{type:'RETURN',materialId:material.id,quantity:2,date},'OWNER',400);
  issue=await create('stock-movements',{code:`${tag}-PX`,type:'ISSUE',materialId:material.id,productionOrderId:job.id,quantity:20,date},'WORKSHOP');
  await create('stock-movements',{type:'RETURN',materialId:material.id,productionOrderId:job.id,sourceIssueId:issue.id,quantity:2,date},'WORKSHOP');
  await call('POST','/stock-movements',{type:'RETURN',materialId:material.id,productionOrderId:job.id,sourceIssueId:issue.id,quantity:19,date},'WORKSHOP',409);
  await create('stock-movements',{type:'ISSUE',materialId:material.id,productionOrderId:job.id,quantity:2,date},'WORKSHOP');
  assert.equal((await row('materials',material.id)).stock,80);
});
await check('Worker can record hours but cannot set payroll rate or read it from response',async()=>{
  await call('POST','/labor-logs',{productionOrderId:job.id,hours:1,hourlyRate:-50000,date},'WORKSHOP',403);
  await call('POST','/labor-logs',{productionOrderId:job.id,hours:1,hourlyRate:1000000,date},'WORKSHOP',403);
  const log=await create('labor-logs',{productionOrderId:job.id,hours:1,stage:'Gia công',date},'WORKSHOP');assert.equal(log.hourlyRate,undefined);
  const report=await call('GET','/reports/sme');assert.equal(report.summary.wip,25000);
});
await check('Finished receipt requires acceptance role and capitalizes exact cost',async()=>{
  const ended=await action('production-orders',job.id,'complete',{},'WORKSHOP');assert.equal(ended.status,'READY_FOR_RECEIPT');
  await action('production-orders',job.id,'receive-finished',{},'WORKSHOP',403);
  const accepted=await action('production-orders',job.id,'receive-finished',{date},'WAREHOUSE');assert.equal(accepted.status,'COMPLETED');assert.equal(accepted.totalCost,undefined);
  const finished=await row('products',product.id);assert.equal(finished.stock,10);assert.equal(finished.stockValue,26000);
  await action('production-orders',job.id,'start',{},'WORKSHOP',409);await action('production-orders',job.id,'receive-finished',{date},'WAREHOUSE',409);
});
await check('Sales delivery recognizes COGS; golden inventory and margin reconcile',async()=>{
  output=await create('invoices',{code:`${tag}-OUTPUT`,type:'OUTPUT',counterpartyId:customer.id,date,items:[{productId:product.id,name:product.name,quantity:10,unitPrice:4000,taxRate:8}]});
  await create('stock-movements',{type:'DELIVERY',productId:product.id,invoiceId:output.id,invoiceLineIndex:0,quantity:10,date},'WAREHOUSE');
  const report=await call('GET','/reports/sme');assert.equal(report.summary.revenue,40000);assert.equal(report.summary.cogs,26000);assert.equal(report.summary.grossProfit,14000);assert.equal(report.summary.rawMaterials,80000);assert.equal(report.summary.finishedGoods,0);assert.equal(report.summary.wip,0);assert.equal(report.summary.debit,report.summary.credit);
  const dashboard=await call('GET',`/dashboard?from=2026-10-01&to=${date}`);assert.equal(dashboard.metrics.netRevenue,40000);assert.equal(dashboard.metrics.operatingCost,26000);assert.equal(dashboard.metrics.payable,108000);
});
await check('Concurrent duplicate invoices create one row and one payable',async()=>{
  const code=`${tag}-RACE`,before=(await row('suppliers',supplier.id)).payable;
  const responses=await Promise.all(Array.from({length:8},()=>fetch(base+'/invoices',{method:'POST',headers:{Authorization:`Bearer ${tokens.OWNER}`,'Content-Type':'application/json'},body:JSON.stringify({code,type:'INPUT',counterpartyId:supplier.id,date,subtotal:1000,taxRate:0})})));
  assert.equal(responses.filter(response=>response.status===201).length,1);assert.equal(responses.filter(response=>response.status===409).length,7);assert.equal((await rows('invoices')).filter(item=>item.code===code).length,1);assert.equal((await row('suppliers',supplier.id)).payable,before+1000);
});
await check('Opening debt has its own dated document and cannot be overwritten',async()=>{
  const partner=await create('customers',{code:`${tag}-OPEN`,name:'Khách hàng đầu kỳ'});
  await call('POST','/opening-balances',{partnerType:'CUSTOMER',partnerId:partner.id,date:'2026-10-01',amount:5000,reason:'Biên bản đối chiếu đầu kỳ'},'ACCOUNTANT',403);
  await create('opening-balances',{partnerType:'CUSTOMER',partnerId:partner.id,date:'2026-10-01',amount:5000,reason:'Biên bản đối chiếu đầu kỳ'});
  assert.equal((await row('customers',partner.id)).receivable,5000);
  await call('PUT',`/customers/${partner.id}`,{receivable:0},'OWNER',409);
  await call('POST','/opening-balances',{partnerType:'CUSTOMER',partnerId:partner.id,date,amount:1,reason:'Trùng'},'OWNER',409);
});
await check('Tenant records and permission settings remain isolated',async()=>{
  const email=`${tag.toLowerCase()}-other@fintax.invalid`;
  otherCompany=await call('POST','/auth/register',{name:'Chủ doanh nghiệp khác',email,password:'FinTaxTest@2026',workshopName:'Doanh nghiệp khác'},'ANON',201);
  const login=await call('POST','/auth/login',{email,password:'FinTaxTest@2026'},'ANON');tokens.OTHER=login.token;
  assert.notEqual(otherCompany.workshopId,company.workshopId);assert.equal((await rows('invoices','OTHER')).length,0);
  await call('GET',`/invoices/${input.id}/details`,null,'OTHER',404);
  await call('PUT',`/materials/${material.id}`,{name:'Ghi chéo doanh nghiệp'},'OTHER',404);
  const before=await call('GET','/role-permissions',null,'OTHER');const local=await call('GET','/role-permissions');const permissions=local.find(item=>item.role==='ACCOUNTANT');
  await call('PUT','/role-permissions/ACCOUNTANT',{entities:permissions.entities.filter(entity=>entity!=='invoices'),actions:permissions.actions});
  await call('GET','/invoices',null,'ACCOUNTANT',403);assert.deepEqual(await call('GET','/role-permissions',null,'OTHER'),before);
  await call('PUT','/role-permissions/ACCOUNTANT',{entities:permissions.entities,actions:permissions.actions});
});
await check('Tax method mismatch and unreviewed rule are blocked for a configured SME',async()=>{
  const rules=await rows('tax-rules');const hkd=rules.find(rule=>rule.code==='HKD_MANUFACTURE'),vat=rules.find(rule=>rule.code==='VAT_8');
  await call('POST','/invoices',{code:`${tag}-BADTAX`,type:'OUTPUT',date,counterpartyId:customer.id,items:[{name:'Dòng hàng',quantity:1,unitPrice:100,taxRuleId:vat.id}]},'OWNER',400);
  await call('PUT',`/tax-rules/${hkd.id}`,{status:'ACTIVE'});await call('POST','/invoices',{code:`${tag}-HKD`,type:'OUTPUT',date,counterpartyId:customer.id,items:[{name:'Dòng hàng',quantity:1,unitPrice:100,taxRuleId:hkd.id}]},'OWNER',400);
});

await writeFile(new URL('./test-review-fixes-results.json',import.meta.url),JSON.stringify({base,tag,date,at:new Date().toISOString(),results},null,2));
console.log(JSON.stringify({passed:results.filter(item=>item.result==='PASS').length,total:results.length,companyId:company?.workshopId}));
if(results.some(item=>item.result==='FAIL'))process.exitCode=1;
