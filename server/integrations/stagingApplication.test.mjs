import test from 'node:test';
import assert from 'node:assert/strict';
import {productionConfig,beginProductionConnection,finishProductionConnection,productionStatus,allowedCall,productionPayload,PRODUCTION_LIST_ID,PRODUCTION_LIST_NAME,LOCAL_TEST_SHEET_ID} from './productionConstantContact.js';
import {fixture} from './productionConstantContact.test.mjs';
import {createProductionHandler} from '../http/productionConstantContactHandler.js';
const env={APP_ENV:'staging',APP_BASE_URL:'https://lead71-cc-staging.vercel.app',MONGODB_DB:'fixture_staging',GOOGLE_SHEET_ID:LOCAL_TEST_SHEET_ID,GOOGLE_SHEET_TEST_ID:LOCAL_TEST_SHEET_ID,GOOGLE_SHEET_TAB:'Sheet1',CC_ENABLED_PRODUCTION:'true',CC_WRITES_ENABLED_PRODUCTION:'false',CC_STAGING_TEST_MODE:'true',CC_API_KEY_STAGING_PRODUCTION:'staging-client-fixture',CC_CLIENT_SECRET_STAGING_PRODUCTION:'staging-secret-fixture',CC_LIST_ID_PRODUCTION:PRODUCTION_LIST_ID,CC_LIST_NAME_PRODUCTION:PRODUCTION_LIST_NAME};
const callback='https://lead71-cc-staging.vercel.app/api/constantcontact?action=callback';
test('hosted mode uses only separate staging app credentials and exact Lead71 callback',()=>{
 const c=productionConfig({...env,CC_API_KEY_PRODUCTION:'must-not-use',CC_CLIENT_SECRET_PRODUCTION:'must-not-use'});assert.equal(c.clientId,'staging-client-fixture');assert.equal(c.callback,callback);
 for(const patch of [{CC_API_KEY_STAGING_PRODUCTION:''},{CC_CLIENT_SECRET_STAGING_PRODUCTION:''},{APP_BASE_URL:'https://lead71.com'},{APP_ENV:'production'},{GOOGLE_SHEET_ID:'live-sheet'},{MONGODB_DB:'client_live'},{CC_LIST_ID_PRODUCTION:'other-list'},{CC_REDIRECT_URI_PRODUCTION:'https://lead71.com/callback'}])assert.throws(()=>productionConfig({...env,...patch}));
});
test('staging authorization scopes, secure state and token namespace are independent',async()=>{
 const f=fixture(),start=await beginProductionConnection(f.db,f.session.user,f.session,env),url=new URL(start.url);
 assert.equal(url.searchParams.get('scope'),'contact_data offline_access');assert.equal(url.searchParams.get('redirect_uri'),callback);assert.ok(start.cookie.includes('; Secure'));
 assert.equal((await productionStatus(f.db,f.session.user.tenantId,env)).connected,false);
 await finishProductionConnection(f.db,{code:'fixture',state:url.searchParams.get('state')},start.cookie.split(';')[0].split('=')[1],env,f.fetcher);
 assert.ok(f.docs.some(d=>d.key.startsWith('cc_staging_application_connection:')&&d.tokens));
 assert.equal((await productionStatus(f.db,f.session.user.tenantId,env)).connected,true);
});
test('callback without valid OAuth parameters safely rejects without database or provider access',async()=>{
 for(const query of [{action:'callback'},{action:'callback',state:'bad',code:'bad'}]){
  let touched=false;const handler=createProductionHandler({env,getDb:async()=>{touched=true;throw Error('must not connect');}});
  const res={setHeader(){},status(c){this.code=c;return this;},json(b){this.body=b;return this;}};
  await handler({method:'GET',query,headers:{}},res);assert.equal(res.code,400);assert.equal(res.body.code,'CC_OAUTH_INVALID');assert.equal(touched,false);
 }
});
test('staging writes paused and non designated contact are rejected before provider access',async()=>{
 const f=fixture(),body=productionPayload({fullName:'Internal fixture',email:'approved@example.test'});
 await assert.rejects(allowedCall(f.db,f.session.user.tenantId,'/contacts','POST',body,env,f.fetcher),{code:'CC_WRITES_PAUSED'});
 await assert.rejects(allowedCall(f.db,f.session.user.tenantId,'/contacts','POST',body,{...env,CC_WRITES_ENABLED_PRODUCTION:'true',CC_STAGING_TEST_CONTACT_EMAIL:'different@example.test'},f.fetcher),{code:'CC_TEST_CONTACT_REFUSED'});
 assert.equal(f.calls.length,0);
});
test('other lists, account-wide lookups, updates and campaigns are forbidden',async()=>{
 const f=fixture();for(const [path,method] of [['/contact_lists','GET'],['/contacts?email=anything','GET'],['/contacts/existing','PUT'],['/contacts/existing','DELETE'],['/emails','POST'],['/contact_lists/other','GET']])await assert.rejects(allowedCall(f.db,f.session.user.tenantId,path,method,{},env,f.fetcher),{code:'CC_OPERATION_REFUSED'});
 assert.equal(f.calls.length,0);
});
