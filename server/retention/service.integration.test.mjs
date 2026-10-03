import { pilot } from "../pilot.js";
// Legacy regression coverage: exercise preserved functionality in this isolated test process.
pilot.internalReviewEnabled = true;
pilot.constantContactEnabled = true;
import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { MongoClient, ObjectId } from "mongodb";
import { ensureDatabaseIndexes } from "../db.js";
import { createCard, deleteCard, getCard } from "../cards/service.js";
import { getRetentionHours, setRetentionHours, sweepExpiredImages } from "./service.js";
import { equalSecret } from "../http/retentionHandlers.js";

const databaseName = process.env.MONGODB_TEST_DB || "cardsnap_step1_test";
const tenantId = `fake_retention_tenant_${Date.now()}`;
const assistant = { id: new ObjectId().toString(), tenantId, role: "exhibition_assistant" };
const reviewer = { id: new ObjectId().toString(), tenantId, role: "aventure_reviewer" };
const administrator = { id: new ObjectId().toString(), tenantId, role: "vision71_administrator" };
const contact = {
  fullName: "Riley Fixture", jobTitle: "Test Role", companyName: "Fixture Company", email: "riley@example.test",
  phone: "+44 7700 900555", alternatePhone: "", website: "", address: "", city: "", country: "", notes: "Fake data", meetingContext: {},
};
let client;
let db;

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
  await db.collection("users").insertOne({ _id: new ObjectId(reviewer.id), tenantId, role: "aventure_reviewer", name: "Fake Reviewer", email: "retention.reviewer@example.test", emailLower: "retention.reviewer@example.test" });
});

after(async () => {
  for (const name of ["cards", "cardImages", "settings", "auditLogs", "users"]) await db.collection(name).deleteMany({ tenantId });
  await client.close();
});

function cardInput(suffix) {
  const value = { ...contact, fullName: `Riley Fixture ${suffix}`, email: `riley.${suffix}@example.test`, phone: `+44 7700 90${suffix.padStart(4, "0")}` };
  return { rawOCRText: `Fake OCR ${suffix}`, ocrData: value, verifiedData: value, status: "submitted", assignedReviewerId: reviewer.id, imageBase64: Buffer.from(`fake image ${suffix}`).toString("base64"), imageMimeType: "image/jpeg" };
}

test("expired image is deleted by the sweep and logged", async () => {
  const start = new Date();
  await setRetentionHours(db, administrator, 1, start);
  const card = await createCard(db, assistant, cardInput("1"), start);
  assert.ok(await db.collection("cardImages").findOne({ cardId: new ObjectId(card.id), tenantId }));
  const result = await sweepExpiredImages(db, { tenantId, now: new Date(start.getTime() + 60 * 60 * 1000 + 1) });
  assert.equal(result.deleted, 1);
  assert.equal(await db.collection("cardImages").countDocuments({ cardId: new ObjectId(card.id), tenantId }), 0);
  const loaded = await getCard(db, assistant, card.id);
  assert.equal(loaded.verifiedData.email, "riley.1@example.test");
  assert.ok(loaded.imageExpiredAt);
  assert.equal(await db.collection("auditLogs").countDocuments({ tenantId, action: "image_deleted", recordRef: card.id }), 1);
});

test("retention 0 never stores an image", async () => {
  await setRetentionHours(db, administrator, 0);
  assert.equal(await getRetentionHours(db, tenantId), 0);
  const card = await createCard(db, assistant, cardInput("2"));
  assert.equal(card.hasImage, false);
  assert.equal(await db.collection("cardImages").countDocuments({ cardId: new ObjectId(card.id), tenantId }), 0);
});

test("administrator deletion removes image and contact fields and is logged", async () => {
  await setRetentionHours(db, administrator, 24);
  const card = await createCard(db, assistant, cardInput("3"));
  await deleteCard(db, administrator, card.id);
  assert.equal(await db.collection("cards").countDocuments({ _id: new ObjectId(card.id), tenantId }), 0);
  assert.equal(await db.collection("cardImages").countDocuments({ cardId: new ObjectId(card.id), tenantId }), 0);
  assert.equal(await db.collection("auditLogs").countDocuments({ tenantId, action: "deletion", recordRef: card.id }), 1);
});

test("retention bounds and protected sweep secret are enforced", async () => {
  await assert.rejects(setRetentionHours(db, administrator, 169), { code: "RETENTION_INVALID" });
  assert.equal(equalSecret("fake secret", "fake secret"), true);
  assert.equal(equalSecret("wrong secret", "fake secret"), false);
  assert.equal(equalSecret("", "fake secret"), false);
  const indexes = await db.collection("cardImages").indexes();
  assert.ok(indexes.some((index) => index.key?.expiresAt === 1 && index.expireAfterSeconds === 7200));
});
