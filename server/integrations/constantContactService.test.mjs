import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { ObjectId } from "mongodb";
import { encryptValue } from "../security/encryption.js";
import { createConstantContactClient, transferApprovedCard } from "./constantContactService.js";

function database(card, settings = { listId: "fake-list", eventFieldId: "fake-field" }) {
  const values = { cards: [card], settings: [{ tenantId: card.tenantId, key: "constant_contact", ...settings }], transfers: [], auditLogs: [] };
  const matches = (item, query) => Object.entries(query).every(([key, value]) => value instanceof ObjectId ? String(item[key]) === String(value) : item[key] === value);
  return {
    values,
    collection(name) {
      return {
        findOne: async (query) => values[name].find((item) => matches(item, query)) || null,
        updateOne: async (query, update, options) => {
          let item = values[name].find((entry) => matches(entry, query));
          if (!item && options?.upsert) { item = { ...query }; values[name].push(item); }
          if (item && update.$set) Object.assign(item, update.$set);
        },
        updateMany: async () => {},
        insertOne: async (value) => { values[name].push(value); return { insertedId: new ObjectId() }; },
      };
    },
  };
}

function approvedCard(reviewerId) {
  const now = new Date();
  return {
    _id: new ObjectId(), tenantId: "vision71-test", assignedReviewerId: new ObjectId(reviewerId), capturedBy: new ObjectId(), reviewedBy: new ObjectId(reviewerId),
    status: "approved", transferStatus: "not_started", createdAt: now, reviewedAt: now,
    payload: encryptValue({ source: "manual", rawOCRText: "", ocrData: {}, verifiedData: { fullName: "Fake Person", companyName: "Example Company", email: "fake@example.test", phone: "+1 202 555 0100", notes: "", meetingContext: { metAtLocation: "Test Expo" } } }),
  };
}

test("Constant Contact sign in sends the secret in a header and not the URL", async () => {
  let call;
  const client = createConstantContactClient({ CC_ENV: "test", CC_CLIENT_ID: "fake-client", CC_CLIENT_SECRET: "fake-secret", CC_REDIRECT_URI: "https://staging.example.test/callback" }, async (url, options) => {
    call = { url, options };
    return { ok: true, json: async () => ({ access_token: "fake-access", refresh_token: "fake-refresh", expires_in: 7200 }) };
  });
  await client.exchange("fake-code");
  assert.equal(call.url.includes("fake-secret"), false);
  assert.match(call.options.headers.Authorization, /^Basic /);
});

test("approved contact is created, assigned to the configured list and repeated transfer creates nothing", async () => {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const reviewerId = new ObjectId().toString();
  const db = database(approvedCard(reviewerId));
  let creates = 0;
  const client = { lookup: async () => [], create: async (_token, payload) => { creates += 1; assert.deepEqual(payload.list_memberships, ["fake-list"]); return { contact_id: "fake-contact" }; }, assignList: async () => assert.fail("not a duplicate") };
  const actor = { id: reviewerId, tenantId: "vision71-test", role: "aventure_reviewer" };
  const first = await transferApprovedCard(db, actor, String(db.values.cards[0]._id), { client, token: { access_token: "fake-token" }, settings: db.values.settings[0], sheet: { gateway: null } });
  const second = await transferApprovedCard(db, actor, String(db.values.cards[0]._id), { client, token: { access_token: "fake-token" }, settings: db.values.settings[0], sheet: { gateway: null } });
  assert.equal(first.status, "transferred");
  assert.equal(second.repeated, true);
  assert.equal(creates, 1);
});

test("existing Constant Contact contact is handled and assigned without creating a duplicate", async () => {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const reviewerId = new ObjectId().toString();
  const db = database(approvedCard(reviewerId));
  let assignments = 0;
  const client = { lookup: async () => [{ contact_id: "existing-contact", list_memberships: [] }], create: async () => assert.fail("must not create"), assignList: async () => { assignments += 1; } };
  const actor = { id: reviewerId, tenantId: "vision71-test", role: "aventure_reviewer" };
  const result = await transferApprovedCard(db, actor, String(db.values.cards[0]._id), { client, token: { access_token: "fake-token" }, settings: db.values.settings[0], sheet: { gateway: null } });
  assert.equal(result.duplicate, true);
  assert.equal(assignments, 1);
});
