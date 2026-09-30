import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { ObjectId } from "mongodb";
import { encryptValue } from "../security/encryption.js";
import { exportApprovedCsv, safeCsv } from "./service.js";

test("approved CSV values cannot execute spreadsheet formulas", () => {
  assert.equal(safeCsv("=IMPORTXML(1)"), '"\'=IMPORTXML(1)"');
  assert.equal(safeCsv("+123"), '"\'+123"');
  assert.equal(safeCsv("Fake Contact"), '"Fake Contact"');
});

test("CSV export contains approved rows only and logs the export", async () => {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const actor = { id: new ObjectId().toString(), tenantId: "vision71-test", role: "vision71_administrator" };
  const capturerId = new ObjectId();
  const approved = { _id: new ObjectId(), tenantId: actor.tenantId, status: "approved", capturedBy: capturerId, createdAt: new Date("2026-09-30T10:00:00Z"), reviewedAt: new Date("2026-09-30T10:05:00Z"), reviewedByName: "Hala", payload: encryptValue({ verifiedData: { fullName: "Fake Approved", email: "approved@example.test", meetingContext: { metAtLocation: "Test Expo" } } }) };
  const rejected = { ...approved, _id: new ObjectId(), status: "rejected", payload: encryptValue({ verifiedData: { fullName: "Fake Rejected", email: "rejected@example.test" } }) };
  const audits = [];
  const db = { collection(name) {
    if (name === "cards") return { find: (query) => ({ sort: () => ({ toArray: async () => [approved, rejected].filter((card) => card.status === query.status) }) }) };
    if (name === "users") return { find: () => ({ toArray: async () => [{ _id: capturerId, name: "Fake Capturer" }] }) };
    if (name === "auditLogs") return { insertOne: async (entry) => audits.push(entry) };
    throw new Error(`Unexpected collection ${name}`);
  } };
  const result = await exportApprovedCsv(db, actor, { sheet: { gateway: null } });
  assert.equal(result.count, 1);
  assert.equal(result.csv.includes("Fake Approved"), true);
  assert.equal(result.csv.includes("Fake Rejected"), false);
  assert.equal(audits[0].action, "export");
});
