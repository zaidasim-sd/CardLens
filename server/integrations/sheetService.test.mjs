import assert from "node:assert/strict";
import test from "node:test";
import { ObjectId } from "mongodb";
import { addPendingSheetRecord, columnLetter, createSheetGateway, refreshStatusesFromSheet, safeSheetValue, sheetRow, updateSheetRecord, normalizeGooglePrivateKey, diagnoseSheet, sheetFailure } from "./sheetService.js";
import mapping from "../../config/sheetMapping.json" with { type: "json" };

test("hosted private-key values normalize escaped newlines and surrounding JSON quotes", () => {
  const value = "-----BEGIN PRIVATE KEY-----\nfixture\n-----END PRIVATE KEY-----\n";
  assert.equal(normalizeGooglePrivateKey(value), value.trim());
  assert.equal(normalizeGooglePrivateKey(value.replaceAll("\n", "\\n")), value.trim());
  assert.equal(normalizeGooglePrivateKey(JSON.stringify(value)), value.trim());
});
test("production diagnostic identifies an unapproved target without contacting Google", async () => {
  const result = await diagnoseSheet({ GOOGLE_SHEET_ID: "production", GOOGLE_SERVICE_ACCOUNT_EMAIL: "fixture@example.test", GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: "fake-private-key", GOOGLE_SHEET_TAB: "Sheet1", SHEET_TARGET_APPROVED: "false" });
  assert.equal(result.ok, false);
  assert.equal(result.code, "SHEET_TARGET_REFUSED");
  assert.ok(!JSON.stringify(result).includes("fake-private-key"));
});
test("diagnostic identifies malformed keys and never exposes credential values", async () => {
  const result = await diagnoseSheet({ GOOGLE_SHEET_ID: "production", GOOGLE_SERVICE_ACCOUNT_EMAIL: "fixture@example.test", GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: "private-secret-fixture", SHEET_TARGET_APPROVED: "true" });
  assert.equal(result.code, "SHEET_KEY_INVALID");
  assert.ok(!JSON.stringify(result).includes("private-secret-fixture"));
  assert.ok(!JSON.stringify(sheetFailure(new Error("private-secret-fixture"))).includes("private-secret-fixture"));
});
import { encryptValue } from "../security/encryption.js";
import { randomBytes } from "node:crypto";

function fakeDb() {
  const transfers = [];
  return {
    transfers,
    collection(name) {
      if (name === "users") return { find: () => ({ toArray: async () => [] }) };
      return {
        findOne: async (query) => transfers.find((item) => item.tenantId === query.tenantId && item.cardId === query.cardId && item.provider === query.provider) || null,
        updateOne: async (query, update, options) => {
          let item = query._id ? transfers.find((entry) => entry._id === query._id) : transfers.find((entry) => entry.tenantId === query.tenantId && entry.cardId === query.cardId && entry.provider === query.provider);
          if (!item && options?.upsert) { item = { _id: `transfer-${transfers.length + 1}`, ...update.$setOnInsert }; transfers.push(item); }
          if (item && update.$set) Object.assign(item, update.$set);
        },
      };
    },
  };
}

const card = {
  id: "fake-record-1",
  tenantId: "vision71-test",
  capturedBy: "capturer-1",
  status: "submitted",
  createdAt: "2026-09-30T10:00:00.000Z",
  transferStatus: "not_started",
  verifiedData: { fullName: "Fake Contact", companyName: "Example Company", jobTitle: "Tester", email: "fake@example.test", phone: "+1 202 555 0100", notes: "=unsafe", meetingContext: { metAtLocation: "Test Expo" } },
};

test("pending contact is appended once and repeated submission is idempotent", async () => {
  const db = fakeDb();
  let appends = 0;
  const gateway = { append: async () => { appends += 1; return 7; }, update: async () => {} };
  await addPendingSheetRecord(db, card, { gateway, people: { capturedByName: "Fake Capturer" } });
  await addPendingSheetRecord(db, card, { gateway, people: { capturedByName: "Fake Capturer" } });
  assert.equal(appends, 1);
  assert.equal(db.transfers[0].rowNumber, 7);
});

