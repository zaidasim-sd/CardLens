import test, {beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFirebaseDirectory, directoryEmailVisible} from './firebaseDirectory.js';
import {listUsers, removeUser, isAdministrator, authenticate, getNotificationApprovers} from './service.js';

const actor={id:'admin-uid',email:'hmirza.sd@vision71tech.com',role:'vision71_administrator',tenantId:'fixture-tenant'};
let previousEnv;
beforeEach(()=>{previousEnv={...process.env};process.env.APP_ENV='production';process.env.ALLOW_VISION71_EMAILS='true';process.env.ADMIN_EMAILS='az@vision71tech.com';process.env.REVOKED_ACCOUNT_EMAILS='iamalik2005@gmail.com';});
afterEach(()=>{for(const key of Object.keys(process.env))if(!(key in previousEnv))delete process.env[key];Object.assign(process.env,previousEnv);});
function fixture() {
  const approvals={approvedEmails:['active@vision71tech.com','ghost@vision71tech.com'],pendingApprovals:{'pending@vision71tech.com':{name:'Pending Applicant'}},rejectedEmails:['removed@vision71tech.com']};
  const sessions=[];
  const writes=[];
  const db={collection(name){
    if(name==='settings')return {findOne:async()=>structuredClone(approvals),updateOne:async(_query,update)=>{writes.push(update);Object.assign(approvals,structuredClone(update.$set));}};
    if(name==='sessions')return {find:()=>({toArray:async()=>sessions}),findOne:async query=>sessions.find(item=>item.user?.email===query['user.email']),deleteMany:async query=>writes.push(query)};
    if(name==='auditLogs')return {insertOne:async entry=>writes.push(entry)};
    assert.fail('Unexpected collection '+name);
  }};
  return {db,approvals,sessions,writes};
}
const account=(email,patch={})=>({uid:'uid-'+email,email,name:'Name '+email,emailVerified:true,disabled:false,...patch});

test('all Firebase pages are read and credential fields are excluded',async()=>{
  const calls=[];
  const result=await readFirebaseDirectory({env:{FIREBASE_PROJECT_ID:'fixture-project'},getAccessToken:async()=>'fixture-token',fetcher:async(url,options)=>{
    const parsed=new URL(url);calls.push(parsed);
    assert.equal(options.headers['x-goog-user-project'],'fixture-project');
    assert.equal(parsed.searchParams.get('fields'),'users(localId,email,displayName,emailVerified,disabled),nextPageToken');
    return Response.json(calls.length===1?{users:[{localId:'one',email:'ONE@VISION71TECH.COM',displayName:'Actual Name',emailVerified:true,passwordHash:'excluded',salt:'excluded'}],nextPageToken:'page-two'}:{users:[{localId:'two',email:'two@vision71tech.com',disabled:true}]});
  }});
  assert.equal(calls.length,2);assert.equal(calls[1].searchParams.get('nextPageToken'),'page-two');
  assert.equal(result.length,2);assert.equal(result[0].name,'Actual Name');assert.equal(result[0].email,'one@vision71tech.com');
  assert.equal(result[1].disabled,true);assert.equal(JSON.stringify(result).includes('excluded'),false);
});

test('permission errors and incomplete pagination never return a partial team',async()=>{
  const options={env:{FIREBASE_PROJECT_ID:'fixture'},getAccessToken:async()=>'fixture'};
  await assert.rejects(readFirebaseDirectory({...options,fetcher:async()=>Response.json({}, {status:403})}),{code:'FIREBASE_DIRECTORY_ACCESS_DENIED'});
  await assert.rejects(readFirebaseDirectory({...options,fetcher:async()=>Response.json({users:[],nextPageToken:'repeated'})}),{code:'FIREBASE_DIRECTORY_UNAVAILABLE'});
});

test('only active verified approved members and current administrators appear once with actual names',async()=>{
  const f=fixture();
  const accounts=[account(actor.email),account('az@vision71tech.com'),account('active@vision71tech.com'),account('pending@vision71tech.com'),account('never-signed-in@vision71tech.com',{emailVerified:false}),account('disabled@vision71tech.com',{disabled:true}),account('removed@vision71tech.com')];
  const users=await listUsers(f.db,actor,{directory:async()=>[...accounts,accounts[0]]});
  assert.equal(users.length,3);assert.equal(users.some(user=>user.email==='ghost@vision71tech.com'),false);
  const byEmail=email=>users.find(user=>user.email===email);
  assert.equal(byEmail('az@vision71tech.com').role,'vision71_administrator');assert.equal(byEmail('az@vision71tech.com').canRemove,false);
  assert.equal(byEmail(actor.email).canRemove,false);assert.equal(byEmail('active@vision71tech.com').canRemove,true);
  for(const email of ['pending@vision71tech.com','never-signed-in@vision71tech.com','disabled@vision71tech.com','removed@vision71tech.com'])assert.equal(byEmail(email),undefined);
  assert.equal(byEmail('active@vision71tech.com').name,'Name active@vision71tech.com');assert.equal(byEmail('active@vision71tech.com').uid,'uid-active@vision71tech.com');
});

