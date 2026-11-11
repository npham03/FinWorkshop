import { writeFile } from 'node:fs/promises';
import { businessDate } from '../apps/middleware-api/src/accounting.js';
const base='http://127.0.0.1:3002/api',tag=`QA2-DB-${Date.now()}`,date=businessDate();
const tokens={},users={},http=[],cases=[];
async function call(method,path,body,role='OWNER'){
 const r=await fetch(base+path,{method,headers:{...(tokens[role]?{Authorization:`Bearer ${tokens[role]}`}:{ }),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 const data=await r.json();
 http.push({method,path,role,request:body?Object.fromEntries(Object.entries(body).filter(([k])=>!['password','email'].includes(k))):undefined,status:r.status,response:data?.token?{user:data.user}:data});
 return {status:r.status,data};
}
async function ok(method,path,body,role='OWNER',status=200){const r=await call(method,path,body,role);if(r.status!==status)throw new Error(`${method} ${path}: ${r.status} ${JSON.stringify(r.data)}`);return r.data;}
const create=(entity,body,role='OWNER')=>ok('POST',`/${entity}`,body,role,201);
const action=(id,name,body={},role='OWNER')=>ok('POST',`/production-orders/${id}/actions/${name}`,body,role);
const get=async(entity,id)=>(await ok('GET',`/${entity}`)).find(row=>row.id===id);
const report=(to=date)=>ok('GET',`/reports/sme?from=2026-01-01&to=${to}`);
const cost=(report,id)=>report.books.find(book=>book.code==='SME-GT').rows.find(row=>row.id===id);
const account=(report,code)=>report.books.find(book=>book.code==='SME-TK').rows.find(row=>row.account===code);
async function probe(name,run){const start=http.length;try{cases.push({name,...await run(),requests:[start,http.length-1]});}catch(error){cases.push({name,error:error.message,requests:[start,http.length-1]});}}
async function fixture(suffix,{product=true,quantity=1,machineCost=0,trackInventory=true,status='ACTIVE'}={}){
 const material=await create('materials',{code:`${tag}-${suffix}-M`,name:`${tag}-${suffix}-material`,unit:'kg',unitCost:1000});
 await create('stock-movements',{type:'OPENING',materialId:material.id,quantity:10,unitCost:1000,date,reason:tag});
 const p=product?await create('products',{code:`${tag}-${suffix}-P`,name:`${tag}-${suffix}-product`,unit:'unit',trackInventory,status}):null;
 const job=await create('production-orders',{code:`${tag}-${suffix}-JOB`,...(p?{productId:p.id}:{productName:`${tag}-${suffix}-service`}),quantity,plannedMachineCost:machineCost,date,assignedTo:users.WORKSHOP.id});
 return {material,product:p,job};
}
const email=`${tag.toLowerCase()}@fintax.invalid`;
await ok('POST','/auth/register',{name:tag,email,password:'FinTaxTest@2026',workshopName:tag,mode:'CREATE_WORKSHOP'},'ANON',201);
let login=await ok('POST','/auth/login',{email,password:'FinTaxTest@2026'},'ANON');tokens.OWNER=login.token;users.OWNER=login.user;
for(const role of ['WORKSHOP','WAREHOUSE']){
 const email=`${tag.toLowerCase()}-${role.toLowerCase()}@fintax.invalid`;
 await ok('POST','/users',{name:`${tag}-${role}`,email,password:'FinTaxTest@2026',role},'OWNER',201);
 login=await ok('POST','/auth/login',{email,password:'FinTaxTest@2026'},'ANON');tokens[role]=login.token;users[role]=login.user;
}
await probe('Cancel material issue after finished receipt restores raw material without reversing finished goods',async()=>{
 const f=await fixture('cancel');await action(f.job.id,'start');
 const issue=await create('stock-movements',{type:'ISSUE',materialId:f.material.id,productionOrderId:f.job.id,quantity:2,date});
 await action(f.job.id,'complete');await action(f.job.id,'receive-finished',{date});
 const before={material:await get('materials',f.material.id),product:await get('products',f.product.id),cost:cost(await report(),f.job.id)};
 const cancelled=await call('DELETE',`/stock-movements/${issue.id}`,{reason:tag});
 const after={material:await get('materials',f.material.id),product:await get('products',f.product.id),job:await get('production-orders',f.job.id),cost:cost(await report(),f.job.id)};
 return {confirmed:cancelled.status===200&&after.material.stock===10&&after.product.stockValue===2000,before,cancelled,after,expected:'Reject cancellation once material issue has been capitalized into completed finished goods, or reverse dependent finished receipt first.'};
});
await probe('Ordinary raw-material receipt accepts reserved sourceProductionOrderId and falsely clears WIP',async()=>{
 const f=await fixture('fake-source');await action(f.job.id,'start');
 await create('stock-movements',{type:'ISSUE',materialId:f.material.id,productionOrderId:f.job.id,quantity:2,date});
 const before=cost(await report(),f.job.id);
 const receipt=await create('stock-movements',{type:'RECEIPT',materialId:f.material.id,sourceProductionOrderId:f.job.id,quantity:2,unitCost:1000,date},'WAREHOUSE');
 const r=await report(),after=cost(r,f.job.id),job=await get('production-orders',f.job.id),journal=r.books.find(book=>book.code==='SME-NKC').rows.filter(row=>row.sourceId===receipt.id);
 return {confirmed:before.wip===2000&&after.wip===0&&job.status==='IN_PROGRESS',before,receipt,after,job,journal,expected:'Only internally created FINISHED_RECEIPT may reduce WIP; ordinary material receipt should leave this job WIP 2000.'};
});
await probe('Backdated finished receipt posts stock before machine-cost recognition',async()=>{
 const f=await fixture('backdate',{machineCost:3000});await action(f.job.id,'start');await action(f.job.id,'complete');
 const prior='2026-10-31';
 const accepted=await action(f.job.id,'receive-finished',{date:prior});
 const r=await report(prior),journal=r.books.find(book=>book.code==='SME-NKC').rows.filter(row=>row.sourceId===accepted.finishedReceiptId||row.code===accepted.code);
 return {confirmed:accepted.actualMachineCost===3000&&accepted.acceptedAt.slice(0,10)!==prior&&account(r,'154')?.net===-3000,accepted,asOf:prior,jobCost:cost(r,f.job.id),account154:account(r,'154'),journal,expected:'Receipt and the cost it capitalizes must have consistent accounting dates. Historical154 must not become -3000 because machine cost is deferred to actual wall-clock acceptance date.'};
});
await probe('Non-stock product production is accepted but cannot be completed into stock or service',async()=>{
 const f=await fixture('nonstock',{trackInventory:false});await action(f.job.id,'start');
 const completed=await action(f.job.id,'complete'),received=await call('POST',`/production-orders/${f.job.id}/actions/receive-finished`,{date});
 return {confirmed:false,observed:completed.status==='READY_FOR_RECEIPT'&&received.status===400,reviewRequired:true,product:f.product,job:f.job,completed,received,expected:'Confirm whether non-stock catalog products should follow service completion rather than finished-goods receipt; HTTP400 by itself is not counted as a defect.'};
});
await probe('Stopped BOM remains selectable for a new production job',async()=>{
 const f=await fixture('inactivebom');
 const bom=await create('boms',{code:`${tag}-INACTIVE-BOM`,productId:f.product.id,productName:f.product.name,items:[{materialId:f.material.id,quantity:1}]});
 const stopped=await ok('PUT',`/boms/${bom.id}`,{status:'INACTIVE'});
 const created=await call('POST','/production-orders',{code:`${tag}-INACTIVE-BOM-JOB`,productId:f.product.id,bomId:bom.id,quantity:1,date});
 return {confirmed:created.status===201&&created.data.bom.status==='INACTIVE',stopped,created,expected:'A stopped BOM must not be selected for a new job (existing snapshots may remain).'};
});
await probe('New production accepts inactive product and cannot receive its finished goods',async()=>{
 const f=await fixture('inactiveproduct',{status:'INACTIVE'});await action(f.job.id,'start');
 const completed=await action(f.job.id,'complete'),received=await call('POST',`/production-orders/${f.job.id}/actions/receive-finished`,{date});
 return {confirmed:completed.status==='READY_FOR_RECEIPT'&&received.status===400,product:f.product,job:f.job,completed,received,expected:'Reject inactive product before creating a new production job.'};
});
await probe('Concurrent metadata update reverts started production state',async()=>{
 const attempts=[];
 for(let i=0;i<15;i++){
  const job=await create('production-orders',{code:`${tag}-RACE-${i}`,productName:`${tag}-race-service`,quantity:1,date});
  const results=await Promise.all([call('POST',`/production-orders/${job.id}/actions/start`,{}),...Array.from({length:4},(_,j)=>call('PUT',`/production-orders/${job.id}`,{note:`${tag}-race-${j}`}))]);
  const after=await get('production-orders',job.id);attempts.push({jobId:job.id,results,after});
  if(results[0].status===200&&after.status==='DRAFT')return {confirmed:true,attempts,expected:'A successful start must not be reverted by a concurrent metadata-only PUT.'};
 }
 return {confirmed:false,attempts,expected:'Possible stale update window was not reproduced in 15 attempts.'};
});
await probe('Reopen completed service using future action date changes COGS of already locked period',async()=>{
 const f=await fixture('lock-service',{product:false});await action(f.job.id,'start');
 await create('stock-movements',{type:'ISSUE',materialId:f.material.id,productionOrderId:f.job.id,quantity:2,date});
 const completed=await action(f.job.id,'complete');
 const before=await report(date);
 const period=await create('tax-periods',{name:`${tag}-lock`,startDate:completed.completedAt.slice(0,10),endDate:date});
 await ok('POST',`/tax-periods/${period.id}/actions/lock`,{});
 const tomorrow=new Date(`${date}T12:00:00Z`);tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
 const reopened=await call('POST',`/production-orders/${f.job.id}/actions/reopen`,{date:tomorrow.toISOString().slice(0,10),note:tag});
 const after=await report(date);
 return {confirmed:reopened.status===200&&before.summary.cogs-after.summary.cogs===2000,period,reopened,before:{summary:before.summary,jobCost:cost(before,f.job.id),account632:account(before,'632')},after:{summary:after.summary,jobCost:cost(after,f.job.id),account632:account(after,'632')},expected:'Locked-period COGS must remain unchanged. A future-dated reopening should not delete the historical completion posting.'};
});
await writeFile(new URL('./round2-db-evidence.json',import.meta.url),JSON.stringify({base,tag,date,workshopId:users.OWNER.workshopId,cases,http},null,2));
console.log(JSON.stringify({tag,date,cases:cases.map(({name,confirmed,error})=>({name,confirmed,error}))},null,2));
