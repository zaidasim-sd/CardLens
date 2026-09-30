import { GoogleAuth } from "google-auth-library";
import { ObjectId } from "mongodb";
import mapping from "../../config/sheetMapping.json" with { type: "json" };

export function safeSheetValue(value) {
  const text = String(value ?? "");
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

export function sheetRow(card, people = {}) {
  const data = card.verifiedData || {};
  const values = {
    event: data.meetingContext?.metAtLocation || "",
    fullName: data.fullName || "",
    companyName: data.companyName || "",
    jobTitle: data.jobTitle || "",
    email: data.email || "",
    phone: data.phone || "",
    notes: data.notes || "",
    capturedAt: card.createdAt || "",
    capturedByName: people.capturedByName || "",
    status: card.status === "submitted" ? "Pending Review" : card.status,
    reviewedByName: people.reviewedByName || "",
    reviewedAt: card.reviewedAt || "",
    transferStatus: card.transferStatus || "not_started",
    reviewerComment: card.reviewerComment || "",
    recordId: card.id,
  };
  return mapping.columns.map((column) => safeSheetValue(values[column.field]));
}

function config(env) {
  const sheetId = env.GOOGLE_SHEET_ID || env.GOOGLE_SHEET_TEST_ID;
  if (!sheetId || !env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) return null;
  if (env.SHEET_TARGET_APPROVED !== "true" && sheetId !== env.GOOGLE_SHEET_TEST_ID) {
    throw Object.assign(new Error("Sheet target is not approved"), { code: "SHEET_TARGET_REFUSED", status: 403 });
  }
  return { sheetId, tab: env.GOOGLE_SHEET_TAB || "Contacts", tabId: Number(env.GOOGLE_SHEET_TAB_ID || 0) };
}

async function accessToken(env) {
  const auth = new GoogleAuth({
    credentials: {
      client_email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return auth.getAccessToken();
}

async function googleRequest(env, url, options = {}, fetcher = fetch) {
  const token = await accessToken(env);
  const response = await fetcher(url, { ...options, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...options.headers } });
  if (!response.ok) throw Object.assign(new Error("Sheet request failed"), { code: "SHEET_REQUEST_FAILED", status: 502 });
  return response.status === 204 ? {} : response.json();
}

export function createSheetGateway(env = process.env, fetcher = fetch) {
  const selected = config(env);
  if (!selected) return null;
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(selected.sheetId)}`;
  return {
    async configure() {
      const headers = mapping.columns.map((column) => column.header);
      const range = encodeURIComponent(`${selected.tab}!A1:O1`);
      await googleRequest(env, `${base}/values/${range}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: [headers] }) }, fetcher);
      const statusColumn = headers.indexOf("Record status");
      await googleRequest(env, `${base}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: [
        { setDataValidation: { range: { sheetId: selected.tabId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: statusColumn, endColumnIndex: statusColumn + 1 }, rule: { condition: { type: "ONE_OF_LIST", values: ["Pending Review", "Approved", "Return for Correction", "Rejected"].map((userEnteredValue) => ({ userEnteredValue })) }, strict: true, showCustomUi: true } } },
        { setBasicFilter: { filter: { range: { sheetId: selected.tabId, startRowIndex: 0, endRowIndex: 1000, startColumnIndex: 0, endColumnIndex: headers.length } } } },
      ] }) }, fetcher);
      return { columns: headers.length };
    },
    async append(row) {
      const range = encodeURIComponent(`${selected.tab}!A:O`);
      const result = await googleRequest(env, `${base}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: "POST", body: JSON.stringify({ values: [row] }) }, fetcher);
      const updatedRange = result.updates?.updatedRange || "";
      const rowNumber = Number(updatedRange.match(/!(?:[A-Z]+)(\d+):/)?.[1]);
      if (!rowNumber) throw Object.assign(new Error("Sheet row was not confirmed"), { code: "SHEET_RESULT_INVALID", status: 502 });
      return rowNumber;
    },
    async update(rowNumber, row) {
      const range = encodeURIComponent(`${selected.tab}!A${rowNumber}:O${rowNumber}`);
      await googleRequest(env, `${base}/values/${range}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: [row] }) }, fetcher);
    },
    async readAll() {
      const range = encodeURIComponent(`${selected.tab}!A:O`);
      return (await googleRequest(env, `${base}/values/${range}`, {}, fetcher)).values || [];
    },
    async remove(rowNumber) {
      await googleRequest(env, `${base}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId: selected.tabId, dimension: "ROWS", startIndex: rowNumber - 1, endIndex: rowNumber } } }] }) }, fetcher);
    },
  };
}

const SHEET_TO_RECORD_STATUS = new Map([
  ["Pending Review", "submitted"],
  ["Approved", "approved"],
  ["Return for Correction", "correction_requested"],
  ["Rejected", "rejected"],
]);

