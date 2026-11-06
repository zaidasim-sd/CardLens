import test from 'node:test';
import assert from 'node:assert/strict';
import {isAdministrator,signIn} from './service.js';
test('Ali staging administrator configuration never grants production access',()=>{
 const before={...process.env};
 try{
  for(const key of ['HALA_APPROVAL_EMAIL','OSMAN_APPROVAL_EMAIL','ADMIN_EMAILS','APPROVER_EMAILS','SEED_ADMIN_EMAIL'])delete process.env[key];
  process.env.STAGING_ADMIN_EMAILS='az@vision71tech.com';process.env.VERCEL_ENV='production';process.env.APP_ENV='staging';
  assert.equal(isAdministrator('az@vision71tech.com'),true);
  process.env.APP_ENV='production';delete process.env.VITE_IS_STAGING;
  assert.equal(isAdministrator('az@vision71tech.com'),false);
 }finally{for(const key of Object.keys(process.env))if(!(key in before))delete process.env[key];Object.assign(process.env,before);}
});
test('verified staging identity receives the administrator session needed for authorization',async()=>{
 const before={...process.env},previousFetch=globalThis.fetch;
 try{
  process.env.APP_ENV='staging';process.env.VERCEL_ENV='production';process.env.STAGING_ADMIN_EMAILS='az@vision71tech.com';process.env.FIREBASE_API_KEY='fixture';
  globalThis.fetch=async()=>({ok:true,json:async()=>({users:[{localId:'fixture-ali',email:'az@vision71tech.com',emailVerified:true}]})});
  const db={collection(name){if(name==='sessions')return {findOne:async()=>null,insertOne:async()=>{}};if(name==='rateLimits')return {findOneAndUpdate:async()=>({count:1})};if(name==='auditLogs')return {insertOne:async()=>{}};assert.fail('Unexpected collection '+name);}};
  const result=await signIn(db,{idToken:'fixture-verified-identity'});
  assert.equal(result.user.role,'vision71_administrator');assert.equal(result.user.email,'az@vision71tech.com');
 }finally{globalThis.fetch=previousFetch;for(const key of Object.keys(process.env))if(!(key in before))delete process.env[key];Object.assign(process.env,before);}
});
