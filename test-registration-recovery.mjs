import 'dotenv/config';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { initDb,getPool,DEFAULT_WORKSHOP_ID } from './apps/middleware-api/src/db.js';
if(process.env.DB_NAME !== 'finworkshop_upgrade_test') throw new Error('Use isolated finworkshop_upgrade_test database.');
const {id,email,password}=JSON.parse(await fs.readFile('apps/middleware-api/test-registration.json','utf8'));
await initDb();
try{
 const [users]=await getPool().query("SELECT id,full_name FROM users WHERE role='OWNER' AND workshop_id=? AND active=TRUE LIMIT 1",[DEFAULT_WORKSHOP_ID]);
 const token=jwt.sign({id:users[0].id,name:users[0].full_name,role:'OWNER',workshopId:DEFAULT_WORKSHOP_ID},process.env.JWT_SECRET||'local-development-secret-change-me',{expiresIn:'10m'});
 const response=await fetch(`http://127.0.0.1:3003/api/users/${id}/status`,{method:'PATCH',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({active:true})});
 const approved=await response.json();assert.equal(response.status,200,JSON.stringify(approved));assert.equal(approved.active,true);assert.equal(approved.odooSyncStatus,'SYNCED');
 const login=await fetch('http://127.0.0.1:3003/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});assert.equal(login.status,200,JSON.stringify(await login.json()));
 // Leave this throwaway registration suspended after proving recovery.
 const suspend=await fetch(`http://127.0.0.1:3003/api/users/${id}/status`,{method:'PATCH',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({active:false})});assert.equal(suspend.status,200);
 console.log('PASS Live Odoo recovery: offline registration -> owner approval -> SYNCED + active -> login, test user suspended afterwards');
}catch(error){console.error(error);process.exitCode=1;}finally{await getPool().end();}
