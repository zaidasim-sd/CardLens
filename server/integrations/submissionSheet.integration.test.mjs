import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { MongoClient, ObjectId } from "mongodb";
import { GoogleAuth } from "google-auth-library";
import { pilot } from "../pilot.js";
import { createCard } from "../cards/service.js";
import { createSheetGateway, syncContactSheet, synchronizePilotSheet, refreshStatusesFromSheet } from "./sheetService.js";

const headings = ["CardSnap record ID", "Place/Exhibition", "Contact Name", "Company Name", "Job Title", "Email Address", "Phone Number", "Short Notes", "Date Captured", "Time(GMT-4)", "Captured By"];
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
const env = { GOOGLE_SHEET_ID: "fake-submission-sheet", GOOGLE_SHEET_TEST_ID: "fake-submission-sheet", GOOGLE_SHEET_TAB: "Sheet1", GOOGLE_SHEET_HEADER_ROW: "2", GOOGLE_SERVICE_ACCOUNT_EMAIL: "fixture@example.test", GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: privateKey };

test("client Sheet defaults to row-1 headings and appends records from row 2", async () => {
  const originalToken = GoogleAuth.prototype.getAccessToken;
  GoogleAuth.prototype.getAccessToken = async () => "fake-token";
  const { GOOGLE_SHEET_HEADER_ROW: _oldHeaderRow, ...rowOneEnv } = env;
  try {
    const rows = [[...headings]];
    const gateway = createSheetGateway(rowOneEnv, async (url, options = {}) => {
      if (!options.method) {
        assert.ok(decodeURIComponent(url).includes("!A1:ZZ"));
        return Response.json({ values: structuredClone(rows) });
      }
      assert.ok(url.includes(":append?"));
      rows.push(JSON.parse(options.body).values[0]);
      return Response.json({ updates: { updatedRange: "'Sheet1'!A2:K2" } });
    });
    assert.equal(gateway.headerRow, 1);
    const canonical = ["Exhibition", "", "Demo Contact", "Demo Company", "Role", "demo@example.test", "", "", "2026-10-03T12:00:00Z", "", "", "Capturer", "Pending Review", "", "", "", String(new ObjectId())];
    assert.equal(await gateway.append(canonical), 2);
    assert.deepEqual(rows[0], headings);
    assert.equal(rows[1][2], "Demo Contact");
    assert.equal(rows[1][9], "08:00:00");
  } finally { GoogleAuth.prototype.getAccessToken = originalToken; }
});

test("submission-only delivery uses row-2 headings, preserves client layout and retries by stable ID", async () => {
  assert.equal(pilot.submissionOnlyEnabled, true);
  const client = new MongoClient(process.env.MONGODB_URI);
  const tenantId = `submission_test_${new ObjectId()}`;
  const originalToken = GoogleAuth.prototype.getAccessToken;
  GoogleAuth.prototype.getAccessToken = async () => "fake-token";
  let db;
  const rows = [["Existing merged section title"], [...headings], ["Existing client note"]];
  const calls = [];
  const fetcher = async (url, options = {}) => {
    calls.push({ url, options });
    if (!options.method && url.includes("/values/")) {
      assert.ok(decodeURIComponent(url).includes("!A2:ZZ"));
      return Response.json({ values: structuredClone(rows.slice(1)) });
    }
    if (url.includes(":append?")) {
      rows.push(JSON.parse(options.body).values[0]);
      return Response.json({ updates: { updatedRange: `'Sheet1'!A${rows.length}:K${rows.length}` } });
    }
    if (url.endsWith("/values:batchUpdate")) {
      for (const item of JSON.parse(options.body).data) {
        const [, letters, number] = item.range.match(/!([A-Z]+)(\d+)$/);
        const index = [...letters].reduce((n, letter) => n * 26 + letter.charCodeAt(0) - 64, 0) - 1;
        rows[Number(number) - 1][index] = item.values[0][0];
      }
      return Response.json({});
    }
    throw new Error("Unexpected schema or status operation");
  };
  try {
    await client.connect();
    db = client.db(process.env.MONGODB_TEST_DB || "cardsnap_step1_test");
    assert.match(db.databaseName, /test/i);
    const gateway = createSheetGateway(env, fetcher);
    const capturer = { id: String(new ObjectId()), tenantId, role: "exhibition_assistant", name: "Demo Capturer" };
    const contact = await createCard(db, capturer, { source: "manual", verifiedData: { fullName: "Example Person", companyName: "Example Company", email: "example@fixture.test", notes: "=unsafe formula", meetingContext: { metAtLocation: "Demo Exhibition" } } }, new Date("2026-10-03T02:30:00Z"), { sheet: { gateway, env } });
    assert.equal(contact.sheetStatus, "submitted");
    assert.equal(rows.length, 4);
    assert.deepEqual(rows[0], ["Existing merged section title"]);
    assert.deepEqual(rows[1], headings);
    assert.deepEqual(rows[2], ["Existing client note"]);
    assert.equal(rows[3][0], contact.id);
    assert.equal(rows[3][1], "Demo Exhibition");
    assert.equal(rows[3][7], "'=unsafe formula");
    assert.equal(rows[3][8], "2026-10-02");
    assert.equal(rows[3][9], "22:30:00");
    assert.equal(rows[3][10], "Demo Capturer");
    // Simulate a sorted Sheet, then retry the same contact. Update actual physical
    // row 3 (not 2 or a stale transfer row number) and preserve existing client data.
    [rows[2], rows[3]] = [rows[3], rows[2]];
    await syncContactSheet(db, contact, { gateway, env });
    assert.equal(rows.length, 4);
    assert.equal(rows[2][0], contact.id);
    assert.deepEqual(rows[3], ["Existing client note"]);
    assert.equal(rows.filter(row => row[0] === contact.id).length, 1);
    assert.equal(calls.filter(call => call.url.includes(":append?")).length, 1);
    assert.equal(await db.collection("transfers").countDocuments({ tenantId, provider: "constant_contact" }), 0);
    assert.equal(await db.collection("cards").countDocuments({ tenantId, sheetWritePending: true }), 0);
    assert.deepEqual(await synchronizePilotSheet(db, tenantId, { gateway }), { skipped: true });
    assert.deepEqual(await refreshStatusesFromSheet(db, tenantId, { gateway }), { skipped: true, updated: 0 });
    assert.equal(await db.collection("settings").countDocuments({ tenantId, key: "pilot_sheet_sync" }), 0);
    await assert.rejects(gateway.configure(), { code: "SHEET_CONFIGURATION_DISABLED" });
    rows.push([...rows[2]]);
    await assert.rejects(gateway.readAll(), { code: "SHEET_COLUMNS_INVALID" });
  } finally {
    GoogleAuth.prototype.getAccessToken = originalToken;
    if (db) for (const name of ["cards", "transfers", "auditLogs", "settings"]) await db.collection(name).deleteMany({ tenantId });
    await client.close();
  }
});
