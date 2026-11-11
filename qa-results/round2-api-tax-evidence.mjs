import fs from 'node:fs/promises';
const file=new URL('./round2-api-evidence.json',import.meta.url);
const evidence=JSON.parse(await fs.readFile(file,'utf8'));
const edit=evidence.probes.find(p=>p.name==='Invoice coded then edited');
const recode=evidence.probes.find(p=>p.name==='Already coded invoice recode');
const checks=[];
for(const code of [edit?.originalCode,recode?.afterCode].filter(Boolean)){
 const response=await fetch(`http://127.0.0.1:4000/api/tax/invoice/verify/${encodeURIComponent(code)}`);
 const data=await response.json();
 checks.push({code,status:response.status,record:data.data});
}
evidence.probes.push({name:'Mock authority lookup corroboration',checks});
await fs.writeFile(file,JSON.stringify(evidence,null,2));
console.log(JSON.stringify(checks,null,2));
