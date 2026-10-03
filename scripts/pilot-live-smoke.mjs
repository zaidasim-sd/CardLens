import "./bootstrap-tests.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { GoogleAuth } from "google-auth-library";
import { MongoClient, ObjectId } from "mongodb";
import { createSheetGateway, normalizeGooglePrivateKey, refreshStatusesFromSheet, sheetField, sheetRow } from "../server/integrations/sheetService.js";
import { createCard, getCard, updateCard } from "../server/cards/service.js";
import { ensureDatabaseIndexes } from "../server/db.js";
import { pilot } from "../server/pilot.js";
// This smoke test intentionally exercises the preserved Sheet-review workflow.
pilot.submissionOnlyEnabled = false;

// Explicit opt-in only. Uses a newly created scratch tab in GOOGLE_SHEET_TEST_ID,
// a test database, and fictional contacts. Removes only its own temporary fixtures.
assert.equal(process.env.RUN_LIVE_PILOT_TEST, "true", "Set RUN_LIVE_PILOT_TEST=true to run this smoke test");
assert.ok(process.env.GOOGLE_SHEET_TEST_ID, "A dedicated GOOGLE_SHEET_TEST_ID is required");
const databaseName = process.env.MONGODB_TEST_DB || "cardsnap_step1_test";
assert.match(databaseName, /test/i);
assert.equal(pilot.internalReviewEnabled, false);
assert.equal(pilot.constantContactEnabled, false);
const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE
  ? JSON.parse(readFileSync(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE, "utf8"))
  : { client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, private_key: normalizeGooglePrivateKey(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) };
const auth = new GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(process.env.GOOGLE_SHEET_TEST_ID)}`;
const google = async (path, method, body) => {
  const response = await fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${await auth.getAccessToken()}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Live Google request failed (${response.status})`);
  return response.json();
};
const tenantId = `fake_live_pilot_${new ObjectId()}`;
const tab = `Lead71 smoke ${new ObjectId()}`;
const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
let db;
let tabId;
try {
  await client.connect();
  db = client.db(databaseName);
  await ensureDatabaseIndexes(db);
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const created = await google(":batchUpdate", "POST", { requests: [{ addSheet: { properties: { title: tab } } }] });
  tabId = created.replies[0].addSheet.properties.sheetId;
  const env = { ...process.env, GOOGLE_SHEET_ID: process.env.GOOGLE_SHEET_TEST_ID, GOOGLE_SHEET_TAB: tab };
  const gateway = createSheetGateway(env);
  await gateway.configure();
  const sheet = { gateway, env };
  const capturer = { id: new ObjectId().toString(), name: "Fictional Live Test Capturer", role: "exhibition_assistant", tenantId };
  const data = { fullName: "Fictional Live Test", companyName: "Example Test Company", jobTitle: "Test Role", email: "pilot-fixture@example.test", phone: "", notes: "Temporary automated test fixture", meetingContext: { metAtLocation: "Test Exhibition" } };
  let card = await createCard(db, capturer, { verifiedData: data, source: "manual", status: "submitted" }, new Date(), { sheet });
  assert.equal(card.sheetStatus, "submitted");
  let rows = await gateway.readAll();
  const index = field => rows[0].findIndex(header => sheetField(header) === field);
  assert.equal(rows[1][index("status")], "Pending Review");
  assert.equal(rows[1][index("recordId")], card.id);
  console.log("PASS: real Google insertion and Pending Review default");
  const sheetReview = async (status, reviewerComment) => {
    await gateway.update(2, sheetRow({ ...card, status, reviewerComment }));
    await refreshStatusesFromSheet(db, tenantId, sheet);
    card = await getCard(db, capturer, card.id);
    assert.equal(card.status, status);
    assert.equal(card.reviewerComment, reviewerComment);
  };
  await sheetReview("approved", "Approved in live test");
  await sheetReview("correction_requested", "Please update the job title");
  console.log("PASS: Approved, Needs Correction and Reviewer Comment synchronize to MongoDB");
  card = await updateCard(db, capturer, card.id, { verifiedData: { ...data, jobTitle: "Corrected Test Role" }, status: "submitted" }, new Date(), { sheet });
  rows = await gateway.readAll();
  assert.equal(rows.length, 2);
  assert.equal(rows[1][index("status")], "Pending Review");
  assert.equal(rows[1][index("jobTitle")], "Corrected Test Role");
  console.log("PASS: correction/resubmission updates the same Contact ID with no duplicate row");
  await sheetReview("rejected", "Rejected in live test");
  assert.equal(await db.collection("cards").countDocuments({ tenantId }), 1);
  assert.equal(await db.collection("cards").countDocuments({ tenantId, ccApproval: { $exists: true } }), 0);
  console.log("PASS: Rejected remains in history; Constant Contact is not triggered");
} finally {
  // Never delete or modify a pre-existing tab or real customer record.
  if (tabId !== undefined) await google(":batchUpdate", "POST", { requests: [{ deleteSheet: { sheetId: tabId } }] });
  if (db) for (const name of ["cards", "users", "transfers", "auditLogs", "settings"]) await db.collection(name).deleteMany({ tenantId });
  await client.close();
  console.log("Temporary live-test tab and database fixtures cleaned up");
}
