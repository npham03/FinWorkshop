// Read-only source audit; writes only tagged QA data into the parent's isolated API.
import { writeFile } from 'node:fs/promises';
const base='http://127.0.0.1:3002/api';
const tag=`QA-DB-${Date.now()}`,date='2026-11-11',tokens={},users={},http=[],cases=[];
async function call(method,path,body,role='OWNER') {
  const response=await fetch(base+path,{method,headers:{...(tokens[role]?{Authorization:`Bearer ${tokens[role]}`}:{ }),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  const data=await response.json();
  http.push({method,path,role,request:body?Object.fromEntries(Object.entries(body).filter(([key])=>!['password','email'].includes(key))):undefined,status:response.status,response:data?.token?{user:data.user}:data});
  return {status:response.status,data};
}
async function ok(method,path,body,role='OWNER',status=200) {const r=await call(method,path,body,role);if(r.status!==status)throw new Error(`${method} ${path}: ${r.status} ${JSON.stringify(r.data)}`);return r.data;}
const create=(entity,body,role='OWNER')=>ok('POST',`/${entity}`,body,role,201);
const action=(id,name,body={},role='OWNER')=>ok('POST',`/production-orders/${id}/actions/${name}`,body,role);
const get=async(entity,id)=>(await ok('GET',`/${entity}`)).find(row=>row.id===id);
async function probe(name,run){const start=http.length;try{cases.push({name,...await run(),requests:[start,http.length-1]});}catch(error){cases.push({name,error:error.message,requests:[start,http.length-1]});}}
const email=`${tag.toLowerCase()}@fintax.invalid`;
await ok('POST','/auth/register',{name:tag,email,password:'FinTaxTest@2026',workshopName:tag,mode:'CREATE_WORKSHOP'},'ANON',201);
let login=await ok('POST','/auth/login',{email,password:'FinTaxTest@2026'},'ANON');tokens.OWNER=login.token;users.OWNER=login.user;
for(const role of ['WORKSHOP','WAREHOUSE']){
  const email=`${tag.toLowerCase()}-${role.toLowerCase()}@fintax.invalid`;
  await ok('POST','/users',{name:`${tag}-${role}`,email,password:'FinTaxTest@2026',role},'OWNER',201);
  login=await ok('POST','/auth/login',{email,password:'FinTaxTest@2026'},'ANON');tokens[role]=login.token;users[role]=login.user;
}
await probe('Weighted-average partial exit creates negative stock value',async()=>{
  const m=await create('materials',{name:`${tag}-rounding`,unit:'unit',unitCost:1});
  await create('stock-movements',{type:'OPENING',materialId:m.id,quantity:10,unitCost:1,date,reason:tag});
  await create('stock-movements',{type:'RECEIPT',materialId:m.id,quantity:1,unitCost:7,date});
  const before=await get('materials',m.id);
  const movement=await create('stock-movements',{type:'ADJUST_OUT',materialId:m.id,quantity:10,date,reason:tag});
  const after=await get('materials',m.id);
  return {confirmed:after.stockValue<0,before,after,movement,expected:{stock:1,stockValue:2,amount:15,calculation:'17 - round(10 * 17/11) = 2'}};
});
await probe('Editing master unitCost rewrites subsequent issued valuation',async()=>{
  const m=await create('materials',{name:`${tag}-cost-edit`,unit:'kg',unitCost:1000});
  await create('stock-movements',{type:'OPENING',materialId:m.id,quantity:10,unitCost:1000,date,reason:tag});
  const edited=await ok('PUT',`/materials/${m.id}`,{unitCost:9000});
  const movement=await create('stock-movements',{type:'ADJUST_OUT',materialId:m.id,quantity:1,date,reason:tag});
  const after=await get('materials',m.id);
  return {confirmed:movement.amount===9000,edited,movement,after,expected:{amount:1000,stockValue:9000,calculation:'10*1000 - 1*1000 = 9000, not 1000'}};
});
await probe('Draft production permits zero quantity on update',async()=>{
  const product=await create('products',{name:`${tag}-zero`,unit:'unit',trackInventory:true});
  const job=await create('production-orders',{productId:product.id,quantity:1,date});
  const edited=await call('PUT',`/production-orders/${job.id}`,{quantity:0});
  return {confirmed:edited.status===200&&edited.data.quantity===0,job,edited,expectedStatus:400};
});
await probe('Warehouse can set financial machine cost while receiving finished goods',async()=>{
  const product=await create('products',{name:`${tag}-warehouse-cost`,unit:'unit',trackInventory:true});
  const job=await create('production-orders',{productId:product.id,quantity:1,assignedTo:users.WORKSHOP.id,plannedMachineCost:1000,date});
  const start=await action(job.id,'start',{},'WORKSHOP');
  const completed=await action(job.id,'complete',{},'WORKSHOP');
  const receipt=await action(job.id,'receive-finished',{date,machineCost:1000000},'WAREHOUSE');
  const after=await get('production-orders',job.id),stock=await get('products',product.id);
  return {confirmed:after.actualMachineCost===1000000,job,start,completed,receipt,after,stock,expected:'WAREHOUSE accepts physical quantity, not silently overwrite approved cost of 1000 with 1000000.'};
});
await probe('Existing production assignment accepts nonexistent user on update',async()=>{
  const job=await create('production-orders',{productName:`${tag}-assignment`,quantity:1,assignedTo:users.WORKSHOP.id,date});
  const edited=await call('PUT',`/production-orders/${job.id}`,{assignedTo:'00000000-0000-0000-0000-000000000000'});
  return {confirmed:edited.status===200,job,edited,expectedStatus:400};
});
await probe('Creating production with BOM and omitted quantity defaults job to 1 but labor/machine plan to 0',async()=>{
  const m=await create('materials',{name:`${tag}-bom-material`,unit:'kg',unitCost:1000});
  const p=await create('products',{name:`${tag}-bom-product`,unit:'unit'});
  const bom=await create('boms',{code:`${tag}-BOM`,productId:p.id,productName:p.name,items:[{materialId:m.id,quantity:1}],laborHours:2,laborRate:100000,machineCost:10000});
  const job=await create('production-orders',{productId:p.id,bomId:bom.id,date});
  return {confirmed:job.quantity===1&&job.plannedLaborHours===0&&job.plannedMachineCost===0,bom,job,expected:{quantity:1,plannedLaborHours:2,plannedMachineCost:10000}};
});
await probe('Editing draft production quantity does not rescale BOM labor and machine cost',async()=>{
  const m=await create('materials',{name:`${tag}-rescale-material`,unit:'kg',unitCost:1000});
  const p=await create('products',{name:`${tag}-rescale-product`,unit:'unit'});
  const bom=await create('boms',{code:`${tag}-BOM2`,productId:p.id,productName:p.name,items:[{materialId:m.id,quantity:1}],laborHours:2,laborRate:100000,machineCost:10000});
  const job=await create('production-orders',{productId:p.id,bomId:bom.id,quantity:1,date});
  const edited=await ok('PUT',`/production-orders/${job.id}`,{quantity:10});
  return {confirmed:edited.quantity===10&&edited.plannedLaborHours===2&&edited.plannedMachineCost===10000,job,edited,expected:{plannedLaborHours:20,plannedMachineCost:100000}};
});
await probe('Quotation accepts a BOM belonging to a different product and converts it to production',async()=>{
  const m=await create('materials',{name:`${tag}-mismatch-material`,unit:'kg',unitCost:1000});
  const pA=await create('products',{name:`${tag}-product-A`,unit:'unit'}),pB=await create('products',{name:`${tag}-product-B`,unit:'unit'});
  const bom=await create('boms',{code:`${tag}-BOM3`,productId:pA.id,productName:pA.name,items:[{materialId:m.id,quantity:1}],laborHours:2,laborRate:100000,machineCost:10000});
  const quote=await create('quotations',{code:`${tag}-Q-MISMATCH`,title:pB.name,productId:pB.id,bomId:bom.id,quantity:1,unitPrice:1000000,date});
  for(const step of ['submit-for-approval','approve','mark-sent','accept']) await ok('POST',`/quotations/${quote.id}/actions/${step}`,{});
  const converted=await ok('POST',`/quotations/${quote.id}/actions/create-production`,{assignedTo:users.WORKSHOP.id});
  return {confirmed:converted.createdProduction.productId===pB.id&&converted.createdProduction.bom.productId===pA.id,quote,job:converted.createdProduction,expected:'Reject mismatched BOM product before quotation saving/conversion.'};
});
await probe('Any tiny positive labor log bypasses required reason for labor below plan',async()=>{
  const job=await create('production-orders',{productName:`${tag}-short-labor`,quantity:1,assignedTo:users.WORKSHOP.id,plannedLaborHours:8,laborRate:100000,date});
  await action(job.id,'start',{},'WORKSHOP');
  await create('labor-logs',{productionOrderId:job.id,hours:0.01,date},'WORKSHOP');
  const completed=await action(job.id,'complete',{},'WORKSHOP');
  return {confirmed:completed.status==='COMPLETED',job,completed,expected:'If below-plan labor requires discrepancy reason, 0.01/8h should require it instead of accepting empty note.'};
});
await writeFile(new URL('./stock-production-probes.json',import.meta.url),JSON.stringify({base,tag,date,workshopId:users.OWNER.workshopId,cases,http},null,2));
console.log(JSON.stringify({tag,cases:cases.map(({name,confirmed,error})=>({name,confirmed,error}))},null,2));
