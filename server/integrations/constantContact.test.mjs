import test from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { approvalTransfer, beginConnection, finishConnection, contactPayload, transferApproved, hash } from "./constantContact.js";
import { encryptValue } from "../security/encryption.js";

process.env.ENCRYPTION_KEY = "a".repeat(64);
process.env.CC_CLIENT_ID = "fixture";
process.env.CC_CUSTOM_FIELD_LABEL = "";
process.env.CC_ENABLED = "true";
const now = new Date();
const data = { fullName: "Jane Example", email: "JANE@example.test", companyName: "Example", meetingContext: { metAtLocation: "Event A", whereMet: "Entrance" } };
function fixture(changes = {}) {
  const card = { _id: new ObjectId(), tenantId: "fixture", capturedBy: "capturer", status: "approved", updatedAt: now, ccApproval: { reviewerId: "reviewer", version: now.toISOString() }, transferStatus: "pending", payload: encryptValue({ verifiedData: data }), ...changes };
  const audits = [];
  const settings = { tokens: encryptValue({ access: "fake-access", refresh: "fake-refresh", expires: Date.now() + 1000000 }) };
  const db = { collection(name) { return name === "cards" ? { findOne: async () => card, findOneAndUpdate: async () => { if (card.ccLease > new Date()) return null; card.ccLease = new Date(Date.now() + 180000); return card; }, updateOne: async (_query, update) => { Object.assign(card, update.$set); if (update.$unset?.ccLease !== undefined) delete card.ccLease; } } : name === "settings" ? { findOne: async () => settings, updateOne: async () => {} } : { insertOne: async entry => audits.push(entry) }; } };
  return { card, db, audits };
}
function gateway(existing = [], uncertain = false) {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/contacts") && options.method === "POST") { if (uncertain) throw new Error("timeout"); return Response.json({ contact_id: "confirmed-id" }); }
    if (url.includes("/contacts?")) return Response.json({ contacts: existing });
    return Response.json({ lists: [{ list_id: "list-id", name: "Test List" }] });
  };
  return { calls, fetcher };
}
test("capture, rejection, unresolved duplicate, missing approval, self approval and completed transfer never call provider", async () => {
  for (const changes of [{ status: "submitted" }, { status: "draft" }, { status: "rejected" }, { duplicateReview: { state: "pending" } }, { ccApproval: null }, { capturedBy: "reviewer" }, { transferStatus: "transferred" }]) {
    const { db } = fixture(changes), mock = gateway();
    await transferApproved(db, new ObjectId(), "fixture", mock.fetcher);
    assert.equal(mock.calls.length, 0);
  }
});
test("approved contact transfers only once and only marks confirmed creation as transferred", async () => {
  const { db, card, audits } = fixture(), mock = gateway();
  await transferApproved(db, card._id, card.tenantId, mock.fetcher);
  assert.equal(card.transferStatus, "transferred");
  assert.equal(card.ccContactId, "confirmed-id");
  assert.equal(audits[0].action, "transfer");
  await transferApproved(db, card._id, card.tenantId, mock.fetcher);
  assert.equal(mock.calls.filter(call => call.options.method === "POST").length, 1);
});
test("existing email including unsubscribed contacts is never overwritten or subscribed", async () => {
  const { db, card } = fixture(), mock = gateway([{ contact_id: "existing", email_address: { permission_to_send: "unsubscribed" } }]);
  await transferApproved(db, card._id, card.tenantId, mock.fetcher);
  assert.equal(card.transferStatus, "existing_contact");
  assert.equal(mock.calls.length, 1);
});
test("uncertain create is reconciled using reads and never blindly posted again", async () => {
  const { db, card } = fixture(), mock = gateway([], true);
  await transferApproved(db, card._id, card.tenantId, mock.fetcher);
  assert.equal(card.transferStatus, "reconciliation_required");
  await transferApproved(db, card._id, card.tenantId, mock.fetcher);
  assert.equal(mock.calls.filter(call => call.options.method === "POST").length, 1);
});
test("stale approval snapshot never transfers", async () => {
  const { db, card } = fixture({ updatedAt: new Date(now.getTime() + 1000) }), mock = gateway();
  await transferApproved(db, card._id, card.tenantId, mock.fetcher);
  assert.equal(mock.calls.length, 0);
});
test("phone only records remain approved but cannot be transferred by inventing an email", async () => {
  const { db, card } = fixture({ payload: encryptValue({ verifiedData: { phone: "1234567890" } }) }), mock = gateway();
  await transferApproved(db, card._id, card.tenantId, mock.fetcher);
  assert.equal(card.status, "approved"); assert.equal(card.transferStatus, "failed"); assert.equal(mock.calls.length, 0);
});
test("OAuth tokens and secrets are absent from contact payload; source and location map into configured field", () => {
  const payload = contactPayload(data, "list", "field", "record");
  assert.equal(payload.email_address.address, "jane@example.test");
  assert.equal(payload.create_source, "Account");
  assert.equal(payload.custom_fields[0].value, "CardSnap:record|Event A|Entrance");
  assert.ok(!JSON.stringify(payload).includes("fake-access"));
  assert.throws(() => approvalTransfer({ capturedBy: "reviewer" }, { id: "reviewer" }), /different reviewer/);
});
test("one-time OAuth uses a hashed state and nonce, contact-only scope and an HTTP-only callback cookie", async () => {
  process.env.CC_CLIENT_SECRET = "fake-secret";
  process.env.CC_REDIRECT_URI = "http://localhost:3000/auth/callback";
  let saved;
  const db = { collection: () => ({ findOne: async () => null, insertOne: async value => { saved = value; } }) };
  const result = await beginConnection(db, { tenantId: "fixture" }, { userId: "admin", _id: "session" });
  const url = new URL(result.url);
  assert.equal(url.searchParams.get("scope"), "contact_data offline_access");
  assert.equal(saved.key, `cc_oauth:${hash(url.searchParams.get("state"))}`);
  assert.match(result.cookie, /HttpOnly; SameSite=Lax/);
  assert.ok(!JSON.stringify(saved).includes(url.searchParams.get("state")));
  assert.ok(!result.url.includes("fake-secret"));
});
test("OAuth callback rejects missing nonce, replayed state and expired administrator session without token calls", async () => {
  await assert.rejects(finishConnection({}, { state: "state", code: "code" }, ""), /expired/);
  const missing = { collection: () => ({ findOneAndDelete: async () => null }) };
  await assert.rejects(finishConnection(missing, { state: "state", code: "code" }, "nonce"), /expired/);
  const expired = { collection: name => name === "settings" ? { findOneAndDelete: async () => ({ sessionId: "session", userId: "admin", tenantId: "fixture" }) } : { findOne: async () => name === "sessions" ? { absoluteExpiresAt: new Date(0), lastSeenAt: new Date(), anonymous: false } : { role: "vision71_administrator" } } };
  await assert.rejects(finishConnection(expired, { state: "state", code: "code" }, "nonce"), /session expired/);
});
test("a live transfer lease prevents a concurrent provider request", async () => {
  const { db, card } = fixture({ ccLease: new Date(Date.now() + 100000) }), mock = gateway();
  await transferApproved(db, card._id, card.tenantId, mock.fetcher);
  assert.equal(mock.calls.length, 0);
});
