import test from "node:test";
import assert from "node:assert/strict";
import { submitDirect } from "./directSubmission.js";
import { privacyDatabase } from "../db.js";
import {randomUUID} from 'node:crypto';
import mapping from '../../config/sheetMapping.json' with {type:'json'};
import {exactEmailDuplicate} from './sheetDuplicates.js';
import {submitProductionContact} from '../integrations/productionSubmission.js';

const user = { id: "000000000000000000000001", tenantId: "dummy", role: "exhibition_assistant", name: "Dummy User" };
const input = { submissionId: "00000000-0000-4000-8000-000000000001", verifiedData: { fullName: "Dummy Contact", email: "dummy@example.test", notes: "Dummy note", meetingContext: { metAtLocation: "Dummy Event" } }, rawOCRText: "secret OCR", imageBase64: "secret image" };
function fixture() {
  const docs = new Map(); const writes = []; const rows = [["Contact ID"]];
  const settings = {
    async findOne(query) { return docs.get(query.key); },
    async insertOne(doc) { docs.set(doc.key, structuredClone(doc)); writes.push(doc); },
    async updateOne(query, update) {
      const key = query.key || query._id;
      const doc = docs.get(key) || { sequence: 0, ...update.$setOnInsert };
      Object.assign(doc, update.$set || {});
      for (const k of Object.keys(update.$unset || {})) delete doc[k];
      docs.set(key, doc); writes.push(update);
    },
    async findOneAndUpdate(query, update) {
      const doc = docs.get(query.key || query._id);
      if (query.key && (doc.completedAt || doc.lease > new Date())) return null;
      if (update.$inc) doc.sequence += update.$inc.sequence;
      Object.assign(doc, update.$set || {}); writes.push(update); return structuredClone(doc);
    },
  };
  const db = privacyDatabase({ collection(name) { assert.equal(name, "settings"); return settings; } });
  const gateway = { readAll: async () => rows, append: async values => { rows.push([values.at(-1)]); return rows.length; } };
  return { db, gateway, rows, writes, docs };
}

function fullRegister(){const f=fixture();f.rows[0]=mapping.columns.map(c=>c.header);f.gateway.append=async row=>{f.rows.push(row);return f.rows.length;};return f;}

test('twenty different cards submit in one login; company and phone never imply duplicate',async()=>{
 const f=fullRegister(),references=new Set();
 for(let i=0;i<20;i++){
  const result=await submitDirect(f.db,user,{...input,submissionId:randomUUID(),verifiedData:{...input.verifiedData,email:`card${i}@example.test`,fullName:`Dummy ${i}`,companyName:'Shared Company',phone:'+1 202 555 0100'}},new Date(),{sheet:{gateway:f.gateway}});
  assert.equal(result.sheetStatus,'submitted');assert.ok(!result.alreadySubmitted);references.add(result.recordId);
 }
 assert.equal(f.rows.length,21);assert.equal(references.size,20);
});

test('same email returns its actual existing reference without another Sheet append or CC request',async()=>{
 const f=fullRegister();const first=await submitDirect(f.db,user,input,new Date(),{sheet:{gateway:f.gateway}});
 const again=await submitDirect(f.db,user,{...input,submissionId:randomUUID(),verifiedData:{...input.verifiedData,email:' DUMMY@EXAMPLE.TEST ',fullName:'Another Photo'}},new Date(),{sheet:{gateway:f.gateway}});
 assert.equal(again.alreadySubmitted,true);assert.equal(again.recordId,first.recordId);assert.equal(again.verifiedData.fullName,input.verifiedData.fullName);assert.equal(f.rows.length,2);
 await submitProductionContact(f.db,user,input,{saveSheet:async()=>again,deliver:async()=>assert.fail('Duplicate must never create a provider request')});
});

test('a completed reference cannot silently swallow a different card',async()=>{
 const f=fullRegister();await submitDirect(f.db,user,input,new Date(),{sheet:{gateway:f.gateway}});
 await assert.rejects(submitDirect(f.db,user,{...input,verifiedData:{...input.verifiedData,email:'different@example.test'}},new Date(),{sheet:{gateway:f.gateway}}),{code:'SUBMISSION_REFERENCE_CONFLICT'});
 assert.equal(f.rows.length,2);
});

test('legacy references are checked against their real row before reporting success',async()=>{
 const f=fullRegister();await submitDirect(f.db,user,input,new Date(),{sheet:{gateway:f.gateway}});
 const receipt=f.docs.get(`submission:dummy:${user.id}:${input.submissionId}`);delete receipt.dataDigest;
 await assert.rejects(submitDirect(f.db,user,{...input,verifiedData:{...input.verifiedData,email:'new-card@example.test'}},new Date(),{sheet:{gateway:f.gateway}}),{code:'SUBMISSION_REFERENCE_CONFLICT'});
 const original=await submitDirect(f.db,user,input,new Date(),{sheet:{gateway:f.gateway}});assert.equal(original.sheetStatus,'submitted');assert.equal(f.rows.length,2);
});

test('blank emails never match and a lookup cannot confuse another email with the previous card',()=>{
 const f=fullRegister();f.rows.push(mapping.columns.map(c=>({recordId:'L71-QA',email:'one@example.test',fullName:'Shared Name'}[c.field]||'')));
 assert.equal(exactEmailDuplicate(f.rows,''),null);assert.equal(exactEmailDuplicate(f.rows,'two@example.test'),null);assert.equal(exactEmailDuplicate(f.rows,'ONE@EXAMPLE.TEST').recordId,'L71-QA');
});

