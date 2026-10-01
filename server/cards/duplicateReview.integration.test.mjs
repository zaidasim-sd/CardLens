import "dotenv/config";
import { setServers } from "node:dns";
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { MongoClient, ObjectId } from "mongodb";
import { createCard, getCard, updateCard, findDuplicate, listCards } from "./service.js";
import { applySelectedFields, duplicateReviewContext, resolveDuplicate } from "./duplicateReview.js";

let client, db;
const tenants = [];
before(async () => {
  process.env.CC_ENABLED = "false";
  // Never send fictional integration fixtures to a configured external register.
  process.env.GOOGLE_SHEET_ID = "";
  process.env.GOOGLE_SHEET_TEST_ID = "";
  assert.ok(process.env.MONGODB_URI);
  if (process.env.MONGODB_DNS_SERVERS) setServers(process.env.MONGODB_DNS_SERVERS.split(",").map(value => value.trim()));
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
  // Tests use fictional contacts and never write to the configured Google Sheet.
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "";
  client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  db = client.db(process.env.MONGODB_TEST_DB || "cardsnap_step1_test");
});
after(async () => {
  if (db) for (const collection of ["cards", "cardImages", "auditLogs", "transfers"]) await db.collection(collection).deleteMany({ tenantId: { $in: tenants } });
  await client?.close();
});
async function fixture() {
  const tenantId = `duplicate_review_test_${new ObjectId()}`;
  tenants.push(tenantId);
  const assistant = { id: new ObjectId().toString(), tenantId, role: "exhibition_assistant", name: "Fictional Capturer" };
  const reviewer = { id: new ObjectId().toString(), tenantId, role: "aventure_reviewer", name: "Fictional Reviewer" };
  const data = { fullName: "Fictional Person", companyName: "Fictional Company", jobTitle: "Original title", email: "duplicate@example.test", phone: "+44 7700 900123", notes: "Preserve this note", meetingContext: { metAtLocation: "Event A", whereMet: "Original location" } };
  const existing = await createCard(db, assistant, { verifiedData: data, status: "submitted" });
  await updateCard(db, reviewer, existing.id, { status: "approved" });
  const incoming = await createCard(db, assistant, { verifiedData: { ...data, jobTitle: "New title", notes: "New note", meetingContext: { metAtLocation: "Event B", whereMet: "New location" } }, status: "submitted", allowDuplicate: true });
  const context = await duplicateReviewContext(db, reviewer, incoming.id);
  const input = decision => ({ decision, existingId: existing.id, expectedUpdatedAt: context.record.updatedAt, expectedMatches: Object.fromEntries(context.matches.map(match => [match.id, match.updatedAt])) });
  return { assistant, reviewer, existing: context.matches[0], incoming, context, input, data };
}

