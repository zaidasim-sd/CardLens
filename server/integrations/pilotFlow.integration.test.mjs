import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, generateKeyPairSync } from "node:crypto";
import { MongoClient, ObjectId } from "mongodb";
import { GoogleAuth } from "google-auth-library";
import { pilot, requirePilotRole } from "../pilot.js";
// Regression coverage for the preserved Sheet-review pilot in this isolated process.
pilot.submissionOnlyEnabled = false;
import { can } from "../auth/permissions.js";
import { createUser } from "../auth/service.js";
import { ensureDatabaseIndexes } from "../db.js";
import { createCard, updateCard, getCard } from "../cards/service.js";
import { approvalTransfer, transferApproved, processTransfers } from "./constantContact.js";
import constantContactHandler from "../http/constantContactHandler.js";
import { createSheetGateway, pilotHeaders, sheetField, sheetRow, validatePilotHeaders, refreshStatusesFromSheet, syncContactSheet, synchronizePilotSheet } from "./sheetService.js";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
const env = { GOOGLE_SHEET_ID: "fake-pilot-register", GOOGLE_SHEET_TEST_ID: "fake-pilot-register", GOOGLE_SHEET_TAB: "Trade Shows", GOOGLE_SERVICE_ACCOUNT_EMAIL: "fixture@example.test", GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: privateKey };

// Google API simulator exercises real gateway header alignment/configuration/write requests.
// No test in this file sends contacts or credentials to Google/Constant Contact.
function sheetFixture(initial = []) {
  let rows = structuredClone(initial);
  const calls = [];
  const fetcher = async (url, options = {}) => {
    calls.push({ url, options });
    const decoded = decodeURIComponent(url);
    if (url.includes("?fields=")) return Response.json({ sheets: [{ properties: { title: env.GOOGLE_SHEET_TAB, sheetId: 71 }, protectedRanges: [] }] });
    if (url.endsWith(":batchUpdate") && !url.includes("/values")) return Response.json({});
    if (url.endsWith("/values:batchUpdate")) {
      for (const item of JSON.parse(options.body).data) {
        const [, letters, rowNumber] = item.range.match(/!([A-Z]+)(\d+)$/);
        const index = [...letters].reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
        rows[Number(rowNumber) - 1][index] = item.values[0][0];
      }
      return Response.json({});
    }
    if (url.includes(":append?")) {
      rows.push(JSON.parse(options.body).values[0]);
      return Response.json({ updates: { updatedRange: `'Trade Shows'!A${rows.length}:M${rows.length}` } });
    }
    if (options.method === "PUT" && decoded.includes("!A1:")) { rows[0] = JSON.parse(options.body).values[0]; return Response.json({}); }
    if (!options.method && url.includes("/values/")) return Response.json({ values: structuredClone(rows) });
    throw new Error(`Unexpected simulated request ${decoded}`);
  };
  return { gateway: createSheetGateway(env, fetcher), calls, rows: () => rows,
    set(id, field, value) {
      const headers = rows[0];
      const row = rows.find((row, index) => index > 0 && row[headers.findIndex(header => sheetField(header) === "recordId")] === id);
      row[headers.findIndex(header => sheetField(header) === field)] = value;
    },
  };
}

test("pilot disables internal reviewers, admin approval, and every Constant Contact entry point", async () => {
  assert.equal(pilot.internalReviewEnabled, false);
  assert.equal(pilot.constantContactEnabled, false);
  assert.equal(can("aventure_reviewer", "view_review_queue"), false);
  assert.equal(can("vision71_administrator", "approve_card"), false);
  assert.equal(can("vision71_administrator", "manage_users"), true);
  assert.equal(can("exhibition_assistant", "submit_own_draft"), true);
  assert.throws(() => requirePilotRole("aventure_reviewer"), { code: "ROLE_DISABLED" });
  const never = { collection: () => { throw new Error("Disabled integration accessed storage"); } };
  await assert.rejects(createUser(never, { role: "vision71_administrator" }, { role: "aventure_reviewer" }), { code: "ROLE_DISABLED" });
  await assert.rejects(createCard(never, { id: new ObjectId().toString(), tenantId: "fixture", role: "exhibition_assistant" }, { status: "draft" }), { code: "STATE_INVALID" });
  assert.deepEqual(approvalTransfer({}, {}), {});
  await transferApproved(never, new ObjectId(), "fixture", () => { throw new Error("External call"); });
  assert.equal(await processTransfers(never), 0);
  let status;
  await constantContactHandler({}, { setHeader() {}, status(value) { status = value; return this; }, json(body) { assert.equal(body.code, "FEATURE_DISABLED"); } });
  assert.equal(status, 403);
});

