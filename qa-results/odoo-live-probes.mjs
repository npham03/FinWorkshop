import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const base = 'http://127.0.0.1:3006/api';
const tag = 'QA-ODOO-' + Date.now();
const email = tag.toLowerCase() + '@fintax.invalid';
const password = 'OnlyLocalQATest@2026';
const results = [];
let token, otp;
async function request(method, path, body) {
  const response = await fetch(base+path, {
    method, headers: {...(token ? {Authorization:'Bearer '+token} : {}), ...(body ? {'Content-Type':'application/json'} : {})},
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60000)
  });
  const json = await response.json();
  return {status:response.status, body:json};
}
async function check(name, run) {
  try { const evidence = await run(); results.push({name,status:'PASS', evidence}); console.log('PASS '+name); }
  catch(e) { results.push({name,status:'FAIL',error:e.message}); console.log('FAIL '+name+': '+e.message); }
}
await check('New business registers with live Odoo', async()=>{
  const r = await request('POST','/auth/register',{name:'Chủ xưởng QA Odoo', email, password, workshopName:tag, mode:'CREATE_WORKSHOP'});
  assert.equal(r.status,201,JSON.stringify(r));
  assert.equal(r.body.odooSyncStatus,'SYNCED',JSON.stringify(r.body));
  return r;
});
await check('New owner can log in', async()=>{
  const r=await request('POST','/auth/login',{email,password});
  assert.equal(r.status,200,JSON.stringify(r));
  token=r.body.token;
  return {status:r.status,role:r.body.user.role,workshopId:r.body.user.workshopId};
});
await check('Integration reports real Odoo connection',async()=>{
  const r=await request('GET','/integrations/status');
  assert.equal(r.status,200); assert.equal(r.body.odoo.connected,true,JSON.stringify(r.body));
  return r;
});
await check('Owner provisions isolated Odoo company',async()=>{
  const r=await request('POST','/integrations/odoo/company',{});
  assert.equal(r.status,200,JSON.stringify(r)); return r;
});
await check('Integration queue is scoped and executable',async()=>{
  const r=await request('POST','/integrations/odoo/sync-pending',{});
  assert.equal(r.status,200,JSON.stringify(r)); return r;
});
await check('Password recovery through Odoo can request OTP without SMTP',async()=>{
  const r=await request('POST','/auth/forgot-password',{email});
  assert.equal(r.status,200,JSON.stringify(r));
  otp=r.body.debugCode;
  const safe={...r.body};for(const key of Object.keys(safe))if(/code|otp|token/i.test(key))safe[key]='[REDACTED]';
  return {status:r.status,body:safe};
});
await check('Invalid OTP is rejected',async()=>{
  const r=await request('POST','/auth/reset-password',{email,code:'INVALID',newPassword:'ChangedLocalTest@2026'});
  assert.ok([400,422].includes(r.status),JSON.stringify(r));
  return r;
});
await check('Valid development OTP resets password and cannot be reused',async()=>{
  assert.ok(otp,'No development OTP was returned; real SMTP delivery is outside this test');
  const r=await request('POST','/auth/reset-password',{email,code:otp,newPassword:'ChangedLocalTest@2026'});
  assert.equal(r.status,200,JSON.stringify(r));
  const oldLogin=await request('POST','/auth/login',{email,password});
  assert.equal(oldLogin.status,401);
  const newLogin=await request('POST','/auth/login',{email,password:'ChangedLocalTest@2026'});
  assert.equal(newLogin.status,200);
  const repeated=await request('POST','/auth/reset-password',{email,code:otp,newPassword:'AnotherLocalTest@2026'});
  assert.equal(repeated.status,400,JSON.stringify(repeated));
  return {resetStatus:r.status,oldPasswordLogin:oldLogin.status,newPasswordLogin:newLogin.status,reusedOtpStatus:repeated.status};
});
await fs.mkdir('qa-results',{recursive:true});
await fs.writeFile('qa-results/odoo-live.json',JSON.stringify({commit:'399cbddfa0be540a80a3facc1c6ef0569e695068',scope:'Local isolated Odoo 16 at 8079; SMTP not configured; no real email or tax submission',results},null,2));
