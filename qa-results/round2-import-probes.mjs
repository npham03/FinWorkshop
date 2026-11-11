import fs from 'node:fs/promises';
import XLSX from 'xlsx';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:3006/api', tag='QA2-IMPORT-'+Date.now(), date='2026-11-11', results=[];
let token; const traces=[];
const clean=value=>Array.isArray(value)?value.map(clean):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([k])=>!['password','token','debugCode'].includes(k)).map(([k,v])=>[k,clean(v)])):value;
async function call(method,path,body) {
  const multipart=body instanceof FormData;
  const r=await fetch(base+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(!multipart&&body?{'Content-Type':'application/json'}:{})},body:body?multipart?body:JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});
  const data=await r.json();traces.push({method,path,status:r.status,request:multipart?'XLSX rows retained in case evidence':clean(body),response:clean(data)});return {status:r.status,data};
}
async function ok(method,path,body,status=200){const r=await call(method,path,body);assert.equal(r.status,status,JSON.stringify(r));return r.data;}
const create=(entity,body)=>ok('POST','/'+entity,body,201);
async function preview(rows){
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'Statement');
  const body=new FormData();body.append('file',new Blob([XLSX.write(wb,{type:'buffer',bookType:'xlsx'})],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),tag+'.xlsx');
  return ok('POST','/import/transactions/preview',body);
}
async function check(name,run){const first=traces.length;try{const value=await run();results.push({name,...value,trace:[first,traces.length-1]});console.log(name+': '+value.confirmed);}catch(e){results.push({name,error:e.message,trace:[first,traces.length-1]});console.log(name+': ERROR '+e.message);}}
const email=tag.toLowerCase()+'@fintax.invalid';
await ok('POST','/auth/register',{name:tag,email,password:'OnlyQAImport@2026',workshopName:tag,mode:'CREATE_WORKSHOP'},201);
token=(await ok('POST','/auth/login',{email,password:'OnlyQAImport@2026'})).token;
const a=await create('cash-accounts',{name:tag+'-BANK-A',type:'BANK',openingBalance:1000000});
const b=await create('cash-accounts',{name:tag+'-BANK-B',type:'BANK',openingBalance:1000000});
await check('Opposite directions wrongly deduplicated',async()=>{
  const rows=[{date,description:tag+'-same-label',credit:1000,debit:0,reference:tag+'-IN'},{date,description:tag+'-same-label',credit:0,debit:1000,reference:tag+'-OUT'}];
  const p=await preview(rows);const committed=await ok('POST','/import/transactions/'+p.importId+'/commit',{accountId:a.id});
  return {confirmed:committed.createdCount!==2,expectedCount:2,sourceRows:rows,preview:p,committed};
});
await check('Same legitimate transaction details on another bank skipped',async()=>{
  const rows=[{date,description:tag+'-two-banks',credit:700,debit:0,reference:tag+'-BANK1'}];
  const p1=await preview(rows);await ok('POST','/import/transactions/'+p1.importId+'/commit',{accountId:a.id});
  const p2=await preview([{...rows[0],reference:tag+'-BANK2'}]);const c2=await ok('POST','/import/transactions/'+p2.importId+'/commit',{accountId:b.id});
  return {confirmed:c2.createdCount!==1,expectedCount:1,preview:p2,committed:c2};
});
await check('Both debit and credit populated not rejected',async()=>{
  const rows=[{date,description:tag+'-ambiguous',credit:2000,debit:3000,reference:tag+'-BOTH'}];
  const p=await preview(rows);const c=await ok('POST','/import/transactions/'+p.importId+'/commit',{accountId:a.id});
  return {confirmed:p.errorCount===0&&c.createdCount===1,expected:'Row should be flagged ambiguous before commit',sourceRows:rows,preview:p,committed:c};
});
await check('Decimal-formatted VND strings imported at 100 times amount',async()=>{
  const rows=[{date,description:tag+'-format-us',credit:'1,000.00',reference:tag+'-DEC-US'},{date,description:tag+'-format-vn',credit:'1.000,00',reference:tag+'-DEC-VN'}];
  const p=await preview(rows);const c=await ok('POST','/import/transactions/'+p.importId+'/commit',{accountId:a.id});
  return {confirmed:c.records.some(r=>r.amount!==1000),expectedAmounts:[1000,1000],sourceRows:rows,actualAmounts:c.records.map(r=>r.amount),preview:p};
});
await check('Concurrent commit imports same statement twice',async()=>{
  const rows=Array.from({length:12},(_,i)=>({date,description:tag+'-race-'+i,credit:123,debit:0,reference:tag+'-RACE-'+i}));
  const p=await preview(rows);
  const commits=await Promise.all([call('POST','/import/transactions/'+p.importId+'/commit',{accountId:a.id}),call('POST','/import/transactions/'+p.importId+'/commit',{accountId:a.id})]);
  const stored=(await ok('GET','/transactions')).filter(r=>String(r.externalReference).startsWith(tag+'-RACE-'));
  return {confirmed:stored.length>12,expectedStored:12,actualStored:stored.length,statuses:commits.map(r=>r.status),commitCounts:commits.map(r=>r.data.createdCount)};
});
await check('Malformed report date range silently accepted',async()=>{
  const queries=['/reports/books?from=2026-12-31&to=2026-01-01','/reports/sme?from=banana&to=potato'];
  const probes=[];for(const q of queries){const r=await call('GET',q);probes.push({path:q,status:r.status,hasBooks:!!r.data.books});}
  return {confirmed:probes.every(r=>r.status===200),expected:'400/422 with invalid period message, consistent with dashboard',probes};
});
await fs.writeFile('qa-results/round2-import-evidence.json',JSON.stringify({commit:'399cbddfa0be540a80a3facc1c6ef0569e695068',tag,base,date,results,traces},null,2));
