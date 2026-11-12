import test,{beforeEach,afterEach} from 'node:test';import assert from 'node:assert/strict';
import {provisionFirebaseUser} from './firebaseProvisioning.js';import {createUser,listUsers,removeUser,signIn} from './service.js';import {privacyDatabase} from '../db.js';
const actor={id:'admin-uid',email:'hmirza.sd@vision71tech.com',tenantId:'test-tenant',role:'vision71_administrator'};
const input={name:'Fictional Member',email:'member@vision71tech.com',password:'Fixture-only-long-password',role:'exhibition_assistant'};
let previousEnv;beforeEach(()=>{previousEnv={...process.env};process.env.APP_ENV='production';process.env.ALLOW_VISION71_EMAILS='true';process.env.FIREBASE_API_KEY='fixture';});afterEach(()=>{for(const k of Object.keys(process.env))if(!(k in previousEnv))delete process.env[k];Object.assign(process.env,previousEnv);});
function fixture(){let approvals={approvedEmails:[],pendingApprovals:{},rejectedEmails:[],roleAssignments:{}};const writes=[];const db=privacyDatabase({collection(name){
 if(name==='settings')return {findOne:async()=>structuredClone(approvals),updateOne:async(_q,u)=>{writes.push(u);approvals=structuredClone(u.$set);}};
 if(name==='sessions')return {findOne:async()=>null,find:()=>({toArray:async()=>[]}),insertOne:async u=>writes.push(u)};
 if(name==='auditLogs')return {insertOne:async u=>writes.push(u)};
 if(name==='rateLimits')return {findOneAndUpdate:async()=>({count:1})};
 assert.fail(name);
 }});return {db,writes,get approvals(){return approvals}};}
const account={uid:'new-uid',email:input.email,name:input.name,emailVerified:false,disabled:false,created:true,verificationSent:true,profileUpdated:true};

test('Firebase creation verifies email without storing or returning passwords or identity tokens',async()=>{
 const calls=[];const result=await provisionFirebaseUser(input,{env:{FIREBASE_API_KEY:'fixture'},fetcher:async(url,o)=>{calls.push({url,body:JSON.parse(o.body)});return Response.json(calls.length===1?{localId:'new-uid',idToken:'secret-fixture-token'}:{});}});
 assert.equal(result.emailVerified,false);assert.equal(result.verificationSent,true);assert.equal(calls.length,3);
 assert.equal(calls[0].body.password,input.password);assert.equal(calls[0].body.emailVerified,undefined);
 assert.equal(calls[1].body.displayName,input.name);assert.equal(calls[2].body.requestType,'VERIFY_EMAIL');
 assert.ok(!JSON.stringify(result).includes('secret-fixture-token'));assert.ok(!JSON.stringify(result).includes(input.password));
});
test('duplicate and failed Firebase operations give safe actionable errors',async()=>{
 await assert.rejects(provisionFirebaseUser(input,{env:{FIREBASE_API_KEY:'fixture'},fetcher:async()=>Response.json({error:{message:'EMAIL_EXISTS'}},{status:400})}),{code:'ACCOUNT_EXISTS'});
 await assert.rejects(provisionFirebaseUser(input,{env:{FIREBASE_API_KEY:'fixture'},fetcher:async()=>{throw new Error(input.password)}}),e=>e.code==='FIREBASE_CREATE_UNCERTAIN'&&!e.message.includes(input.password));
});
test('a verification email failure does not hide successful Firebase creation',async()=>{
 let n=0;const result=await provisionFirebaseUser(input,{env:{FIREBASE_API_KEY:'fixture'},fetcher:async()=>{n++;return n===1?Response.json({localId:'uid',idToken:'fixture'}):n===2?Response.json({}):Response.json({}, {status:503});}});
 assert.equal(result.created,true);assert.equal(result.verificationSent,false);
});
test('admin creates and approves member; listing still requires actual email verification',async()=>{
 const f=fixture();const result=await createUser(f.db,actor,input,new Date(),{directory:async()=>[],provision:async()=>account});
 assert.equal(result.verificationRequired,true);assert.equal(result.status,'pending_verification');assert.ok(f.approvals.approvedEmails.includes(input.email));
 assert.deepEqual(await listUsers(f.db,actor,{directory:async()=>[account]}),[]);
 const verified={...account,emailVerified:true};const users=await listUsers(f.db,actor,{directory:async()=>[verified]});assert.equal(users.length,1);assert.equal(users[0].status,'active');
 assert.ok(!JSON.stringify(f.writes).includes(input.password));assert.ok(!JSON.stringify(f.writes).includes('passwordHash'));
});
test('existing pending account is approved without resetting its password or creating another identity',async()=>{
 const f=fixture();const existing={...account,created:false};const result=await createUser(f.db,actor,input,new Date(),{directory:async()=>[existing],provision:async()=>assert.fail('Existing credentials must not be overwritten')});
 assert.equal(result.created,false);assert.match(result.message,/password was not changed/);assert.ok(f.approvals.approvedEmails.includes(input.email));
});
test('nonadmins, revoked accounts, invalid passwords and disallowed staging emails fail before Firebase creation',async()=>{
 const f=fixture();const deps={directory:async()=>assert.fail('Not allowed'),provision:async()=>assert.fail('Not allowed')};
 await assert.rejects(createUser(f.db,{...actor,role:'exhibition_assistant'},input,new Date(),deps),{code:'FORBIDDEN'});
 await assert.rejects(createUser(f.db,actor,{...input,password:'short'},new Date(),deps),{code:'PASSWORD_INVALID'});
 process.env.REVOKED_ACCOUNT_EMAILS=input.email;await assert.rejects(createUser(f.db,actor,input,new Date(),deps),{code:'DOMAIN_RESTRICTED'});delete process.env.REVOKED_ACCOUNT_EMAILS;
 process.env.APP_ENV='staging';await assert.rejects(createUser(f.db,actor,{...input,email:'client@aventureaviation.com'},new Date(),deps),{code:'DOMAIN_RESTRICTED'});
});
test('assigned administrators retain their role and cannot be removed; support expires after 24 hours',async()=>{
 const f=fixture(),now=new Date();await createUser(f.db,actor,{...input,role:'vision71_administrator'},now,{directory:async()=>[],provision:async()=>account});
 const users=await listUsers(f.db,actor,{directory:async()=>[{...account,emailVerified:true}]});assert.equal(users[0].role,'vision71_administrator');assert.equal(users[0].canRemove,false);
 await assert.rejects(removeUser(f.db,actor,input.email,now,{directory:async()=>[account]}),{code:'ADMIN_PROTECTED'});
 const oldFetch=globalThis.fetch;globalThis.fetch=async()=>Response.json({users:[{localId:account.uid,email:input.email,emailVerified:true,displayName:input.name}]});
 try{const signed=await signIn(f.db,{idToken:'fixture',now});assert.equal(signed.user.role,'vision71_administrator');}finally{globalThis.fetch=oldFetch}
 const s=fixture();await createUser(s.db,actor,{...input,role:'vision71_support'},now,{directory:async()=>[],provision:async()=>account});assert.equal(new Date(s.approvals.roleAssignments[input.email].expiresAt)-now,86400000);
});
