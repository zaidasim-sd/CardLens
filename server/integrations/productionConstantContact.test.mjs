import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { encryptValue } from '../security/encryption.js';
import { productionConfig, productionStatus, productionPayload, allowedCall, deliverProductionContact, beginProductionConnection, finishProductionConnection, PRODUCTION_LIST_ID, PRODUCTION_LIST_NAME, PRODUCTION_CALLBACK, LOCAL_PRODUCTION_CALLBACK, LOCAL_TEST_SHEET_ID } from './productionConstantContact.js';
import { createProductionHandler } from '../http/productionConstantContactHandler.js';
import { submitProductionContact, verifyProductionSheetRecord } from './productionSubmission.js';
import { createCard } from '../cards/service.js';
import mapping from '../../config/sheetMapping.json' with { type: 'json' };

process.env.ENCRYPTION_KEY = 'a'.repeat(64); // Test fixture only. No .env is loaded.
const env = { APP_ENV:'production', CC_ENABLED_PRODUCTION:'true', CC_WRITES_ENABLED_PRODUCTION:'true', CC_API_KEY_PRODUCTION:'fixture-production-client', CC_CLIENT_SECRET_PRODUCTION:'fixture-secret', CC_LIST_ID_PRODUCTION:PRODUCTION_LIST_ID, CC_LIST_NAME_PRODUCTION:PRODUCTION_LIST_NAME };
const user = {id:'fixture-user',tenantId:'fixture-tenant',role:'vision71_administrator'};
const localEnv={...env,APP_ENV:'staging',APP_BASE_URL:'http://localhost:5173',MONGODB_DB:'fixture_staging',CC_LOCAL_TEST_MODE_PRODUCTION:'true',GOOGLE_SHEET_ID:LOCAL_TEST_SHEET_ID,GOOGLE_SHEET_TEST_ID:LOCAL_TEST_SHEET_ID,GOOGLE_SHEET_TAB:'Sheet1'};
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
  const key=`cc_production_connection:${createHash('sha256').update(env.CC_API_KEY_PRODUCTION).digest('hex')}:${PRODUCTION_LIST_ID}`;
  docs.push({tenantId:user.tenantId,key,tokens:encryptValue({access:'fixture-access',refresh:'fixture-refresh',expires:Date.now()+3600000})});
  const fetcher=async(url,options)=>{calls.push({url,options});if(url.endsWith('/token'))return Response.json({access_token:'renewed-fixture',refresh_token:'rotated-fixture',expires_in:3600});if(url.endsWith(`/contact_lists/${PRODUCTION_LIST_ID}`))return Response.json({list_id:PRODUCTION_LIST_ID,name:PRODUCTION_LIST_NAME});if(url.endsWith('/contacts')&&options.method==='POST')return Response.json({contact_id:'fixture-created-id'},{status:201});assert.fail('Unapproved URL '+url);};
  return {db,docs,calls,fetcher,settings,session};
}

