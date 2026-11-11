import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { encryptValue } from '../security/encryption.js';
import { personalStagingConfig, personalStagingStatus, personalStagingPayload, allowedCall, deliverPersonalStagingContact, beginPersonalStagingConnection, finishPersonalStagingConnection, PERSONAL_STAGING_LIST_ID, PERSONAL_STAGING_LIST_NAME, PERSONAL_STAGING_CALLBACK } from './personalStagingConstantContact.js';
import { createPersonalStagingHandler } from '../http/personalStagingConstantContactHandler.js';
import { submitPersonalStagingContact, verifyPersonalStagingSheetRecord } from './personalStagingSubmission.js';
import { createCard } from '../cards/service.js';
import mapping from '../../config/sheetMapping.json' with { type: 'json' };

process.env.ENCRYPTION_KEY = 'a'.repeat(64); // Test fixture only. No .env is loaded.
const jwt = 'fixture.' + Buffer.from(JSON.stringify({sub:'fixture-personal-subject'})).toString('base64url') + '.fixture';
const env = { APP_ENV:'staging', APP_ORIGIN:'https://lead71-cc-staging.vercel.app/', CC_PERSONAL_STAGING_ENABLED:'true', CC_STAGING_WRITES_ENABLED:'true', CC_CLIENT_ID:'fixture-personal-client', CC_CLIENT_SECRET:'fixture-personal-secret', CC_LIST_ID:PERSONAL_STAGING_LIST_ID, CC_LIST_NAME:PERSONAL_STAGING_LIST_NAME, CC_REDIRECT_URI:PERSONAL_STAGING_CALLBACK, CC_STAGING_NOTES_FIELD_ID:'00000000-0000-4000-8000-000000000099', CC_STAGING_SUBJECT_HASH:createHash('sha256').update('fixture-personal-subject').digest('hex'), MONGODB_DB:'fixture_staging', GOOGLE_SHEET_ID:'1ztzQ61buLJ4kCgxH2oHn9pXqIl36mQGTx4TVANL10sM', GOOGLE_SHEET_TAB:'Sheet1' };
const user = {id:'fixture-user',tenantId:'fixture-tenant',role:'vision71_administrator'};
const card = {id:'00000000-0000-4000-8000-000000000001',recordId:'L71-TEST-001',capturedBy:user.id,tenantId:user.tenantId,sheetStatus:'submitted',sheetDeliveryVerified:true,verifiedData:{fullName:'Dummy Contact',companyName:'Fixture Company',jobTitle:'Researcher',email:'dummy@example.test',phone:'+1 202 555 0100',notes:'Preserve this note',meetingContext:{metAtLocation:'Fixture Event'}}};
function matches(doc,query) {
  return Object.entries(query).every(([key,value])=>{
    if(key==='$or')return value.some(q=>matches(doc,q));
    const actual=doc[key];
    if(value&&typeof value==='object'&&!(value instanceof Date))return Object.entries(value).every(([op,v])=>op==='$exists'?(actual!==undefined)===v:op==='$lt'?actual<v:op==='$gt'?actual>v:op==='$in'?v.includes(actual):op==='$nin'?!v.includes(actual):false);
    return actual===value;
  });
}
export function fixture() {
  const docs=[],calls=[];
  const settings={
    async findOne(q){return structuredClone(docs.find(d=>matches(d,q)));},
    async insertOne(d){if(docs.some(v=>v.key===d.key&&v.tenantId===d.tenantId))throw Object.assign(new Error(),{code:11000});docs.push(structuredClone(d));},
    async updateOne(q,u,opt={}){let d=docs.find(d=>matches(d,q));if(!d&&opt.upsert){d={...q};docs.push(d);}if(!d)return;Object.assign(d,u.$set);for(const k of Object.keys(u.$unset||{}))delete d[k];},
    async findOneAndUpdate(q,u){const d=docs.find(d=>matches(d,q));if(!d)return null;Object.assign(d,u.$set);return structuredClone(d);},
    async findOneAndDelete(q){const i=docs.findIndex(d=>matches(d,q));return i<0?null:docs.splice(i,1)[0];},
  };
  const session={_id:'session',userId:user.id,user,absoluteExpiresAt:new Date(Date.now()+3600000),lastSeenAt:new Date(),anonymous:false};
  const db={collection(name){assert.ok(['settings','sessions'].includes(name),'No contact collection is allowed');return name==='settings'?settings:{findOne:async q=>matches(session,q)?session:null};}};
  const key=`cc_personal_staging_connection:${createHash('sha256').update(env.CC_CLIENT_ID).digest('hex')}:${PERSONAL_STAGING_LIST_ID}`;
  docs.push({tenantId:user.tenantId,key,tokens:encryptValue({access:jwt,refresh:'fixture-refresh',expires:Date.now()+3600000})});
  const fetcher=async(url,options)=>{calls.push({url,options});if(url.endsWith('/token'))return Response.json({access_token:jwt,refresh_token:'rotated-fixture',expires_in:3600});if(url.endsWith(`/contact_lists/${PERSONAL_STAGING_LIST_ID}`))return Response.json({list_id:PERSONAL_STAGING_LIST_ID,name:PERSONAL_STAGING_LIST_NAME});if(url.endsWith('/contacts')&&options.method==='POST')return Response.json({contact_id:'fixture-created-id'},{status:201});assert.fail('Unapproved URL '+url);};
  return {db,docs,calls,fetcher,settings,session};
}

