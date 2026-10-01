import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { MongoClient, ObjectId } from "mongodb";
import { ensureDatabaseIndexes } from "../db.js";
import { createPreauthSession, createUser, removeUser, signIn, signOut } from "../auth/service.js";
import { createCard } from "../cards/service.js";
import { aggregateCounts } from "../support/service.js";
import { writeAudit } from "./service.js";
import { refreshStatusesFromSheet } from "../integrations/sheetService.js";
import sheetMapping from "../../config/sheetMapping.json" with { type: "json" };

const databaseName = process.env.MONGODB_TEST_DB || "cardsnap_step1_test";
const tenantId = `fake_audit_tenant_${Date.now()}`;
const password = "FakePassword123!";
const administrator = { id: new ObjectId().toString(), tenantId, role: "vision71_administrator" };
const reviewer = { id: new ObjectId().toString(), tenantId, role: "aventure_reviewer" };
const support = { id: new ObjectId().toString(), tenantId, role: "vision71_support" };
const fakeContact = {
  fullName: "Taylor Example",
  jobTitle: "Test Person",
  companyName: "Example Fixture Company",
  email: "taylor@example.test",
  phone: "+1 202 555 0199",
  alternatePhone: "",
  website: "",
  address: "",
  city: "",
  country: "",
  notes: "Fake details only",
  meetingContext: {},
};
let client;
let db;
let assistant;

before(async () => {
  process.env.CC_ENABLED = "false";
  // Never send fictional integration fixtures to a configured external register.
  process.env.GOOGLE_SHEET_ID = "";
  process.env.GOOGLE_SHEET_TEST_ID = "";
  assert.ok(process.env.MONGODB_URI, "MONGODB_URI is required for integration tests");
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
  client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  db = client.db(databaseName);
  await ensureDatabaseIndexes(db);
  await db.collection("users").insertOne({ _id: new ObjectId(reviewer.id), tenantId, role: "aventure_reviewer", name: "Fake Reviewer", email: "reviewer.audit@example.test", emailLower: "reviewer.audit@example.test" });
});

after(async () => {
  for (const name of ["sessions", "loginAttempts", "rateLimits", "users", "cards", "cardImages", "auditLogs"]) await db.collection(name).deleteMany({ tenantId });
  await client.close();
});

async function assertOne(action, operation) {
  const beforeCount = await db.collection("auditLogs").countDocuments({ tenantId });
  const result = await operation();
  const entries = await db.collection("auditLogs").find({ tenantId }).sort({ _id: -1 }).limit(1).toArray();
  assert.equal(await db.collection("auditLogs").countDocuments({ tenantId }), beforeCount + 1);
  assert.equal(entries[0].action, action);
  return result;
}

async function assertOneFailure(action, operation, expectedCode) {
  const beforeCount = await db.collection("auditLogs").countDocuments({ tenantId });
  await assert.rejects(operation, { code: expectedCode });
  const entries = await db.collection("auditLogs").find({ tenantId }).sort({ _id: -1 }).limit(1).toArray();
  assert.equal(await db.collection("auditLogs").countDocuments({ tenantId }), beforeCount + 1);
  assert.equal(entries[0].action, action);
}

function sheetGateway(id, status) {
  const headings = sheetMapping.columns.map((column) => column.header);
  const row = sheetMapping.columns.map(column => column.field === "status" ? status : column.field === "recordId" ? id : "");
  return { readAll: async () => [headings, row] };
}

test("implemented actions each append exactly one audit entry", async () => {
  assistant = await assertOne("user_created", () => createUser(db, administrator, { email: "assistant@example.test", name: "Fake Assistant", role: "exhibition_assistant", password }));
  const removed = await assertOne("user_created", () => createUser(db, administrator, { email: "removed.audit@example.test", name: "Fake Removed Account", role: "exhibition_assistant", password }));
  await assertOne("user_removed", () => removeUser(db, administrator, removed.id));
  const preauth = await createPreauthSession(db);
  const signedIn = await assertOne("sign_in", () => signIn(db, { tenantId, email: assistant.email, password, ip: "192.0.2.33", sessionToken: preauth.sessionToken, csrfToken: preauth.csrfToken }));
  const failedPreauth = await createPreauthSession(db);
  await assertOneFailure("failed_sign_in", () => signIn(db, { tenantId, email: assistant.email, password: "WrongPassword123!", ip: "192.0.2.34", sessionToken: failedPreauth.sessionToken, csrfToken: failedPreauth.csrfToken }), "INVALID_CREDENTIALS");
  await assertOne("sign_out", () => signOut(db, signedIn.sessionToken, signedIn.csrfToken));
  const first = await assertOne("upload", () => createCard(db, assistant, { rawOCRText: "Fake OCR words", ocrData: fakeContact, verifiedData: fakeContact, status: "submitted", assignedReviewerId: reviewer.id }));
  await assertOne("correction", () => refreshStatusesFromSheet(db, tenantId, { gateway: sheetGateway(first.id, "Return for Correction") }));
  await assertOne("approval", () => refreshStatusesFromSheet(db, tenantId, { gateway: sheetGateway(first.id, "Approved") }));
  const secondContact = { ...fakeContact, fullName: "Jordan Fixture", companyName: "Second Example Company", email: "second@example.test", phone: "+1 202 555 0188" };
  const second = await assertOne("upload", () => createCard(db, assistant, { rawOCRText: "Different fake OCR words", ocrData: secondContact, verifiedData: secondContact, status: "submitted", assignedReviewerId: reviewer.id }));
  await assertOne("rejection", () => refreshStatusesFromSheet(db, tenantId, { gateway: sheetGateway(second.id, "Rejected") }));
  await assertOne("support_access", () => aggregateCounts(db, support));
  await assertOneFailure("support_access", () => aggregateCounts(db, reviewer), "FORBIDDEN");
});

test("future controlled actions use the same append only audit writer", async () => {
  for (const action of ["transfer", "deletion", "retention_change", "export", "image_deleted"]) {
    await assertOne(action, () => writeAudit(db, { tenantId, actor: administrator, action, recordRef: new ObjectId(), outcome: "success" }));
  }
});

test("audit entries contain references and never contact details", async () => {
  const entries = await db.collection("auditLogs").find({ tenantId }).toArray();
  assert.ok(entries.length > 0);
  const serialized = JSON.stringify(entries);
  for (const value of [fakeContact.fullName, fakeContact.companyName, fakeContact.email, fakeContact.phone, fakeContact.notes, "Fake OCR words"]) assert.equal(serialized.includes(value), false);
  for (const entry of entries) assert.deepEqual(Object.keys(entry).sort(), ["_id", "action", "actorId", "actorRole", "outcome", "recordRef", "tenantId", "time"].sort());
});