test("review result updates the existing row with automatic fields", async () => {
  const db = fakeDb();
  let updated;
  const gateway = { append: async () => 7, update: async (rowNumber, row) => { updated = { rowNumber, row }; } };
  await addPendingSheetRecord(db, card, { gateway, people: { capturedByName: "Fake Capturer" } });
  await updateSheetRecord(db, { ...card, status: "approved", reviewedBy: "reviewer-1", reviewedAt: "2026-09-30T10:05:00.000Z" }, { gateway, people: { capturedByName: "Fake Capturer", reviewedByName: "Fake Reviewer" } });
  assert.equal(updated.rowNumber, 7);
  assert.equal(updated.row.includes("Approved"), true);
  assert.equal(updated.row.includes("Fake Reviewer"), true);
});

test("formula values are escaped before Sheet or CSV output", () => {
  assert.equal(safeSheetValue("=IMPORTXML(1)"), "'=IMPORTXML(1)");
  assert.equal(sheetRow(card, { capturedByName: "Fake Capturer" }).includes("'=unsafe"), true);
});

test("unapproved configuration refuses any sheet other than the Vision71 test sheet", () => {
  assert.throws(() => createSheetGateway({
    GOOGLE_SHEET_ID: "different-sheet",
    GOOGLE_SHEET_TEST_ID: "vision71-test-sheet",
    GOOGLE_SERVICE_ACCOUNT_EMAIL: "fake@example.test",
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: "fake",
    SHEET_TARGET_APPROVED: "false",
  }), { code: "SHEET_TARGET_REFUSED" });
});

test("Hala Sheet status updates the sender record and writes a reference only audit", async () => {
  const id = new ObjectId();
  const stored = { _id: id, tenantId: "vision71-test", status: "submitted" };
  const audits = [];
  const db = { collection(name) {
    if (name === "cards") return { findOne: async () => stored, updateOne: async (_query, update) => Object.assign(stored, update.$set) };
    if (name === "auditLogs") return { insertOne: async (entry) => { audits.push(entry); } };
    throw new Error(`Unexpected collection ${name}`);
  } };
  const headers = ["Record status", "Reviewer comment", "CardSnap record ID"];
  const gateway = { readAll: async () => [headers, ["Approved", "Reviewed with fake data", String(id)]] };
  const result = await refreshStatusesFromSheet(db, "vision71-test", { gateway, reviewerName: "Hala" });
  assert.equal(result.updated, 1);
  assert.equal(stored.status, "approved");
  assert.equal(stored.reviewedByName, "Hala");
  assert.equal(audits[0].action, "approval");
  assert.equal(JSON.stringify(audits[0]).includes("Reviewed with fake data"), false);
});

test("the required register fields and automatic metadata map to all nineteen columns", () => {
  const enhanced = { ...card, capturedByName: "System Capturer", updatedAt: "2026-10-01T09:00:00Z", obtainedAt: "2026-09-29T10:00:00Z", lastConfirmedAt: "2026-10-01T09:00:00Z", verifiedData: { ...card.verifiedData, meetingContext: { metAtLocation: "Event B", whereMet: "Hall 2" } }, duplicateReview: { state: "pending", reason: "Matching email address" } };
  const row = sheetRow(enhanced);
  const read = field => row[mapping.columns.findIndex(column => column.field === field)];
  assert.equal(row.length, 19);
  assert.equal(mapping.columns.filter(column => !column.hidden).length, 16);
  assert.equal(read("whereMet"), "Hall 2");
  assert.equal(read("capturedByName"), "System Capturer");
  assert.equal(read("capturedAt"), "2026-09-30T10:00:00.000Z");
  assert.equal(read("obtainedAt"), "2026-09-29");
  assert.equal(read("lastConfirmedAt"), "2026-10-01T09:00:00.000Z");
  assert.match(read("duplicateFlag"), /Possible duplicate/);
  assert.equal(read("transferStatus"), "Not transferred");
  assert.equal(read("status"), "Pending Review");
  assert.equal(columnLetter(mapping.columns.length), "S");
  assert.equal(columnLetter(27), "AA");
});

