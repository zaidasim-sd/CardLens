import test from 'node:test';import assert from 'node:assert/strict';import {generateKeyPairSync} from 'node:crypto';import {GoogleAuth} from 'google-auth-library';import {createSubmissionSheetGateway,sheetRow} from './sheetService.js';
const headers=['Lead71 Record ID','Place/Exhibition','Contact Name','Company Name','Job Title','Email Address','Phone Number','Short Notes','Date Captured','Time(GMT-4)','Captured By'];
const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
const env={GOOGLE_SHEET_ID:'dummy',GOOGLE_SHEET_TEST_ID:'dummy',GOOGLE_SHEET_TAB:'Sheet1',GOOGLE_SHEET_TAB_ID:'0',GOOGLE_SERVICE_ACCOUNT_EMAIL:'dummy@example.test',GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY:privateKey};
test('renamed register resolves by ID and never writes Overview',async()=>{
 const original=GoogleAuth.prototype.getAccessToken;GoogleAuth.prototype.getAccessToken=async()=>'dummy';const requests=[];
 try{const gateway=createSubmissionSheetGateway(env,async(url,options={})=>{
  const decoded=decodeURIComponent(url);requests.push({url:decoded,method:options.method||'GET'});
  if(decoded.includes('?fields='))return Response.json({sheets:[{properties:{sheetId:8,title:'Overview'}},{properties:{sheetId:0,title:'Lead71 Contact Register'}}]});
  if(decoded.includes("'Sheet1'!"))return Response.json({error:{}},{status:400});
  assert.ok(decoded.includes("'Lead71 Contact Register'!"));
  return Response.json(options.method==='POST'?{updates:{updatedRange:"'Lead71 Contact Register'!A2:K2"}}:{values:[headers]});
 });
 await gateway.readAll();assert.equal(await gateway.append(sheetRow({recordId:'L71-QA',createdAt:'2026-11-11T10:00:00Z',verifiedData:{}})),2);
 assert.equal(requests.filter(r=>r.method==='POST').length,1);assert.ok(!requests.some(r=>r.url.includes("'Overview'!")));
 }finally{GoogleAuth.prototype.getAccessToken=original}
});
test('missing pinned register does not fall back to another worksheet',async()=>{
 const original=GoogleAuth.prototype.getAccessToken;GoogleAuth.prototype.getAccessToken=async()=>'dummy';let posts=0;
 try{const gateway=createSubmissionSheetGateway(env,async(url,options={})=>{if(options.method)posts++;return url.includes('?fields=')?Response.json({sheets:[{properties:{sheetId:8,title:'Overview'}}]}):Response.json({error:{}},{status:400});});await assert.rejects(gateway.readAll(),{code:'SHEET_RANGE_INVALID'});assert.equal(posts,0)}finally{GoogleAuth.prototype.getAccessToken=original}
});