test('staging excludes client identities even when client addresses are configured as admins',async()=>{
  const f=fixture();process.env.APP_ENV='staging';process.env.ADMIN_EMAILS='hala@aventureaviation.com,az@vision71tech.com';
  const users=await listUsers(f.db,actor,{directory:async()=>[account('hala@aventureaviation.com'),account('osman@aventureaviation.com'),account('client@sub.aventureaviation.com'),account('az@vision71tech.com')]});
  assert.deepEqual(users.map(user=>user.email),['az@vision71tech.com']);
  assert.equal(directoryEmailVisible('hala@aventureaviation.com',process.env,['hala@aventureaviation.com']),false);
});

test('staging shows only the exact Vision71 domain, including when other domains are allowlisted or administrators',async()=>{
  const f=fixture();process.env.APP_ENV='staging';process.env.STAGING_ALLOWED_DOMAINS='vision71tech.com,example.test';
  f.approvals.approvedEmails.push('staff@vision71tech.com');
  const users=await listUsers(f.db,actor,{directory:async()=>['staff@vision71tech.com','personal@gmail.com','fixture@example.test','staff@sub.vision71tech.com','fake@vision71tech.com.evil.test'].map(email=>account(email))});
  assert.deepEqual(users.map(user=>user.email),['staff@vision71tech.com']);
  assert.equal(directoryEmailVisible('personal@gmail.com',process.env,['personal@gmail.com']),false);
  assert.equal(directoryEmailVisible('UPPER@VISION71TECH.COM',process.env),true);
  process.env.APP_ENV='production';
  for(const email of ['client@aventureaviation.com','personal@gmail.com','fixture@example.test'])assert.equal(directoryEmailVisible(email,process.env),true);
});

test('administrator protection applies to email, Firebase UID, self and existing administrator sessions',async()=>{
  for(const target of ['az@vision71tech.com','uid-admin',actor.id,actor.email,'older-admin@vision71tech.com']){
    const f=fixture();f.sessions.push({user:{email:'older-admin@vision71tech.com',role:'vision71_administrator'}});
    await assert.rejects(removeUser(f.db,actor,target,new Date(),{directory:async()=>[account('az@vision71tech.com',{uid:'uid-admin'}),account('older-admin@vision71tech.com')]}),error=>['ADMIN_PROTECTED','CANNOT_DELETE_SELF'].includes(error.code));
    assert.equal(f.writes.length,0);
  }
});

test('assistant removal revokes app access and only that tenant sessions',async()=>{
  const f=fixture();await removeUser(f.db,actor,'uid-staff',new Date(),{directory:async()=>[account('active@vision71tech.com',{uid:'uid-staff'})]});
  assert.equal(f.approvals.approvedEmails.includes('active@vision71tech.com'),false);assert.ok(f.approvals.rejectedEmails.includes('active@vision71tech.com'));
  const sessionDelete=f.writes.find(item=>item.$or);assert.equal(sessionDelete.tenantId,actor.tenantId);
});

test('nonadmins cannot list users or remove access',async()=>{
  const f=fixture(),assistant={...actor,role:'exhibition_assistant'};
  const directory=async()=>assert.fail('Directory must not be accessed');
  await assert.rejects(listUsers(f.db,assistant,{directory}),{code:'FORBIDDEN'});
  await assert.rejects(removeUser(f.db,assistant,'other@vision71tech.com',new Date(),{directory}),{code:'FORBIDDEN'});
});

test('revoked former administrator is hidden and cannot reuse an old administrator session',async()=>{
 const email='iamalik2005@gmail.com';process.env.ADMIN_EMAILS+=','+email;process.env.OSMAN_APPROVAL_EMAIL=email;
 assert.equal(isAdministrator(email),false);assert.ok(!getNotificationApprovers().includes(email));
 const f=fixture();f.approvals.approvedEmails.push(email);f.sessions.push({user:{email,role:'vision71_administrator'}});
 assert.deepEqual(await listUsers(f.db,actor,{directory:async()=>[account(email)]}),[]);
 let deleted=0;const session={_id:'revoked-session',absoluteExpiresAt:new Date(Date.now()+60000),lastSeenAt:new Date(),user:{id:'revoked-uid',uid:'revoked-uid',email,status:'active',role:'vision71_administrator'}};
 await assert.rejects(authenticate({collection:()=>({findOne:async()=>session,deleteOne:async()=>{deleted++;}})},'fixture'),{code:'UNAUTHENTICATED'});
 assert.equal(deleted,1);
});
