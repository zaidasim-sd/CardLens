import assert from "node:assert/strict";
import test from "node:test";
import { ObjectId } from "mongodb";
import { addPendingSheetRecord, createSheetGateway, refreshStatusesFromSheet, safeSheetValue, sheetRow, updateSheetRecord } from "./sheetService.js";

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
  assert.equal(updated.row.includes("approved"), true);
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