export async function refreshStatusesFromSheet(db, tenantId, options = {}) {
  const gateway = options.gateway === undefined ? createSheetGateway(options.env) : options.gateway;
  if (!gateway) return { skipped: true, updated: 0 };
  const rows = await gateway.readAll();
  if (rows.length < 2) return { updated: 0 };
  const headers = rows[0];
  const statusIndex = headers.indexOf("Record status");
  const commentIndex = headers.indexOf("Reviewer comment");
  const idIndex = headers.indexOf("CardSnap record ID");
  if (statusIndex < 0 || idIndex < 0) throw Object.assign(new Error("Sheet columns are invalid"), { code: "SHEET_COLUMNS_INVALID", status: 502 });
  let updated = 0;
  for (const row of rows.slice(1)) {
    const nextStatus = SHEET_TO_RECORD_STATUS.get(String(row[statusIndex] || "").trim());
    const id = String(row[idIndex] || "").trim();
    if (!nextStatus || !id) continue;
    if (!ObjectId.isValid(id)) continue;
    const _id = new ObjectId(id);
    const card = await db.collection("cards").findOne({ _id, tenantId });
    if (!card || card.status === nextStatus) continue;
    const now = new Date();
    const update = { status: nextStatus, updatedAt: now, reviewerComment: commentIndex >= 0 ? String(row[commentIndex] || "") : "" };
    if (nextStatus !== "submitted") { update.reviewedAt = now; update.reviewedByName = options.reviewerName || process.env.SHEET_REVIEWER_NAME || "Hala"; }
    await db.collection("cards").updateOne({ _id, tenantId }, { $set: update });
    const action = nextStatus === "approved" ? "approval" : nextStatus === "rejected" ? "rejection" : nextStatus === "correction_requested" ? "correction" : "review";
    if (nextStatus !== "submitted") await (await import("../audit/service.js")).writeAudit(db, { tenantId, actor: { id: "sheet_reviewer", role: "aventure_reviewer" }, action, recordRef: _id, outcome: "success", now });
    updated += 1;
  }
  return { updated };
}

async function names(db, card) {
  const ids = [card.capturedBy, card.reviewedBy].filter(Boolean).map((id) => typeof id === "string" ? id : String(id));
  const users = ids.length ? await db.collection("users").find({ tenantId: card.tenantId, $expr: { $in: [{ $toString: "$_id" }, ids] } }, { projection: { name: 1 } }).toArray() : [];
  const byId = new Map(users.map((user) => [String(user._id), user.name]));
  return { capturedByName: byId.get(String(card.capturedBy)) || "", reviewedByName: byId.get(String(card.reviewedBy)) || "" };
}

export async function addPendingSheetRecord(db, card, options = {}) {
  const gateway = options.gateway === undefined ? createSheetGateway(options.env) : options.gateway;
  if (!gateway) return { skipped: true };
  const existing = await db.collection("transfers").findOne({ tenantId: card.tenantId, cardId: card.id, provider: "google_sheets" });
  if (existing?.rowNumber) return existing;
  const rowNumber = await gateway.append(sheetRow(card, options.people || await names(db, card)));
  const transfer = { tenantId: card.tenantId, cardId: card.id, provider: "google_sheets", rowNumber, status: "pending", createdAt: new Date() };
  await db.collection("transfers").updateOne({ tenantId: card.tenantId, cardId: card.id, provider: "google_sheets" }, { $setOnInsert: transfer }, { upsert: true });
  return transfer;
}

export async function updateSheetRecord(db, card, options = {}) {
  const gateway = options.gateway === undefined ? createSheetGateway(options.env) : options.gateway;
  if (!gateway) return { skipped: true };
  const transfer = await db.collection("transfers").findOne({ tenantId: card.tenantId, cardId: card.id, provider: "google_sheets" });
  if (!transfer?.rowNumber) return addPendingSheetRecord(db, card, options);
  await gateway.update(transfer.rowNumber, sheetRow(card, options.people || await names(db, card)));
  await db.collection("transfers").updateOne({ _id: transfer._id }, { $set: { status: card.status, updatedAt: new Date() } });
  return { ...transfer, status: card.status };
}

export async function removeSheetRecord(db, card, options = {}) {
  const gateway = options.gateway === undefined ? createSheetGateway(options.env) : options.gateway;
  if (!gateway) return { skipped: true };
  const transfer = await db.collection("transfers").findOne({ tenantId: card.tenantId, cardId: card.id, provider: "google_sheets" });
  if (!transfer?.rowNumber || transfer.status === "removed") return transfer || { skipped: true };
  await gateway.remove(transfer.rowNumber);
  await db.collection("transfers").updateOne({ _id: transfer._id }, { $set: { status: "removed", removedAt: new Date() } });
  await db.collection("transfers").updateMany(
    { tenantId: card.tenantId, provider: "google_sheets", status: { $ne: "removed" }, rowNumber: { $gt: transfer.rowNumber } },
    { $inc: { rowNumber: -1 } },
  );
  return { ...transfer, status: "removed" };
}
