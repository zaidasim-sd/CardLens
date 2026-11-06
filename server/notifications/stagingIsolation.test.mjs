import test from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import { isStagingEnvironment, sendLead71Email } from './emailService.js';
import { registerUser } from '../auth/service.js';
import { requestPasswordReset } from '../auth/passwordReset.js';
import { isStagingDeployment, assertStagingClientEmailAllowed } from '../../shared/stagingIsolation.mjs';

test('staging identity survives the Vercel production slot and known staging host', () => {
  assert.equal(isStagingDeployment({APP_ENV:'staging',VERCEL_ENV:'production'}),true);
  assert.equal(isStagingDeployment({VERCEL_ENV:'production'},'lead71-cc-staging.vercel.app'),true);
  assert.equal(isStagingDeployment({APP_ENV:'production',VERCEL_ENV:'production'},'lead71.com'),false);
});

test('staging blocks client domain and subdomains regardless of case or allowlist', () => {
  for(const email of ['probe@aventureaviation.com',' Probe@AVENTUREAVIATION.COM ','probe@sub.aventureaviation.com']) {
    assert.throws(()=>assertStagingClientEmailAllowed(email,{APP_ENV:'staging',VERCEL_ENV:'production'}),{code:'STAGING_RESTRICTED'});
  }
  assert.doesNotThrow(()=>assertStagingClientEmailAllowed('probe@vision71tech.com',{APP_ENV:'staging'}));
  assert.doesNotThrow(()=>assertStagingClientEmailAllowed('probe@aventureaviation.com',{APP_ENV:'production',VERCEL_ENV:'production'}));
});

test('SMTP transport is never created for blocked recipients including mixed lists and groups', async () => {
  const before={...process.env},create=nodemailer.createTransport;let transports=0;
  try {
    process.env.APP_ENV='staging';process.env.VERCEL_ENV='production';
    process.env.STAGING_EMAIL_ALLOWLIST='probe@aventureaviation.com,internal@vision71tech.com';
    nodemailer.createTransport=()=>{transports++;throw new Error('Transport must not be called');};
    assert.equal(isStagingEnvironment(),true);
    for(const to of ['probe@aventureaviation.com','Person <Probe@AventureAviation.com>','internal@vision71tech.com, probe@aventureaviation.com',['internal@vision71tech.com','probe@sub.aventureaviation.com'],{name:'Client',address:'probe@aventureaviation.com'},'Team: internal@vision71tech.com, probe@aventureaviation.com;']) {
      await assert.rejects(sendLead71Email({to,subject:'mock only',text:'not sent'}),{code:'STAGING_EMAIL_BLOCKED'});
    }
    assert.equal(transports,0);
  } finally {nodemailer.createTransport=create;restore(before);}
});

test('verified client registration stops before database or notifications in staging production slot', async () => {
  const before={...process.env},fetchBefore=globalThis.fetch;let writes=0,notifications=0;
  try {
    process.env.APP_ENV='staging';process.env.VERCEL_ENV='production';process.env.FIREBASE_API_KEY='fixture';
    globalThis.fetch=async()=>({ok:true,json:async()=>({users:[{localId:'fixture',email:'probe@aventureaviation.com',emailVerified:true}]})});
    const db={collection(){writes++;throw new Error('No database access permitted');}};
    await assert.rejects(registerUser(db,{idToken:'mock-only'},{notify:async()=>{notifications++;}}),{code:'STAGING_RESTRICTED'});
    assert.equal(writes,0);assert.equal(notifications,0);
  } finally {globalThis.fetch=fetchBefore;restore(before);}
});

test('password reset blocks before token generation provider call database or mail', async () => {
  let calls=0;const forbidden=()=>{calls++;throw new Error('No side effect permitted');};
  await assert.rejects(requestPasswordReset({collection:forbidden},{email:'probe@aventureaviation.com'},{env:{APP_ENV:'staging',VERCEL_ENV:'production'},getToken:forbidden,fetcher:forbidden,sendEmail:forbidden,baseUrl:'https://lead71-cc-staging.vercel.app'}),{code:'STAGING_RESTRICTED'});
  assert.equal(calls,0);
});
function restore(before){for(const key of Object.keys(process.env))if(!(key in before))delete process.env[key];Object.assign(process.env,before);}