test('concurrent captures with the same email cannot append two rows',async()=>{
 const f=fullRegister();const another={...input,submissionId:randomUUID()};
 const results=await Promise.allSettled([submitDirect(f.db,user,input,new Date(),{sheet:{gateway:f.gateway}}),submitDirect(f.db,user,another,new Date(),{sheet:{gateway:f.gateway}})]);
 assert.equal(f.rows.length,2);
 for(const result of results)if(result.status==='rejected')assert.equal(result.reason.code,'SHEET_SYNC_BUSY');
 const retry=await submitDirect(f.db,user,another,new Date(),{sheet:{gateway:f.gateway}});
 assert.ok(retry.alreadySubmitted||retry.sheetStatus==='submitted');assert.equal(f.rows.length,2);
});

test('an uncertain email submission cannot be duplicated with a new capture reference',async()=>{
 const f=fullRegister();let calls=0;f.gateway.append=async()=>{calls++;throw new Error('Response lost')};
 await assert.rejects(submitDirect(f.db,user,input,new Date(),{sheet:{gateway:f.gateway}}),{code:'SHEET_RECONCILIATION_REQUIRED'});
 await assert.rejects(submitDirect(f.db,user,{...input,submissionId:randomUUID()},new Date(),{sheet:{gateway:f.gateway}}),{code:'SHEET_RECONCILIATION_REQUIRED'});
 assert.equal(calls,1);
});
test("direct submission writes contact to Sheets and only reference metadata to MongoDB", async () => {
  const f = fixture(); let submitted;
  f.gateway.append = async values => { submitted = values; return 2; };
  const record = await submitDirect(f.db, user, input, new Date(), { sheet: { gateway: f.gateway } });
  assert.equal(record.sheetStatus, "submitted");
  assert.ok(submitted.includes("Dummy Contact")); assert.ok(submitted.includes("Pending Review"));
  const stored = JSON.stringify(f.writes);
  for (const text of ["Dummy Contact", "dummy@example.test", "Dummy note", "secret OCR", "secret image", "verifiedData", "rawOCRText", "imageBase64"]) assert.ok(!stored.includes(text), text);
});
test("failed/uncertain Sheet append can be retried without duplicating the row", async () => {
  const f = fixture(); let calls = 0;
  f.gateway.append = async () => {
    calls++; f.rows.push([f.docs.get(`submission:dummy:${user.id}:${input.submissionId}`).recordId]);
    throw new Error("response lost after append");
  };
  await assert.rejects(submitDirect(f.db, user, input, new Date(), { sheet: { gateway: f.gateway } }), { code: "SHEET_RECONCILIATION_REQUIRED" });
  const result = await submitDirect(f.db, user, input, new Date(), { sheet: { gateway: f.gateway } });
  assert.equal(result.sheetStatus, "submitted"); assert.equal(calls, 1);
  await submitDirect(f.db, user, input, new Date(), { sheet: { gateway: f.gateway } });
  assert.equal(calls, 1);
});
test("missing Sheet configuration is an error, never success", async () => {
  const f = fixture();
  await assert.rejects(submitDirect(f.db, user, input, new Date(), { sheet: { gateway: null } }), { code: "SHEET_NOT_CONFIGURED" });
  assert.equal(f.writes.length, 0);
});

test("administrator uses the same submission flow and retains capturer attribution", async () => {
  const f = fixture();
  const admin = { ...user, email: "hala@aventureaviation.com", role: "vision71_administrator", name: "Hala" };
  const record = await submitDirect(f.db, admin, input, new Date(), { sheet: { gateway: f.gateway } });
  assert.equal(record.sheetStatus, "submitted");
  assert.equal(record.capturedBy, admin.id);
  assert.equal(record.capturedByName, admin.name);
  assert.equal(f.rows.length, 2);
});
test("Mongo guard blocks contact collections and nested password/contact writes", () => {
  const db = privacyDatabase({ collection: () => ({ insertOne() { assert.fail("write reached database"); } }) });
  for (const collection of ["cards", "cardImages", "transfers"]) assert.throws(() => db.collection(collection), { code: "SHEET_ONLY" });
  assert.throws(() => db.collection('users').insertOne({}), {code:'FIREBASE_AUTH_ONLY'});
  for (const value of [{ passwordHash: "x" }, { nested: { rawOCRText: "x" } }, { verifiedData: {} }, { payload: "encrypted" }]) assert.throws(() => db.collection("settings").insertOne(value), { code: "MONGO_PRIVACY_REFUSED" });
});

test('renamed tab failure reports not saved and same-reference retry appends once', async()=>{
 const f=fixture();let calls=0;
 f.gateway.readAll=async()=>{if(!calls++)throw Object.assign(new Error('renamed'),{code:'SHEET_RANGE_INVALID'});return f.rows};
 await assert.rejects(submitDirect(f.db,user,input,new Date(),{sheet:{gateway:f.gateway}}),e=>e.code==='SHEET_RANGE_INVALID'&&e.retrySafe&&e.submissionStatus==='not_saved'&&e.submissionReference.startsWith('L71-'));
 const result=await submitDirect(f.db,user,input,new Date(),{sheet:{gateway:f.gateway}});
 await submitDirect(f.db,user,input,new Date(),{sheet:{gateway:f.gateway}});
 assert.equal(result.sheetStatus,'submitted');assert.equal(f.rows.length,2);
});

test('uncertain append with no visible row never appends a second time',async()=>{
 const f=fixture();let calls=0;f.gateway.append=async()=>{calls++;throw new Error('timeout')};
 for(let i=0;i<2;i++)await assert.rejects(submitDirect(f.db,user,input,new Date(),{sheet:{gateway:f.gateway}}),{code:'SHEET_RECONCILIATION_REQUIRED',retrySafe:false});
 assert.equal(calls,1);
});