test('personal staging refuses production targets and production credential fallback', () => {
  for (const patch of [
    {APP_ENV:'production'}, {APP_ORIGIN:'https://lead71.com'},
    {GOOGLE_SHEET_ID:'production-sheet'}, {CC_LIST_ID:'dac5ef72-d908-11f1-a1dc-02420a320002'},
    {CC_CLIENT_ID:'',CC_API_KEY_PRODUCTION:'production-key'},
    {CC_CLIENT_SECRET:'',CC_CLIENT_SECRET_STAGING_PRODUCTION:'client-secret'},
    {CC_REDIRECT_URI:'https://lead71.com/api/constantcontact?action=callback'},
  ]) assert.throws(() => personalStagingConfig({...env,...patch}));
  assert.equal(personalStagingConfig(env).clientId,env.CC_CLIENT_ID);
});

test('edited review notes reach the Sheet and sole personal list exactly once', async () => {
  const f=fixture(),rows=[mapping.columns.map(c=>c.header)];
  const reviewed={...card.verifiedData,notes:'Reviewed note\nFollow up on demonstration.'};
  const gateway={readAll:async()=>rows,append:async row=>{rows.push(row);return 2;}};
  const input={submissionId:card.id,verifiedData:reviewed,ocrData:{...card.verifiedData,notes:'stale OCR note'},status:'submitted'};
  f.docs.push({tenantId:user.tenantId,key:`submission:${user.tenantId}:${user.id}:${card.id}`,recordId:card.recordId,createdAt:new Date()});
  const deps={env,saveSheet:(db,u,v)=>createCard(db,u,v,new Date(),{sheet:{gateway}}),verify:(c,e)=>verifyPersonalStagingSheetRecord(c,e,gateway),deliver:(db,u,c)=>deliverPersonalStagingContact(db,u,c,env,f.fetcher)};
  assert.equal((await submitPersonalStagingContact(f.db,user,input,deps)).transferStatus,'transferred');
  assert.equal(rows[1][mapping.columns.findIndex(c=>c.field==='notes')],reviewed.notes);
  const body=JSON.parse(f.calls.find(c=>c.options.method==='POST').options.body);
  assert.deepEqual(body.notes,[{content:reviewed.notes}]);
  assert.deepEqual(body.custom_fields,[{custom_field_id:env.CC_STAGING_NOTES_FIELD_ID,value:reviewed.notes}]);
  assert.deepEqual(body.list_memberships,[PERSONAL_STAGING_LIST_ID]);
  await submitPersonalStagingContact(f.db,user,input,deps);
  assert.equal(rows.length,2);
  assert.equal(f.calls.filter(c=>c.options.method==='POST').length,1);
});

test('notes limits preserve the full text and fail before Sheet save when exceeded', async () => {
  assert.equal(personalStagingPayload({...card.verifiedData,notes:''},env).notes,undefined);
  assert.equal(personalStagingPayload({...card.verifiedData,notes:'x'.repeat(2000)},env).notes[0].content.length,2000);
  let writes=0;
  await assert.rejects(submitPersonalStagingContact(null,user,{verifiedData:{...card.verifiedData,notes:'x'.repeat(2001)}},{env,saveSheet:async()=>{writes++;}}),{code:'CC_NOTES_TOO_LONG'});
  assert.equal(writes,0);
});

