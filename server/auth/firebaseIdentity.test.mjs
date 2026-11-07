import test from "node:test";
import assert from "node:assert/strict";
import { firebaseIdentity } from "./firebaseIdentity.js";
import { createUser, seedAdministrator, registerUser, signIn, authenticate } from "./service.js";
import { createHash } from "node:crypto";
import { ObjectId } from "mongodb";
const env = { FIREBASE_API_KEY: "dummy-test-project" };
test("Firebase supplies verified identity rather than browser email claims", async () => {
  const result = await firebaseIdentity("dummy-token", { env, fetcher: async (_url, options) => {
    assert.deepEqual(JSON.parse(options.body), { idToken: "dummy-token" });
    return { ok: true, json: async () => ({ users: [{ localId: "dummy-uid", email: "USER@AVENTUREAVIATION.COM", emailVerified: true }] }) };
  } });
  assert.deepEqual(result, { uid: "dummy-uid", email: "user@aventureaviation.com", name: "" });
});
test("unverified, invalid and disabled Firebase accounts cannot create an approval request", async () => {
  for (const account of [{ localId: "uid", email: "dummy@example.test", emailVerified: false }, { localId: "uid", email: "dummy@example.test", emailVerified: true, disabled: true }]) {
    await assert.rejects(firebaseIdentity("dummy", { env, fetcher: async () => ({ ok: true, json: async () => ({ users: [account] }) }) }));
  }
  await assert.rejects(firebaseIdentity("dummy", { env, fetcher: async () => ({ ok: false, json: async () => ({}) }) }), { code: "FIREBASE_TOKEN_INVALID" });
});
test("no Firebase config or token fails closed", async () => {
  await assert.rejects(firebaseIdentity("dummy", { env: {} }), { code: "FIREBASE_NOT_CONFIGURED" });
  await assert.rejects(firebaseIdentity(undefined, { env }), { code: "FIREBASE_TOKEN_REQUIRED" });
});
test("legacy provisioning cannot store password hashes", async () => {
  await assert.rejects(createUser(), { code: "FIREBASE_PROVISIONING_REQUIRED" });
  await assert.rejects(seedAdministrator(), { code: "FIREBASE_PROVISIONING_REQUIRED" });
});

test("verified registration notifies once; pending/rejected accounts and legacy sessions cannot access contacts", async () => {
  const previousFetch=globalThis.fetch,previousEnv={...process.env};
  process.env.FIREBASE_API_KEY='dummy-project';process.env.APP_ENV='production';
  process.env.HALA_APPROVAL_EMAIL='approver.one@vision71tech.com';process.env.OSMAN_APPROVAL_EMAIL='approver.two@vision71tech.com';
  let verified=false,approvals=null,notifications=0,candidateNotices=0,legacySession;
  const writes=[];
  globalThis.fetch=async()=>({ok:true,json:async()=>({users:[{localId:'dummy-uid',email:'dummy@aventureaviation.com',emailVerified:verified}]})});
  const hash=value=>createHash('sha256').update(value).digest('hex');
  const preauth={_id:new ObjectId(),anonymous:true,csrfHash:hash('csrf'),absoluteExpiresAt:new Date(Date.now()+60000)};
  const db={collection(name){
    assert.notEqual(name,'users','Firebase-only registration must never access a users collection');
    if(name==='settings')return {
      findOne:async()=>structuredClone(approvals),
      updateOne:async(_q,update)=>{writes.push(structuredClone(update));approvals={...(approvals||{}),...structuredClone(update.$set)};}
    };
    if(name==='sessions')return {findOne:async q=>q.anonymous?preauth:legacySession,deleteOne:async()=>{legacySession=undefined;}};
    if(name==='rateLimits')return {findOneAndUpdate:async()=>({count:1})};
    if(name==='auditLogs')return {insertOne:async()=>{}};
    assert.fail('Unexpected collection '+name);
  }};
  const options={notify:async()=>{notifications++;},notifyCandidate:async()=>{candidateNotices++;}};
  try{
    await assert.rejects(registerUser(db,{idToken:'dummy'},options),{code:'PENDING_VERIFICATION'});
    assert.equal(approvals,null);assert.equal(notifications,0);
    verified=true;
    const registered=await registerUser(db,{idToken:'dummy',password:'must never persist'},options);
    assert.equal(registered.status,'pending_approval');assert.equal(notifications,2);assert.equal(candidateNotices,1);
    assert.ok(approvals.pendingApprovals['dummy@aventureaviation.com'].token);
    assert.ok(!JSON.stringify(writes).includes('must never persist'));
    assert.ok(!JSON.stringify(writes).includes('passwordHash'));
    const request=structuredClone(approvals.pendingApprovals['dummy@aventureaviation.com']);
    await registerUser(db,{idToken:'dummy'},options);
    assert.equal(notifications,2);assert.equal(candidateNotices,1);
    assert.deepEqual(approvals.pendingApprovals['dummy@aventureaviation.com'],request);
    await assert.rejects(signIn(db,{idToken:'dummy',sessionToken:'session',csrfToken:'csrf'}),{code:'PENDING_APPROVAL'});
    approvals.rejectedEmails=['dummy@aventureaviation.com'];
    await assert.rejects(signIn(db,{idToken:'dummy',sessionToken:'session',csrfToken:'csrf'}),{code:'ACCOUNT_REJECTED'});
    await assert.rejects(registerUser(db,{idToken:'dummy'},options),{code:'ACCOUNT_REJECTED'});
    for(const storedUser of [undefined,{id:'legacy-db-user',email:'dummy@aventureaviation.com',status:'active',role:'exhibition_assistant'},{id:'dummy-uid',uid:'different-uid',status:'active',role:'exhibition_assistant'}]){
      legacySession={_id:'legacy',user:storedUser,absoluteExpiresAt:new Date(Date.now()+60000),lastSeenAt:new Date()};
      await assert.rejects(authenticate(db,'session'),{code:'UNAUTHENTICATED'});
    }
    assert.equal(notifications,2);assert.equal(candidateNotices,1);
  }finally{
    globalThis.fetch=previousFetch;
    for(const key of Object.keys(process.env))if(!(key in previousEnv))delete process.env[key];
    Object.assign(process.env,previousEnv);
  }
});