test('production config refuses wrong environment, destination, callback and generic key fallback',()=>{
  for(const patch of [{APP_ENV:'staging'},{CC_LIST_ID_PRODUCTION:'other'},{CC_LIST_NAME_PRODUCTION:'other'},{CC_REDIRECT_URI_PRODUCTION:'https://other.example/callback'},{CC_API_KEY_PRODUCTION:'',CC_CLIENT_ID:'generic'}])assert.throws(()=>productionConfig({...env,...patch}));
  assert.equal(productionConfig(env).callback,PRODUCTION_CALLBACK);
});
test('local production-list mode is pinned to localhost, staging database and exact staging Sheet',()=>{
 assert.equal(productionConfig(localEnv).callback,LOCAL_PRODUCTION_CALLBACK);
 for(const patch of [{APP_BASE_URL:'https://lead71.com'},{APP_ENV:'production'},{MONGODB_DB:'client_live'},{GOOGLE_SHEET_ID:'production-sheet'},{GOOGLE_SHEET_TEST_ID:'other'},{GOOGLE_SHEET_TAB:'Other'}])assert.throws(()=>productionConfig({...localEnv,...patch}),{code:'CC_LOCAL_TEST_REFUSED'});
 assert.throws(()=>productionConfig({...localEnv,CC_REDIRECT_URI_PRODUCTION:PRODUCTION_CALLBACK}),{code:'CC_CALLBACK_REFUSED'});
});
test('local OAuth returns only to localhost and uses separate encrypted connection records',async()=>{
 const f=fixture(),start=await beginProductionConnection(f.db,user,f.session,localEnv);
 const url=new URL(start.url);assert.equal(url.searchParams.get('redirect_uri'),LOCAL_PRODUCTION_CALLBACK);
 await finishProductionConnection(f.db,{code:'fixture-code',state:url.searchParams.get('state')},start.cookie.split(';')[0].split('=')[1],localEnv,f.fetcher);
 assert.ok(f.docs.some(d=>d.key.startsWith('cc_production_local_test_connection:')&&d.tokens));
 assert.equal((await productionStatus(f.db,user.tenantId,localEnv)).connected,true);
});
test('disabled integration does not call providers or create metadata',async()=>{const f=fixture(),before=f.docs.length;assert.equal(await deliverProductionContact(f.db,user,card,{...env,CC_ENABLED_PRODUCTION:'false'},f.fetcher),card);assert.equal(f.calls.length,0);assert.equal(f.docs.length,before);assert.equal((await productionStatus(f.db,user.tenantId,{...env,CC_ENABLED_PRODUCTION:'false'})).enabled,false);});
test('account connection does not enable production writes implicitly',async()=>{const f=fixture(),before=f.docs.length;const result=await deliverProductionContact(f.db,user,card,{...env,CC_WRITES_ENABLED_PRODUCTION:'false'},f.fetcher);assert.equal(result.sheetStatus,'submitted');assert.equal(result.transferStatus,'pending');assert.equal(f.calls.length,0);assert.equal(f.docs.length,before);});
test('transport independently refuses creates while the write gate is paused',async()=>{const f=fixture();await assert.rejects(allowedCall(f.db,user.tenantId,'/contacts','POST',productionPayload(card.verifiedData),{...env,CC_WRITES_ENABLED_PRODUCTION:'false'},f.fetcher),{code:'CC_WRITES_PAUSED'});assert.equal(f.calls.length,0);});
test('transport refuses all list enumeration, account searches, reads, updates, bulk and campaign endpoints before any request',async()=>{
  const f=fixture();for(const [p,m,b]of [['/contact_lists','GET'],['/contacts?email=dummy%40example.test','GET'],['/contacts/other','GET'],['/contacts/other','PUT',{}],['/contacts','DELETE'],['/activities/contacts_json_import','POST',{}],['/emails','POST',{}],[`/contact_lists/${PRODUCTION_LIST_ID}?include=all`,'GET'],['/contacts','POST',{...productionPayload(card.verifiedData),list_memberships:['other']}],['/contacts','POST',{...productionPayload(card.verifiedData),sms_number:'123'}]])await assert.rejects(allowedCall(f.db,user.tenantId,p,m,b,env,f.fetcher),{code:'CC_OPERATION_REFUSED'});assert.equal(f.calls.length,0);
});
test('confirmed Sheet submission creates once in only the exact list with no marketing permission',async()=>{
  const f=fixture(),r=await deliverProductionContact(f.db,user,card,env,f.fetcher);assert.equal(r.transferStatus,'transferred');assert.equal(r.verifiedData.notes,card.verifiedData.notes);
  const writes=f.calls.filter(c=>c.options.method==='POST');assert.equal(writes.length,1);const p=JSON.parse(writes[0].options.body);assert.deepEqual(p.list_memberships,[PRODUCTION_LIST_ID]);assert.equal(p.email_address.permission_to_send,'not_set');assert.equal(p.create_source,'Account');
  assert.equal((await deliverProductionContact(f.db,user,card,env,f.fetcher)).transferStatus,'transferred');assert.equal(f.calls.filter(c=>c.url.endsWith('/contacts')).length,1);
  const stored=JSON.stringify(f.docs);for(const s of ['dummy@example.test','Dummy Contact','Preserve this note','Fixture Company'])assert.ok(!stored.includes(s));
});
test('unconfirmed Sheet, wrong capturer and wrong tenant never call Constant Contact',async()=>{for(const patch of [{sheetStatus:'failed'},{capturedBy:'other'},{tenantId:'other'}]){const f=fixture();const r=await deliverProductionContact(f.db,user,{...card,...patch},env,f.fetcher);assert.equal(r.transferStatus,'failed');assert.equal(f.calls.length,0);}});
test('phone only contacts remain Sheet saved without provider calls',async()=>{const f=fixture(),r=await deliverProductionContact(f.db,user,{...card,verifiedData:{...card.verifiedData,email:''}},env,f.fetcher);assert.equal(r.sheetStatus,'submitted');assert.equal(r.transferStatus,'not_started');assert.equal(f.calls.length,0);});
test('wrong remote list identity blocks contact creation',async()=>{const f=fixture();const r=await deliverProductionContact(f.db,user,card,env,async()=>Response.json({list_id:PRODUCTION_LIST_ID,name:'Unexpected Name'}));assert.equal(r.transferStatus,'failed');assert.equal(f.docs.find(d=>d.digest).state,'failed');});
test('409 existing email is preserved without an account search or an update',async()=>{const f=fixture();const fetcher=async(u,o)=>u.endsWith('/contacts')?(f.calls.push({url:u,options:o}),Response.json({}, {status:409})):f.fetcher(u,o);const r=await deliverProductionContact(f.db,user,card,env,fetcher);assert.equal(r.transferStatus,'existing_contact');assert.equal(f.calls.length,2);await deliverProductionContact(f.db,user,card,env,fetcher);assert.equal(f.calls.length,2);});
for(const mode of ['timeout','500','unreadable','missing-id'])test(`uncertain ${mode} blocks resend after restart`,async()=>{
  const f=fixture();const fetcher=async(u,o)=>{if(!u.endsWith('/contacts'))return f.fetcher(u,o);f.calls.push({url:u,options:o});if(mode==='timeout')throw new Error('sensitive provider details');if(mode==='500')return Response.json({},{status:500});if(mode==='unreadable')return new Response('invalid-json',{status:201});return Response.json({},{status:201});};
  const first=await deliverProductionContact(f.db,user,card,env,fetcher);assert.equal(first.sheetStatus,'submitted');assert.equal(first.transferStatus,'reconciliation_required');assert.ok(!first.transferError.includes('sensitive'));const n=f.calls.length;await deliverProductionContact(f.db,user,card,env,fetcher);assert.equal(f.calls.length,n);
});
test('rate limited create can retry safely using the same reference',async()=>{const f=fixture();let attempts=0;const fetcher=async(u,o)=>u.endsWith('/contacts')&&attempts++===0?Response.json({},{status:429}):f.fetcher(u,o);assert.equal((await deliverProductionContact(f.db,user,card,env,fetcher)).transferStatus,'failed');assert.equal((await deliverProductionContact(f.db,user,card,env,fetcher)).transferStatus,'transferred');assert.equal(f.docs.filter(d=>d.digest).length,1);});
test('changed contact details cannot reuse an existing reference',async()=>{const f=fixture();await deliverProductionContact(f.db,user,card,env,f.fetcher);const before=f.calls.length;const r=await deliverProductionContact(f.db,user,{...card,verifiedData:{...card.verifiedData,email:'different@example.test'}},env,f.fetcher);assert.equal(r.transferStatus,'failed');assert.equal(f.calls.length,before);assert.equal(f.docs.find(d=>d.digest).state,'transferred');});
test('expired access token uses rotating refresh and preserves isolated encrypted storage',async()=>{const f=fixture();f.docs[0].tokens=encryptValue({access:'expired',refresh:'refresh-fixture',expires:0});await deliverProductionContact(f.db,user,card,env,f.fetcher);assert.equal(f.calls.filter(c=>c.url.endsWith('/token')).length,1);assert.ok(!JSON.stringify(f.docs).includes('renewed-fixture'));});
test('OAuth uses code flow, exact callback and secure single-use state',async()=>{const f=fixture();const start=await beginProductionConnection(f.db,user,f.session,env);const url=new URL(start.url);assert.equal(url.searchParams.get('response_type'),'code');assert.equal(url.searchParams.get('redirect_uri'),PRODUCTION_CALLBACK);assert.equal(url.searchParams.get('scope'),'contact_data offline_access');assert.ok(start.cookie.includes('HttpOnly; Secure; SameSite=Lax'));const nonce=start.cookie.split(';')[0].split('=')[1],query={code:'fixture-code',state:url.searchParams.get('state')};await finishProductionConnection(f.db,query,nonce,env,f.fetcher);await assert.rejects(finishProductionConnection(f.db,query,nonce,env,f.fetcher),{code:'CC_OAUTH_INVALID'});});
test('OAuth refuses a different browser nonce without contacting provider',async()=>{const f=fixture(),start=await beginProductionConnection(f.db,user,f.session,env);await assert.rejects(finishProductionConnection(f.db,{code:'fixture-code',state:new URL(start.url).searchParams.get('state')},'wrong',env,f.fetcher));assert.equal(f.calls.length,0);});
test('failure persisting a successful create never permits another create',async()=>{const f=fixture(),update=f.settings.updateOne;let fail=true;f.settings.updateOne=async(q,u,o)=>{if(u.$set?.state==='transferred'&&fail){fail=false;throw new Error('database unavailable');}return update(q,u,o);};const r=await deliverProductionContact(f.db,user,card,env,f.fetcher);assert.equal(r.transferStatus,'reconciliation_required');const n=f.calls.length;await deliverProductionContact(f.db,user,card,env,f.fetcher);assert.equal(f.calls.length,n);});
test('webhook POST cannot be mistaken for an OAuth callback',async()=>{let calls=0;const handler=createProductionHandler({getDb:async()=>{calls++;throw Error();}});const res={status(n){this.code=n;return this;},json(v){this.body=v;return this;},setHeader(){}};await handler({query:{action:'callback'},method:'POST',headers:{},body:{}},res);assert.equal(res.code,405);assert.equal(calls,0);});
test('retry cannot create a new Sheet submission',async()=>{const f=fixture();let writes=0;const csrf='fixture-csrf';const handler=createProductionHandler({env,getDb:async()=>f.db,ensureIndexes:async()=>{},authenticate:async()=>({user,session:{csrfHash:createHash('sha256').update(csrf).digest('hex')}}),createCard:async()=>{writes++;}});const res={status(n){this.code=n;return this;},json(v){this.body=v;return this;},setHeader(){}};await handler({query:{action:'retry_submission'},method:'POST',headers:{'x-csrf-token':csrf},body:{submissionId:card.id}},res);assert.equal(res.code,409);assert.equal(writes,0);});

