import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {stagingAction,assertStaging,validateStagingContact,TEST_LIST} from './stagingWorkflow.js';
const env={STAGING_INTEGRATION_ENABLED:'true',APP_ENV:'staging',APP_BASE_URL:'https://cardsnap-vision71-staging.vercel.app',MONGODB_DB:'fixture_staging'};
const user={id:'capturer',name:'Test Capturer',tenantId:'vision71-internal'};
function setup(cc=async()=>{throw new Error('Provider must not be called');}){
 const data={}; const register={rows:async t=>(data[t]||[]).map((r,i)=>({...r,_row:i+2})),append:async(t,r)=>{(data[t]||=[]).push({...r})},update:async(t,r)=>{data[t][r._row-2]={...r}}};
 return {data,call:(action,input={},actor=user)=>stagingAction(null,actor,action,input,{env,register,cc})};
}
async function seed(s){const e=await s.call('exhibition',{name:'Fixture',city:'Karachi',country:'Pakistan',startDate:'2026-11-04',endDate:'2026-11-04',timeZone:'Asia/Karachi'});return s.call('session',{exhibitionId:e.id});}
test('production and disabled integration are refused; normal contact addresses are accepted',()=>{assert.throws(()=>assertStaging({...env,APP_ENV:'production'}));assert.throws(()=>assertStaging({...env,STAGING_INTEGRATION_ENABLED:'false'}));assert.doesNotThrow(()=>validateStagingContact({email:'person@company.example',name:'Fixture'}));assert.throws(()=>validateStagingContact({email:'invalid',name:'Fixture'}));});
test('capture inherits session and repeats safely without creating another contact',async()=>{const s=setup(),session=await seed(s),id=randomUUID();const input={id,sessionId:session.id,name:'Fixture',email:'l71-test-fixture@example.com'};await s.call('capture',input);await s.call('capture',input);await s.call('capture',{...input,id:randomUUID()});assert.equal(s.data.Contacts.length,1);assert.equal(s.data.Contact_Exhibition_Links.length,2);assert.equal(s.data.Contact_Exhibition_Links[0].exhibitionName,'Fixture');await assert.rejects(s.call('approve',{id}),/different reviewer/);});
test('response is local only and correction requires another reviewer',async()=>{const s=setup(),session=await seed(s),id=randomUUID();await s.call('capture',{id,sessionId:session.id,name:'Fixture',title:'Before',email:'l71-test-correction@example.com'});await s.call('response',{id,category:'details changed',proposed:{title:'After'}});const ch=s.data.Change_Requests[0];await assert.rejects(s.call('apply_change',{id,changeId:ch.id}),/different reviewer/);await s.call('apply_change',{id,changeId:ch.id},{...user,id:'reviewer'});assert.equal(s.data.Contacts[0].title,'After');await s.call('rollback',{id,changeId:ch.id},{...user,id:'reviewer'});assert.equal(s.data.Contacts[0].title,'Before');});
test('sync does not fall back to another list and failure is logged',async()=>{const s=setup(async()=>({lists:[{name:'General Interest',list_id:'wrong'}]})),session=await seed(s),id=randomUUID();await s.call('capture',{id,sessionId:session.id,name:'Fixture',email:'l71-test-missing-list@example.com'});await s.call('approve',{id},{...user,id:'reviewer'});await assert.rejects(s.call('sync',{id}),/exact internal test list/);assert.equal(s.data.Contacts[0].syncStatus,'failed');assert.equal(s.data.Sync_Log.at(-1).status,'failed');});
test('preexisting provider contact is preserved without update',async()=>{let writes=0;const cc=async(path,method)=>{if(method)writes++;if(path.startsWith('/contact_lists'))return {lists:[{name:TEST_LIST,list_id:'list'}]};if(path.startsWith('/contacts?'))return {contacts:[{contact_id:'existing'}]};return {contact_id:'existing',email_address:{address:'l71-test-existing@example.com',permission_to_send:'unsubscribed'},list_memberships:['original']};};const s=setup(cc),session=await seed(s),id=randomUUID();await s.call('capture',{id,sessionId:session.id,name:'Fixture',email:'l71-test-existing@example.com'});await s.call('approve',{id},{...user,id:'reviewer'});const result=await s.call('sync',{id});assert.equal(result.syncStatus,'existing contact preserved');assert.equal(writes,0);});

test('administrators share one persistent session and can replace each other selection',async()=>{
 const s=setup(),first=await seed(s),other={...user,id:'other-admin',name:'Other Admin'};
 assert.equal((await s.call('context',{},other)).sessions[0].id,first.id);
 assert.equal((await s.call('scan_session',{source:'Stale browser source'},other)).id,first.id);
 const e=await s.call('exhibition',{name:'Second event',city:'Dubai',country:'UAE',startDate:'2026-11-05',endDate:'2026-11-06',timeZone:'Asia/Dubai'},other);
 const second=await s.call('session',{exhibitionId:e.id},other);
 assert.equal((await s.call('context')).sessions[0].id,second.id);
 assert.equal(s.data.Sessions.filter(r=>r.status==='active').length,1);
 await assert.rejects(s.call('close_session',{id:first.id}),/already changed/);
 const id=randomUUID();await s.call('capture',{id,sessionId:second.id,name:'Shared capture',email:'shared@example.com'});
 assert.equal(s.data.Contact_Exhibition_Links[0].exhibitionName,'Second event');
 assert.equal(s.data.Contact_Exhibition_Links[0].capturedBy,user.id);
 await s.call('close_session',{id:second.id});assert.equal((await s.call('context',{},other)).sessions.length,0);
});