test("pilot configuration keeps reordered legacy data, hides old fields, and adds missing headers", async t => {
  t.mock.method(GoogleAuth.prototype, "getAccessToken", async () => "fake-test-token");
  const fixture = sheetFixture([["Reviewer Comment", "Where Met / Location", "CardSnap record ID", "Record Status"], ["Keep this feedback", "Keep old location", "legacy-id", "Approved"]]);
  const result = await fixture.gateway.configure();
  assert.equal(result.visibleColumns, 12);
  assert.equal(fixture.rows()[1][1], "Keep old location");
  assert.equal(fixture.rows()[0][2], "CardSnap record ID");
  const config = fixture.calls.find(call => call.url.endsWith(":batchUpdate") && !call.url.includes("/values"));
  const requests = JSON.parse(config.options.body).requests;
  assert.deepEqual(requests.find(item => item.setDataValidation).setDataValidation.rule.condition.values.map(item => item.userEnteredValue), ["Pending Review", "Approved", "Needs Correction", "Rejected"]);
  assert.ok(requests.find(item => item.updateDimensionProperties?.range.startIndex === 1 && item.updateDimensionProperties.properties.hiddenByUser));
  assert.equal(requests.find(item => item.setDataValidation).setDataValidation.range.sheetId, 71);
  assert.throws(() => validatePilotHeaders([...pilotHeaders(), "Record ID"]), { code: "SHEET_COLUMNS_INVALID" });
  await fixture.gateway.readAll();
  await fixture.gateway.update(2, sheetRow({ id: "legacy-id", status: "submitted", capturedByName: "Fixture Capturer", createdAt: new Date(), reviewerComment: "Updated feedback", verifiedData: { fullName: "Updated Name", meetingContext: { metAtLocation: "Fixture Exhibition" } } }));
  assert.equal(fixture.rows()[1][0], "Updated feedback");
  assert.equal(fixture.rows()[1][1], "Keep old location");
  assert.equal(fixture.rows()[1][2], "legacy-id");
  assert.equal(fixture.rows()[1][3], "Pending Review");
  fixture.rows().push([...fixture.rows()[1]]);
  await assert.rejects(fixture.gateway.readAll(), { code: "SHEET_COLUMNS_INVALID" });
});