test('unapproved endpoints, other memberships and malformed notes fail before network access', async () => {
  const f=fixture(),body=personalStagingPayload(card.verifiedData,env);
  for(const [path,method,data] of [
    ['/contact_lists','GET'], ['/contacts?email=test@example.com','GET'],
    ['/contacts/existing','PUT',body], ['/emails','POST',{}],
    ['/contacts','POST',{...body,list_memberships:['other']}],
    ['/contacts','POST',{...body,notes:[{content:'ok',note_id:'existing'}]}],
    ['/contacts','POST',{...body,notes:[{content:'x'.repeat(2001)}]}],
  ]) await assert.rejects(allowedCall(f.db,user.tenantId,path,method,data,env,f.fetcher),{code:'CC_OPERATION_REFUSED'});
  assert.equal(f.calls.length,0);
});

test('wrong account tokens are refused before any provider request', async () => {
  const f=fixture();
  const wrong='fixture.'+Buffer.from(JSON.stringify({sub:'client-account'})).toString('base64url')+'.fixture';
  f.docs[0].tokens=encryptValue({access:wrong,refresh:'fixture',expires:Date.now()+3600000});
  assert.equal((await deliverPersonalStagingContact(f.db,user,card,env,f.fetcher)).transferStatus,'failed');
  assert.equal(f.calls.length,0);
});

test('conflict and uncertain creation cannot trigger another create', async () => {
  for(const status of [409,500]) {
    const f=fixture();
    const fetcher=async(u,o)=>u.endsWith('/contacts')?(f.calls.push({url:u,options:o}),Response.json({}, {status})):f.fetcher(u,o);
    const result=await deliverPersonalStagingContact(f.db,user,card,env,fetcher);
    assert.equal(result.transferStatus,status===409?'existing_contact':'reconciliation_required');
    const count=f.calls.length;
    await deliverPersonalStagingContact(f.db,user,card,env,fetcher);
    assert.equal(f.calls.length,count);
  }
});

test('personal OAuth uses distinct client state and cookie with minimal scopes', async () => {
  const f=fixture(),start=await beginPersonalStagingConnection(f.db,user,f.session,env),url=new URL(start.url);
  assert.equal(url.searchParams.get('client_id'),env.CC_CLIENT_ID);
  assert.equal(url.searchParams.get('redirect_uri'),PERSONAL_STAGING_CALLBACK);
  assert.equal(url.searchParams.get('scope'),'contact_data offline_access');
  assert.ok(start.cookie.startsWith('cc_personal_staging_oauth='));
  await finishPersonalStagingConnection(f.db,{code:'fixture-code',state:url.searchParams.get('state')},start.cookie.split(';')[0].split('=')[1],env,f.fetcher);
  assert.equal((await personalStagingStatus(f.db,user.tenantId,env)).connected,true);
});


test('unstarted personal callback fails safely without database access', async () => {
  let accessed=false;
  const handler=createPersonalStagingHandler({env,getDb:async()=>{accessed=true;throw Error();}});
  const res={status(code){this.code=code;return this;},json(body){this.body=body;return this;},setHeader(){}};
  await handler({method:'GET',query:{action:'callback'},headers:{}},res);
  assert.equal(res.code,400);assert.equal(res.body.code,'CC_OAUTH_INVALID');assert.equal(accessed,false);
});

test('notes without their configured custom field fail before Sheet save',async()=>{
  let saved=false;
  await assert.rejects(submitPersonalStagingContact(null,user,{verifiedData:card.verifiedData},{env:{...env,CC_STAGING_NOTES_FIELD_ID:''},saveSheet:async()=>{saved=true;}}),{code:'CC_NOTES_FIELD_REQUIRED'});
  assert.equal(saved,false);
});
test('other custom fields and mismatched note values cannot be sent',async()=>{
  const f=fixture(),body=personalStagingPayload(card.verifiedData,env);
  for(const custom_fields of [undefined,[{custom_field_id:'other',value:card.verifiedData.notes}],[{custom_field_id:env.CC_STAGING_NOTES_FIELD_ID,value:'different'}],[...body.custom_fields,{custom_field_id:'other',value:'extra'}]])
    await assert.rejects(allowedCall(f.db,user.tenantId,'/contacts','POST',{...body,custom_fields},env,f.fetcher),{code:'CC_OPERATION_REFUSED'});
  assert.equal(f.calls.length,0);
});
