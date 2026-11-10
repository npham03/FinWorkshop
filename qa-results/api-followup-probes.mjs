import fs from 'node:fs/promises';
const evidence=JSON.parse(await fs.readFile(new URL('./api-candidate-evidence.json',import.meta.url),'utf8'));
const base=evidence.api;
if(base!=='http://127.0.0.1:3002/api')throw new Error('Dedicated isolated QA API only');
const email=`${evidence.tag.toLowerCase()}@qa.invalid`;
let token;
async function request(method,path,body,authenticated=true){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(authenticated&&token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json().catch(()=>({}))};}
function record(name,details){evidence.probes.push({name,...details});console.log(name,JSON.stringify(details));}
try{
 const short=await request('POST','/auth/login',{email,password:'Q'.repeat(72)},false);
 const full=await request('POST','/auth/login',{email,password:'Q'.repeat(73)},false);
 record('Password bcrypt truncation collision',{configuredLength:73,prefixLength:72,prefixLoginStatus:short.status,fullLoginStatus:full.status});
 token=full.data.token;
 if(!token)throw new Error('Own QA account login unavailable');
 const accounts=await request('GET','/cash-accounts');
 const account=accounts.data.find(a=>a.name===`${evidence.tag} cash`);
 const patched=await request('PUT',`/cash-accounts/${account.id}`,{balance:9876543});
 const after=(await request('GET','/cash-accounts')).data.find(a=>a.id===account.id);
 record('Cash account direct balance mutation',{status:patched.status,balanceBefore:account.balance,balanceAfter:after.balance,openingBalanceBefore:account.openingBalance,openingBalanceAfter:after.openingBalance});
 const taxRuleBefore=await request('GET','/tax-rules');
 const negative=await request('GET','/invoices',undefined,false);
 record('Unauthenticated financial data negative control',{status:negative.status});
 const quote=await request('POST','/quotations',{code:`${evidence.tag}-STALE-BOM`,title:'QA quotation no BOM',customerName:'QA local customer',bomId:'',bom:{id:'old-qa-bom',productId:'missing-old-product',items:[{materialId:'missing-old-material',quantity:2}]},materialCost:1200,laborHours:2,laborRate:100,machineCost:50,wasteRate:0.1,marginRate:0.2,quantity:1,taxRate:0});
 record('Cleared quotation BOM stale snapshot',{status:quote.status,bomId:quote.data.bomId,bom:quote.data.bom,costEstimate:quote.data.costEstimate,suggestedUnitPrice:quote.data.suggestedUnitPrice});
}catch(error){evidence.followupFatal=error.message;process.exitCode=1;console.error(error.stack)}finally{await fs.writeFile(new URL('./api-candidate-evidence.json',import.meta.url),JSON.stringify(evidence,null,2));}