test("full pilot: submission, Google insertion, Sheet reviews/comments, resubmission, reordered rows and retries", { skip: !process.env.MONGODB_URI }, async t => {
  t.mock.method(GoogleAuth.prototype, "getAccessToken", async () => "fake-test-token");
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const databaseName = process.env.MONGODB_TEST_DB || "cardsnap_step1_test";
  assert.match(databaseName, /test/i, "Only an explicitly named test database may receive fixtures");
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  const db = client.db(databaseName);
  const tenantId = `fake_lead71_pilot_${new ObjectId()}`;
  t.after(async () => {
    for (const name of ["cards", "users", "settings", "transfers", "auditLogs"]) await db.collection(name).deleteMany({ tenantId });
    await client.close();
  });
  await ensureDatabaseIndexes(db);
  const capturer = { id: new ObjectId().toString(), name: "Fictional Capturer", tenantId, role: "exhibition_assistant" };
  const fixture = sheetFixture();
  await fixture.gateway.configure();
  const sheet = { gateway: fixture.gateway, env };
  const options = { sheet };
  const data = { fullName: "Fictional Contact", companyName: "Fixture Company", jobTitle: "Test Role", email: "fictional@example.test", phone: "+44 7700 900123", notes: "Fixture only", meetingContext: { metAtLocation: "Fixture Trade Show" } };
  const record = await createCard(db, capturer, { verifiedData: data, source: "manual", status: "submitted" }, new Date(), options);
  const column = field => fixture.rows()[0].findIndex(header => sheetField(header) === field);
  const currentRow = () => fixture.rows().find(row => row[column("recordId")] === record.id);
  assert.equal(record.status, "submitted");
  assert.equal(record.sheetStatus, "submitted");
  assert.equal(currentRow()[column("status")], "Pending Review");
  assert.equal(currentRow()[column("capturedByName")], "Fictional Capturer");
  assert.ok(currentRow()[column("capturedAt")]);
  fixture.set(record.id, "status", "Approved");
  // Old successful inserts stored sheetStatus=pending. Do not resend them over Sheet review.
  await db.collection("cards").updateOne({ _id: new ObjectId(record.id), tenantId }, { $set: { sheetStatus: "pending" } });
  await synchronizePilotSheet(db, tenantId, sheet);
  assert.equal(currentRow()[column("status")], "Approved");
  assert.equal((await getCard(db, capturer, record.id)).status, "approved");
  fixture.set(record.id, "reviewerComment", "Comment added without changing status");
  await refreshStatusesFromSheet(db, tenantId, sheet);
  assert.equal((await getCard(db, capturer, record.id)).reviewerComment, "Comment added without changing status");
  fixture.set(record.id, "status", "Needs Correction");
  fixture.set(record.id, "reviewerComment", "Please correct the job title");
  await refreshStatusesFromSheet(db, tenantId, sheet);
  const returned = await getCard(db, capturer, record.id);
  assert.equal(returned.status, "correction_requested");
  assert.equal(returned.reviewerComment, "Please correct the job title");
  // Reorder Sheet rows before resubmitting. An unrelated row must not be overwritten.
  const unrelated = new Array(fixture.rows()[0].length).fill("");
  unrelated[column("recordId")] = new ObjectId().toString();
  unrelated[column("fullName")] = "Unrelated Sheet contact";
  fixture.rows().splice(1, 0, unrelated);
  const appendsBefore = fixture.calls.filter(call => call.url.includes(":append?")).length;
  const edited = await updateCard(db, capturer, record.id, { verifiedData: { ...data, jobTitle: "Corrected role" }, status: "submitted" }, new Date(), options);
  assert.equal(edited.status, "submitted");
  assert.equal(currentRow()[column("status")], "Pending Review");
  assert.equal(currentRow()[column("jobTitle")], "Corrected role");
  assert.equal(fixture.rows()[1][column("fullName")], "Unrelated Sheet contact");
  assert.equal(fixture.calls.filter(call => call.url.includes(":append?")).length, appendsBefore);
  fixture.set(record.id, "status", "Rejected");
  await refreshStatusesFromSheet(db, tenantId, sheet);
  assert.equal((await getCard(db, capturer, record.id)).status, "rejected");
  fixture.set(record.id, "reviewerComment", "");
  await refreshStatusesFromSheet(db, tenantId, sheet);
  assert.equal((await getCard(db, capturer, record.id)).reviewerComment, "");
  await assert.rejects(updateCard(db, { ...capturer, role: "vision71_administrator" }, record.id, { status: "approved" }), { code: "FORBIDDEN" });
  fixture.set(record.id, "status", "Approved");
  await refreshStatusesFromSheet(db, tenantId, sheet);
  const duplicate = await createCard(db, capturer, { verifiedData: data, status: "submitted", allowDuplicate: true }, new Date(), options);
  assert.equal(duplicate.duplicateReview.state, "pending");
  fixture.set(duplicate.id, "status", "Approved");
  await refreshStatusesFromSheet(db, tenantId, sheet);
  assert.equal((await getCard(db, capturer, duplicate.id)).status, "approved", "Duplicate flag must not block Sheet review");
  // Google accepted an insertion but the response was lost. Retry must recover by ID.
  const uncertainGateway = { ...fixture.gateway, async append(row) { await fixture.gateway.append(row); throw new Error("simulated lost response"); } };
  const uncertain = await createCard(db, capturer, { verifiedData: { ...data, email: "retry@example.test", fullName: "Retry Fixture", companyName: "Other", phone: "" }, status: "submitted" }, new Date(), { sheet: { ...sheet, gateway: uncertainGateway } });
  assert.equal(uncertain.sheetStatus, "failed");
  const rowCount = fixture.rows().length;
  await synchronizePilotSheet(db, tenantId, { ...sheet, now: new Date(Date.now() + 31000) });
  assert.equal(fixture.rows().length, rowCount);
  assert.equal((await getCard(db, capturer, uncertain.id)).sheetStatus, "submitted");
  const checks = fixture.calls.length;
  await synchronizePilotSheet(db, tenantId, sheet);
  assert.equal(fixture.calls.length, checks, "Tenant lease throttles checks within 30s");
  // Concurrent resends of the same durable record are serialized across server instances.
  const current = await getCard(db, capturer, uncertain.id);
  const results = await Promise.allSettled([syncContactSheet(db, current, sheet), syncContactSheet(db, current, sheet)]);
  assert.ok(results.some(result => result.status === "fulfilled"));
  assert.equal(fixture.rows().length, rowCount);
  assert.equal(await db.collection("cards").countDocuments({ tenantId, ccApproval: { $exists: true } }), 0);
});