test("updates locate the record ID after sorting instead of overwriting another contact", async () => {
  const db = fakeDb();
  let updatedRow;
  const headers = mapping.columns.map(column => column.header);
  const rows = [headers, sheetRow({ ...card, id: "another-record" }), sheetRow(card)];
  const gateway = { append: async () => 7, update: async row => { updatedRow = row; } };
  await addPendingSheetRecord(db, card, { gateway });
  gateway.readAll = async () => rows;
  await updateSheetRecord(db, card, { gateway });
  assert.equal(updatedRow, 3);
  assert.equal(db.transfers[0].rowNumber, 3);
});

test("an existing Sheet row is recovered without appending a second contact", async () => {
  const db = fakeDb();
  let appends = 0;
  const gateway = { readAll: async () => [mapping.columns.map(column => column.header), sheetRow(card)], append: async () => { appends++; return 3; }, update: async () => {} };
  const result = await addPendingSheetRecord(db, card, { gateway });
  assert.equal(appends, 0);
  assert.equal(result.rowNumber, 2);
  assert.equal(db.transfers[0].rowNumber, 2);
});

test("invalid credential files report a safe error without exposing a path or key", () => {
  assert.throws(() => createSheetGateway({ GOOGLE_SHEET_ID: "fake", GOOGLE_SHEET_TEST_ID: "fake", GOOGLE_SERVICE_ACCOUNT_KEY_FILE: "missing-private-credential-file.json" }), error => error.code === "SHEET_CREDENTIALS_INVALID" && !error.message.includes("missing-private"));
});

test("Sheet review fills confirmation timestamps and reviewer metadata automatically", async () => {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const stored = { _id: new ObjectId(), tenantId: card.tenantId, status: "submitted", createdAt: new Date(card.createdAt), updatedAt: new Date(card.createdAt), capturedBy: new ObjectId(), capturedByName: "System Capturer", payload: encryptValue({ verifiedData: card.verifiedData }) };
  let automatic;
  const db = { collection(name) {
    if (name === "cards") return { findOne: async () => stored, updateOne: async (_query, update) => Object.assign(stored, update.$set) };
    if (name === "users") return { find: () => ({ toArray: async () => [] }) };
    if (name === "auditLogs") return { insertOne: async () => {} };
    throw new Error("Unexpected collection");
  } };
  const gateway = { readAll: async () => [mapping.columns.map(column => column.header), sheetRow({ ...card, id: String(stored._id), status: "approved" })], updateAutomatic: async (rowNumber, record) => { automatic = { rowNumber, record }; } };
  await refreshStatusesFromSheet(db, card.tenantId, { gateway, reviewerName: "Fictional Reviewer" });
  assert.equal(automatic.rowNumber, 2);
  assert.equal(automatic.record.status, "approved");
  assert.equal(automatic.record.reviewedByName, "Fictional Reviewer");
  assert.notEqual(automatic.record.lastConfirmedAt, card.createdAt);
});

test("Sheet approval cannot bypass pending duplicate review or reopen a closed duplicate", async () => {
  for (const duplicateReview of [{ state: "pending" }, { state: "resolved", decision: "retain_existing" }]) {
    const _id = new ObjectId();
    const card = { _id, tenantId: "fake-duplicate-sheet", status: duplicateReview.state === "pending" ? "submitted" : "rejected", duplicateReview };
    let writes = 0;
    const db = { collection: () => ({ findOne: async () => card, updateOne: async () => { writes++; } }) };
    const gateway = { readAll: async () => [["Record status", "CardSnap record ID"], ["Approved", String(_id)]] };
    const result = await refreshStatusesFromSheet(db, card.tenantId, { gateway });
    assert.equal(result.updated, 0);
    assert.equal(writes, 0);
  }
});