test('Sheet failure prevents every Constant Contact call',async()=>{let sent=0;await assert.rejects(submitProductionContact(null,user,{}, {saveSheet:async()=>{throw new Error('Sheet rejected');},deliver:async()=>{sent++;}}));assert.equal(sent,0);});
test('reviewed submission saves Sheet and notes before provider, with one write across retries',async()=>{
 const f=fixture(),events=[],rows=[mapping.columns.map(c=>c.header)];
 f.docs.push({tenantId:user.tenantId,key:`submission:${user.tenantId}:${user.id}:${card.id}`,recordId:card.recordId,createdAt:new Date()});
 const gateway={readAll:async()=>rows,append:async row=>{events.push('sheet');rows.push(row);return 2;}};
 const saveSheet=(db,u,input)=>createCard(db,u,input,new Date(),{sheet:{gateway}});
 const deliver=(db,u,c)=>deliverProductionContact(db,u,c,env,async(url,options)=>{events.push('provider');return f.fetcher(url,options);});
 const input={submissionId:card.id,verifiedData:card.verifiedData,status:'submitted'};
 const deps={env,saveSheet,deliver,verify:(c,e)=>verifyProductionSheetRecord(c,e,gateway)};
 const record=await submitProductionContact(f.db,user,input,deps);
 assert.equal(record.sheetStatus,'submitted');assert.equal(record.transferStatus,'transferred');assert.equal(events[0],'sheet');assert.ok(rows[1].includes('Preserve this note'));
 await submitProductionContact(f.db,user,input,deps);assert.equal(rows.length,2);assert.equal(events.filter(x=>x==='sheet').length,1);assert.equal(f.calls.filter(x=>x.options.method==='POST').length,1);
});
test('provider failure returns a confirmed Sheet result and preserves short notes',async()=>{const f=fixture();const result=await submitProductionContact(f.db,user,{}, {saveSheet:async()=>card,deliver:(db,u,c)=>deliverProductionContact(db,u,c,env,async()=>{throw Error('network down');})});assert.equal(result.sheetStatus,'submitted');assert.equal(result.transferStatus,'failed');assert.equal(result.verifiedData.notes,card.verifiedData.notes);});
test('overlapping retries cannot send the same contact twice',async()=>{
 const f=fixture();let entered,release;const started=new Promise(r=>entered=r),hold=new Promise(r=>release=r);
 const fetcher=async(u,o)=>{if(u.endsWith(`/contact_lists/${PRODUCTION_LIST_ID}`)){entered();await hold;}return f.fetcher(u,o);};
 const first=deliverProductionContact(f.db,user,card,env,fetcher);await started;
 const second=await deliverProductionContact(f.db,user,card,env,fetcher);assert.equal(second.transferStatus,'failed');
 release();assert.equal((await first).transferStatus,'transferred');assert.equal(f.calls.filter(c=>c.options.method==='POST').length,1);
});
test('an expired administrator session cannot complete account authorization',async()=>{const f=fixture(),start=await beginProductionConnection(f.db,user,f.session,env);f.session.absoluteExpiresAt=new Date(0);await assert.rejects(finishProductionConnection(f.db,{code:'fixture-code',state:new URL(start.url).searchParams.get('state')},start.cookie.split(';')[0].split('=')[1],env,f.fetcher),{code:'CC_OAUTH_SESSION_INVALID'});assert.equal(f.calls.length,0);});
test('Vercel callback alias reuses the existing function and keeps the query string',async()=>{const {readFile}=await import('node:fs/promises');const config=JSON.parse(await readFile(new URL('../../vercel.json',import.meta.url)));assert.ok(config.rewrites.some(r=>r.source==='/api/constantcontact'&&r.destination==='/api/constant-contact'));const route=(await readFile(new URL('../../server/index.js',import.meta.url))).toString();assert.ok(route.includes("app.all('/api/constantcontact', constantContactHandler)"));});
test('a receipt or colliding reference cannot substitute another Sheet contact',async()=>{let calls=0;const gateway={readAll:async()=>[mapping.columns.map(c=>c.header),mapping.columns.map(c=>c.field==='recordId'?card.recordId:'Different contact')]};const result=await submitProductionContact(null,user,{}, {env,saveSheet:async()=>card,verify:(c,e)=>verifyProductionSheetRecord(c,e,gateway),deliver:async()=>{calls++;}});assert.equal(result.sheetStatus,'submitted');assert.equal(result.transferStatus,'failed');assert.equal(calls,0);});
