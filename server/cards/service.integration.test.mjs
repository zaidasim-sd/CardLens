import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { MongoClient, ObjectId } from "mongodb";
import { ensureDatabaseIndexes } from "../db.js";
import { createCard, findDuplicate, getCard, getCardImage, listCards, storageHealth, updateCard } from "./service.js";
import { encryptValue } from "../security/encryption.js";

const databaseName = process.env.MONGODB_TEST_DB || "cardsnap_step1_test";
const tenantId = `fake_cards_tenant_${Date.now()}`;
const otherTenantId = `${tenantId}_other`;
const assistant = { id: new ObjectId().toString(), tenantId, role: "exhibition_assistant" };
const reviewer = { id: new ObjectId().toString(), tenantId, role: "aventure_reviewer" };
const unassignedReviewer = { id: new ObjectId().toString(), tenantId, role: "aventure_reviewer" };
const otherReviewer = { id: new ObjectId().toString(), tenantId: otherTenantId, role: "aventure_reviewer" };
const administrator = { id: new ObjectId().toString(), tenantId, role: "aventure_administrator" };
const fakeContact = {
  fullName: "Morgan Example",
  jobTitle: "Test Coordinator",
  companyName: "Example Test Company",
  email: "morgan@example.test",
  phone: "+44 7700 900123",
  alternatePhone: "",
  website: "example.test",
  address: "1 Example Road",
  city: "Testville",
  country: "Exampleland",
  notes: "Fake test contact only",
  meetingContext: {},
};
let client;
let db;
let record;

before(async () => {
  assert.ok(process.env.MONGODB_URI, "MONGODB_URI is required for integration tests");
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
  client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  db = client.db(databaseName);
  await ensureDatabaseIndexes(db);
  await db.collection("users").insertOne({ _id: new ObjectId(reviewer.id), tenantId, role: "aventure_reviewer", name: "Fake Reviewer", email: "reviewer@example.test" });
  record = await createCard(db, assistant, {
    rawOCRText: "Morgan Example fake OCR text",
    ocrData: fakeContact,
    verifiedData: fakeContact,
    originalFileName: "fake-card.jpg",
    imageBase64: Buffer.from("fake encrypted card image").toString("base64"),
    imageMimeType: "image/jpeg",
    status: "submitted",
    source: "ocr",
    assignedReviewerId: reviewer.id,
  });
});

after(async () => {
  await db.collection("cardImages").deleteMany({ tenantId: { $in: [tenantId, otherTenantId] } });
  await db.collection("cards").deleteMany({ tenantId: { $in: [tenantId, otherTenantId] } });
  await db.collection("auditLogs").deleteMany({ tenantId: { $in: [tenantId, otherTenantId] } });
  await db.collection("users").deleteMany({ tenantId: { $in: [tenantId, otherTenantId] } });
  await client.close();
});

test("records save and load from central storage", async () => {
  const loaded = await getCard(db, reviewer, record.id);
  assert.equal(loaded.verifiedData.email, fakeContact.email);
  assert.equal((await listCards(db, reviewer)).some((item) => item.id === record.id), true);
  const updated = await updateCard(db, reviewer, record.id, { verifiedData: { ...fakeContact, jobTitle: "Updated Fake Role" } });
  assert.equal(updated.verifiedData.jobTitle, "Updated Fake Role");
});

test("stored contact and image values are unreadable ciphertext", async () => {
  const storedCard = await db.collection("cards").findOne({ _id: new ObjectId(record.id), tenantId });
  const storedImage = await db.collection("cardImages").findOne({ cardId: new ObjectId(record.id), tenantId });
  const raw = JSON.stringify({ storedCard, storedImage });
  for (const secret of [fakeContact.fullName, fakeContact.email, fakeContact.phone, "fake OCR text", "fake encrypted card image"]) assert.equal(raw.includes(secret), false);
  assert.equal(typeof storedCard.payload.data, "string");
  assert.equal(typeof storedImage.encryptedImage.data, "string");
  const image = await getCardImage(db, reviewer, record.id);
  assert.equal(image.data.toString(), "fake encrypted card image");
});

test("encryption uses a random IV and records its key version", () => {
  const first = encryptValue({ value: "fake" });
  const second = encryptValue({ value: "fake" });
  assert.notEqual(first.iv, second.iv);
  assert.equal(first.v, 1);
  assert.notEqual(first.data, second.data);
});

test("tenant separation prevents reads from another tenant", async () => {
  await assert.rejects(getCard(db, otherReviewer, record.id), { code: "CARD_NOT_FOUND" });
  assert.equal((await listCards(db, otherReviewer)).some((item) => item.id === record.id), false);
});

test("only the assigned reviewer receives a submitted record", async () => {
  assert.equal((await listCards(db, reviewer)).some((item) => item.id === record.id), true);
  assert.equal((await listCards(db, unassignedReviewer)).some((item) => item.id === record.id), false);
});

test("duplicate checking covers tenant email phone and name with company", async () => {
  const emailMatch = await findDuplicate(db, assistant, { ...fakeContact, phone: "", fullName: "", companyName: "" });
  assert.equal(emailMatch.id, record.id);
  assert.equal(emailMatch.restricted, undefined);
  assert.equal(emailMatch.verifiedData.email, fakeContact.email);
  assert.equal((await findDuplicate(db, assistant, { ...fakeContact, email: "", fullName: "", companyName: "" })).id, record.id);
  assert.equal((await findDuplicate(db, assistant, { ...fakeContact, email: "", phone: "" })).id, record.id);
  const otherAssistant = { ...assistant, id: new ObjectId().toString(), tenantId: otherTenantId };
  assert.equal(await findDuplicate(db, otherAssistant, fakeContact), null);
});

test("storage health reports the free cluster limit to administrators", async () => {
  const health = await storageHealth(db, administrator);
  assert.equal(health.limitBytes, 512 * 1024 * 1024);
  assert.equal(typeof health.warning, "boolean");
  await assert.rejects(storageHealth(db, reviewer), { code: "FORBIDDEN" });
});
