import dotenv from 'dotenv';
import {fileURLToPath} from 'node:url';
dotenv.config({path:process.env.DOTENV_CONFIG_PATH||fileURLToPath(new URL('./.env',import.meta.url))});
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {executeOdoo as rpc} from './src/odoo.js';
import {configureOdooVnd} from './src/odoo-currency.js';
const host=new URL(process.env.ODOO_URL).hostname;
if(!['127.0.0.1','localhost'].includes(host))throw new Error('This configuration command is limited to the local Odoo requested for FinWorkshop.');
const [company]=await rpc('res.company','search_read',[[]],{fields:['id','name','currency_id'],limit:1});
const currencies=await rpc('res.currency','search_read',[[['name','in',['VND','USD']]]],{fields:['id','name','active','rounding'],context:{active_test:false}});
const rates=await rpc('res.currency.rate','search_read',[[['company_id','=',company.id],['currency_id','in',currencies.map(r=>r.id)]]],{fields:['id','currency_id','company_id','name','rate'],order:'name desc'});
const posted=await rpc('account.move','search_read',[[['company_id','=',company.id],['state','=','posted']]],{fields:['id','state','amount_total','amount_total_signed','currency_id'],order:'id'});
const fingerprint=(rows)=>createHash('sha256').update(JSON.stringify([...rows].sort((a,b)=>a.id-b.id))).digest('hex');
const beforeHash=fingerprint(posted);
const snapshot={company,currencies,rates,postedCount:posted.length,postedFingerprint:beforeHash,savedAt:new Date().toISOString()};
if(!process.argv.includes('--apply')){console.log(JSON.stringify({...snapshot,ratesCount:rates.length,rates:undefined,decision:posted.length?'MULTICURRENCY_VND':'CHECK_JOURNAL_LINES_BEFORE_BASE_CHANGE'},null,2));}
else{
 const i=process.argv.indexOf('--backup');const backup=i>=0?process.argv[i+1]:`apps/middleware-api/test-artifacts/odoo-vnd-before-${Date.now()}.json`;
 if(!backup)throw new Error('Missing backup filename.');
 await fs.mkdir(path.dirname(path.resolve(backup)),{recursive:true});await fs.writeFile(backup,JSON.stringify(snapshot,null,2),{flag:'wx'});
 const result=await configureOdooVnd({allowBaseChange:true});
 const after=posted.length?await rpc('account.move','read',[posted.map(r=>r.id)],{fields:['id','state','amount_total','amount_total_signed','currency_id']}):[];
 assert.equal(fingerprint(after),beforeHash,'Existing posted amounts changed during configuration.');
 assert.equal(result.ready,true,result.message);console.log(JSON.stringify({...result,existingPostedUnchanged:posted.length,backup},null,2));
}
