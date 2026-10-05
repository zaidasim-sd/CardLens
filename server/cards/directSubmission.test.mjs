import test from "node:test";
import assert from "node:assert/strict";
import { submitDirect } from "./directSubmission.js";
import { privacyDatabase } from "../db.js";

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
  await assert.rejects(submitDirect(f.db, user, input, new Date(), { sheet: { gateway: f.gateway } }), { code: "SHEET_SUBMISSION_FAILED" });
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
test("Mongo guard blocks contact collections and nested password/contact writes", () => {
  const db = privacyDatabase({ collection: () => ({ insertOne() { assert.fail("write reached database"); } }) });
  for (const collection of ["cards", "cardImages", "transfers"]) assert.throws(() => db.collection(collection), { code: "SHEET_ONLY" });
  for (const value of [{ passwordHash: "x" }, { nested: { rawOCRText: "x" } }, { verifiedData: {} }, { payload: "encrypted" }]) assert.throws(() => db.collection("users").insertOne(value), { code: "MONGO_PRIVACY_REFUSED" });
});