test("email matches rank before phone matches; acknowledged duplicates remain flagged", async () => {
  const f = await fixture();
  const phoneRecord = await createCard(db, f.assistant, { verifiedData: { ...f.data, email: "phone-only@example.test", fullName: "Other", companyName: "Other" }, allowDuplicate: true });
  const match = await findDuplicate(db, f.assistant, { email: "duplicate@example.test", phone: f.data.phone });
  assert.equal(match.matchReason, "Matching email address");
  assert.notEqual(match.id, phoneRecord.id);
  assert.equal(f.incoming.duplicateReview.state, "pending");
  assert.equal((await listCards(db, f.reviewer)).find(record => record.id === f.incoming.id).duplicateReview.state, "pending");
});
test("retain existing closes the new submission without changing the original", async () => {
  const f = await fixture();
  const result = await resolveDuplicate(db, f.reviewer, f.incoming.id, f.input("retain_existing"));
  assert.equal(result.status, "rejected");
  assert.equal(result.duplicateReview.decision, "retain_existing");
  assert.deepEqual((await getCard(db, f.reviewer, f.existing.id)).verifiedData, f.data);
  await assert.rejects(updateCard(db, f.reviewer, f.incoming.id, { status: "approved" }), { code: "REVIEW_ALREADY_COMPLETED" });
});
test("update existing applies only selected fields and keeps capture history and unselected data", async () => {
  const f = await fixture();
  const result = await resolveDuplicate(db, f.reviewer, f.incoming.id, { ...f.input("update_existing"), fields: ["jobTitle", "whereMet"] });
  const target = await getCard(db, f.reviewer, f.existing.id);
  assert.equal(result.status, "rejected");
  assert.equal(target.status, "approved");
  assert.equal(target.verifiedData.jobTitle, "New title");
  assert.equal(target.verifiedData.meetingContext.whereMet, "New location");
  assert.equal(target.verifiedData.meetingContext.metAtLocation, "Event A");
  assert.equal(target.verifiedData.notes, f.data.notes);
  assert.equal(target.capturedBy, f.existing.capturedBy);
  assert.equal(target.createdAt, f.existing.createdAt);
  const audit = await db.collection("auditLogs").findOne({ tenantId: f.reviewer.tenantId, recordRef: f.incoming.id, action: "review" });
  assert.deepEqual(audit.details.updatedFields, ["jobTitle", "whereMet"]);
});
test("keep both approves only the new record and leaves the original unchanged", async () => {
  const f = await fixture();
  const result = await resolveDuplicate(db, f.reviewer, f.incoming.id, f.input("keep_both"));
  assert.equal(result.status, "approved");
  assert.deepEqual(await getCard(db, f.reviewer, f.existing.id), Object.fromEntries(Object.entries(f.existing).filter(([key]) => key !== "matchReason")));
});
test("reject new preserves existing and persists a distinct rejection decision", async () => {
  const f = await fixture();
  const result = await resolveDuplicate(db, f.reviewer, f.incoming.id, f.input("reject_new"));
  assert.equal(result.status, "rejected");
  assert.equal(result.duplicateReview.decision, "reject_new");
  assert.deepEqual((await getCard(db, f.reviewer, f.existing.id)).verifiedData, f.data);
});
test("generic approval cannot bypass unresolved duplicate review", async () => {
  const f = await fixture();
  await assert.rejects(updateCard(db, f.reviewer, f.incoming.id, { status: "approved" }), { code: "DUPLICATE_REVIEW_REQUIRED" });
});
test("stale versions and invalid selections leave both records unchanged", async () => {
  const f = await fixture();
  await assert.rejects(resolveDuplicate(db, f.reviewer, f.incoming.id, { ...f.input("update_existing"), expectedUpdatedAt: "stale", fields: ["jobTitle"] }), { code: "REVIEW_STALE" });
  await assert.rejects(resolveDuplicate(db, f.reviewer, f.incoming.id, { ...f.input("update_existing"), fields: ["password"] }), { code: "FIELDS_INVALID" });
  await assert.rejects(resolveDuplicate(db, f.reviewer, f.incoming.id, { ...f.input("update_existing"), expectedMatches: {}, fields: ["jobTitle"] }), { code: "REVIEW_STALE" });
  assert.equal((await getCard(db, f.reviewer, f.incoming.id)).status, "submitted");
  assert.equal((await getCard(db, f.reviewer, f.existing.id)).verifiedData.jobTitle, "Original title");
});
test("capturers, cross-tenant reviewers and self-approval are rejected", async () => {
  const f = await fixture();
  await assert.rejects(duplicateReviewContext(db, f.assistant, f.incoming.id), { code: "FORBIDDEN" });
  await assert.rejects(resolveDuplicate(db, f.assistant, f.incoming.id, f.input("keep_both")), { code: "FORBIDDEN" });
  await assert.rejects(duplicateReviewContext(db, { ...f.reviewer, tenantId: "other" }, f.incoming.id), { code: "CARD_NOT_FOUND" });
  await assert.rejects(resolveDuplicate(db, { ...f.reviewer, id: f.assistant.id }, f.incoming.id, f.input("keep_both")), { code: "SELF_APPROVAL_FORBIDDEN" });
});
test("two concurrent decisions cannot both succeed", async () => {
  const f = await fixture();
  const results = await Promise.allSettled([resolveDuplicate(db, f.reviewer, f.incoming.id, f.input("keep_both")), resolveDuplicate(db, f.reviewer, f.incoming.id, f.input("reject_new"))]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(await db.collection("auditLogs").countDocuments({ tenantId: f.reviewer.tenantId, recordRef: f.incoming.id, action: "review" }), 1);
});
test("only explicitly selected blank fields can clear an existing value", () => {
  const original = { fullName: "Fictional", notes: "Preserve", meetingContext: { whereMet: "Office" } };
  const incoming = { fullName: "", notes: "", meetingContext: { whereMet: "" } };
  const result = applySelectedFields(original, incoming, ["whereMet"]);
  assert.equal(result.fullName, "Fictional");
  assert.equal(result.notes, "Preserve");
  assert.equal(result.meetingContext.whereMet, "");
  assert.equal(original.meetingContext.whereMet, "Office");
});

test("transaction failure rolls back existing-field updates, submission status and audit", async () => {
  const f = await fixture();
  const failingDb = { client: db.client, collection(name) {
    if (name === "auditLogs") return { insertOne: async () => { throw new Error("Simulated audit write failure"); } };
    return db.collection(name);
  } };
  await assert.rejects(resolveDuplicate(failingDb, f.reviewer, f.incoming.id, { ...f.input("update_existing"), fields: ["jobTitle"] }), /Simulated audit write failure/);
  assert.equal((await getCard(db, f.reviewer, f.existing.id)).verifiedData.jobTitle, "Original title");
  assert.equal((await getCard(db, f.reviewer, f.incoming.id)).status, "submitted");
  assert.equal(await db.collection("auditLogs").countDocuments({ tenantId: f.reviewer.tenantId, action: "review" }), 0);
});
