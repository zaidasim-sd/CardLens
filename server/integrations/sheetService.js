import { GoogleAuth } from "google-auth-library";
import { ObjectId } from "mongodb";
import { readFileSync } from "node:fs";
import mapping from "../../config/sheetMapping.json" with { type: "json" };

export function safeSheetValue(value) {
  const text = String(value ?? "");
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

export function sheetRow(card, people = {}) {
  const data = card.verifiedData || {};
  const values = {
    event: data.meetingContext?.metAtLocation || "",
    whereMet: data.meetingContext?.whereMet || "",
    fullName: data.fullName || "",
    companyName: data.companyName || "",
    jobTitle: data.jobTitle || "",
    email: data.email || "",
    phone: data.phone || "",
    notes: data.notes || "",
    capturedAt: timestamp(card.createdAt),
    obtainedAt: calendarDate(card.obtainedAt || card.createdAt),
    lastConfirmedAt: timestamp(card.lastConfirmedAt || card.updatedAt || card.reviewedAt || card.createdAt),
    capturedByName: people.capturedByName || card.capturedByName || "",
    status: { draft: "Draft", submitted: "Pending Review", approved: "Approved", rejected: "Rejected", correction_requested: "Return for Correction", transferred: "Transferred" }[card.status] || card.status,
    reviewedByName: people.reviewedByName || card.reviewedByName || "",
    reviewedAt: timestamp(card.reviewedAt),
    duplicateFlag: card.duplicateReview?.state === "pending" ? `Possible duplicate — ${card.duplicateReview.reason || "review required"}` : card.duplicateReview?.state === "resolved" ? `Resolved — ${card.duplicateReview.decision}` : "No likely match found",
    transferStatus: { not_started: "Not transferred", transferred: "Transferred", failed: "Transfer failed", pending: "Pending transfer", reconciliation_required: "Transfer needs checking", existing_contact: "Existing contact preserved" }[card.transferStatus || "not_started"] || card.transferStatus,
    reviewerComment: card.reviewerComment || "",
    recordId: card.id,
  };
  return mapping.columns.map((column) => safeSheetValue(values[column.field]));
}

function timestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function calendarDate(value) {
  const time = timestamp(value);
  return time ? new Intl.DateTimeFormat("en-CA", { timeZone: process.env.APP_TIME_ZONE || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(time)) : "";
}

export function columnLetter(count) {
  let result = "";
  for (let n = count; n > 0; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + (n - 1) % 26) + result;
  return result;
}

function credentials(env) {
  if (env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE) {
    try {
      const value = JSON.parse(readFileSync(env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE, "utf8"));
      if (value.type !== "service_account" || !value.client_email || !value.private_key) throw new Error();
      return { client_email: value.client_email, private_key: value.private_key };
    } catch { throw Object.assign(new Error("Google service account credential file is missing or invalid."), { code: "SHEET_CREDENTIALS_INVALID", status: 503 }); }
  }
  if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) return null;
  return { client_email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL, private_key: env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, "\n") };
}

function config(env) {
  const sheetId = env.GOOGLE_SHEET_ID || env.GOOGLE_SHEET_TEST_ID;
  if (!sheetId || !credentials(env)) return null;
  if (env.SHEET_TARGET_APPROVED !== "true" && sheetId !== env.GOOGLE_SHEET_TEST_ID) {
    throw Object.assign(new Error("Sheet target is not approved"), { code: "SHEET_TARGET_REFUSED", status: 403 });
  }
  return { sheetId, tab: env.GOOGLE_SHEET_TAB || "Contacts", tabId: Number(env.GOOGLE_SHEET_TAB_ID || 0) };
}

let cachedAuth;
let cachedCredentialIdentity;
async function accessToken(env) {
  const selectedCredentials = credentials(env);
  const identity = `${selectedCredentials.client_email}\0${selectedCredentials.private_key}`;
  if (!cachedAuth || cachedCredentialIdentity !== identity) {
    cachedAuth = new GoogleAuth({ credentials: selectedCredentials, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
    cachedCredentialIdentity = identity;
  }
  try { return await cachedAuth.getAccessToken(); }
  catch { throw Object.assign(new Error("Google Sheet authentication failed. Check the backend credentials."), { code: "SHEET_AUTH_FAILED", status: 503 }); }
}

async function googleRequest(env, url, options = {}, fetcher = fetch) {
  const token = await accessToken(env);
  const response = await fetcher(url, { ...options, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...options.headers } });
  if (!response.ok) throw Object.assign(new Error(`Google Sheet request failed (HTTP ${response.status}).`), { code: "SHEET_REQUEST_FAILED", status: 502 });
  return response.status === 204 ? {} : response.json();
}

export function createSheetGateway(env = process.env, fetcher = fetch) {
  const selected = config(env);
  if (!selected) return null;
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(selected.sheetId)}`;
  const tab = `'${selected.tab.replaceAll("'", "''")}'`;
  const lastColumn = columnLetter(mapping.columns.length);
  return {
    async configure() {
      const headers = mapping.columns.map((column) => column.header);
      const metadata = await googleRequest(env, `${base}?fields=sheets(properties,protectedRanges)`, {}, fetcher);
      const selectedTab = metadata.sheets?.find(sheet => sheet.properties.sheetId === selected.tabId);
      if (!selectedTab || selectedTab.properties.title !== selected.tab) throw Object.assign(new Error("Sheet tab name and ID do not match."), { code: "SHEET_TAB_INVALID", status: 409 });
      const existing = await googleRequest(env, `${base}/values/${encodeURIComponent(`${tab}!A:${lastColumn}`)}`, {}, fetcher);
      // Missing headings can be repaired; conflicting headings or data layouts cannot.
      const headersMatch = existing.values?.[0]?.length <= headers.length && existing.values[0].every((header, index) => !header || header === headers[index]);
      if (existing.values?.some(row => row.some(Boolean)) && !headersMatch) throw Object.assign(new Error("The Sheet already contains a different layout. Use an empty tab or migrate it before configuring."), { code: "SHEET_LAYOUT_CONFLICT", status: 409 });
      const range = encodeURIComponent(`${tab}!A1:${lastColumn}1`);
      await googleRequest(env, `${base}/values/${range}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: [headers] }) }, fetcher);
      const statusColumn = mapping.columns.findIndex(column => column.field === "status");
      const account = credentials(env).client_email;
      const protectionRequests = (selectedTab.protectedRanges || []).filter(item => item.description?.startsWith("CardSnap system:")).map(item => ({ deleteProtectedRange: { protectedRangeId: item.protectedRangeId } }));
      for (const [startColumnIndex, endColumnIndex] of [[8, 12], [14, headers.length]]) protectionRequests.push({ addProtectedRange: { protectedRange: { description: "CardSnap system: automatic fields", range: { sheetId: selected.tabId, startRowIndex: 1, startColumnIndex, endColumnIndex }, warningOnly: false, editors: { users: [account] } } } });
      protectionRequests.push({ addProtectedRange: { protectedRange: { description: "CardSnap system: column headings", range: { sheetId: selected.tabId, startRowIndex: 0, endRowIndex: 1 }, warningOnly: false, editors: { users: [account] } } } });
      await googleRequest(env, `${base}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: [
        { updateSheetProperties: { properties: { sheetId: selected.tabId, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } },
        { setDataValidation: { range: { sheetId: selected.tabId, startRowIndex: 1, startColumnIndex: statusColumn, endColumnIndex: statusColumn + 1 }, rule: { condition: { type: "ONE_OF_LIST", values: ["Pending Review", "Approved", "Return for Correction", "Rejected"].map((userEnteredValue) => ({ userEnteredValue })) }, strict: true, showCustomUi: true } } },
        { setBasicFilter: { filter: { range: { sheetId: selected.tabId, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: headers.length } } } },
        { repeatCell: { range: { sheetId: selected.tabId, startRowIndex: 0, endRowIndex: 1, endColumnIndex: headers.length }, cell: { userEnteredFormat: { backgroundColor: { red: 0.09, green: 0.16, blue: 0.29 }, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }, wrapStrategy: "WRAP" } }, fields: "userEnteredFormat" } },
        { repeatCell: { range: { sheetId: selected.tabId, startRowIndex: 1, endColumnIndex: headers.length }, cell: { userEnteredFormat: { wrapStrategy: "WRAP", verticalAlignment: "TOP" } }, fields: "userEnteredFormat.wrapStrategy,userEnteredFormat.verticalAlignment" } },
        { updateDimensionProperties: { range: { sheetId: selected.tabId, dimension: "ROWS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 48 }, fields: "pixelSize" } },
        { updateDimensionProperties: { range: { sheetId: selected.tabId, dimension: "COLUMNS", startIndex: 0, endIndex: 16 }, properties: { pixelSize: 180 }, fields: "pixelSize" } },
        { updateDimensionProperties: { range: { sheetId: selected.tabId, dimension: "COLUMNS", startIndex: 16, endIndex: headers.length }, properties: { hiddenByUser: true }, fields: "hiddenByUser" } },
        ...protectionRequests,
      ] }) }, fetcher);
      return { columns: headers.length, visibleColumns: mapping.columns.filter(column => !column.hidden).length };
    },
    async append(row) {
      const range = encodeURIComponent(`${tab}!A:${lastColumn}`);
      const result = await googleRequest(env, `${base}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: "POST", body: JSON.stringify({ values: [row] }) }, fetcher);
      const updatedRange = result.updates?.updatedRange || "";
      const rowNumber = Number(updatedRange.match(/!(?:[A-Z]+)(\d+):/)?.[1]);
      if (!rowNumber) throw Object.assign(new Error("Sheet row was not confirmed"), { code: "SHEET_RESULT_INVALID", status: 502 });
      return rowNumber;
    },
    async update(rowNumber, row) {
      const range = encodeURIComponent(`${tab}!A${rowNumber}:${lastColumn}${rowNumber}`);
      await googleRequest(env, `${base}/values/${range}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: [row] }) }, fetcher);
    },
    async updateAutomatic(rowNumber, card, people) {
      const row = sheetRow(card, people);
      const data = mapping.columns.flatMap((column, index) => column.automatic || column.field === "status" ? [{ range: `${tab}!${columnLetter(index + 1)}${rowNumber}`, values: [[row[index]]] }] : []);
      await googleRequest(env, `${base}/values:batchUpdate`, { method: "POST", body: JSON.stringify({ valueInputOption: "RAW", data }) }, fetcher);
    },
    async readAll() {
      const range = encodeURIComponent(`${tab}!A:${lastColumn}`);
      const rows = (await googleRequest(env, `${base}/values/${range}`, {}, fetcher)).values || [];
      if (!rows[0] || !mapping.columns.every((column, index) => rows[0][index] === column.header)) throw Object.assign(new Error("Google Sheet headers do not match the configured register layout."), { code: "SHEET_COLUMNS_INVALID", status: 502 });
      return rows;
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
  const headerIndex = label => headers.findIndex(header => String(header).trim().toLowerCase() === label.toLowerCase());
  const statusIndex = headerIndex("Record Status");
  const commentIndex = headerIndex("Reviewer Comment");
  const idIndex = headerIndex("CardSnap record ID");
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
    const restoreAutomatic = async (storedCard = card) => {
      if (!gateway.updateAutomatic || !storedCard.payload) return;
      const { toPublic } = await import("../cards/service.js");
      const publicCard = toPublic(storedCard);
      await gateway.updateAutomatic(rows.indexOf(row) + 1, publicCard, await names(db, publicCard));
    };
    // A spreadsheet status change cannot bypass an explicit duplicate decision.
    if (card.ccLease > new Date() || card.duplicateReview?.state === "pending") { await restoreAutomatic(); continue; }
    if (card.duplicateReview?.state === "resolved" && card.duplicateReview.decision !== "keep_both" && nextStatus !== "rejected") { await restoreAutomatic(); continue; }
    if (nextStatus === "approved" && card.duplicateKeys && card.duplicateReview?.state !== "resolved") {
      const { matchingCards } = await import("../cards/service.js");
      const { decryptValue } = await import("../security/encryption.js");
      if ((await matchingCards(db, tenantId, decryptValue(card.payload).verifiedData, _id)).length) { await restoreAutomatic(); continue; }
    }
    const now = new Date();
    const update = { status: nextStatus, updatedAt: now, reviewerComment: commentIndex >= 0 ? String(row[commentIndex] || "") : "" };
    update.lastConfirmedAt = now;
    if (nextStatus !== "submitted") { update.reviewedAt = now; update.reviewedByName = options.reviewerName || process.env.SHEET_REVIEWER_NAME || "Hala"; }
    await db.collection("cards").updateOne({ _id, tenantId }, { $set: update });
    await restoreAutomatic({ ...card, ...update });
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
  if (gateway.readAll) {
    const rows = await gateway.readAll();
    const idColumn = rows[0]?.indexOf("CardSnap record ID");
    if (idColumn === undefined || idColumn < 0) throw Object.assign(new Error("The register is missing the CardSnap record ID column."), { code: "SHEET_COLUMNS_INVALID", status: 502 });
    const found = rows.findIndex((row, index) => index > 0 && String(row[idColumn] || "") === card.id);
    if (found > 0) {
      await gateway.update(found + 1, sheetRow(card, options.people || await names(db, card)));
      const recovered = { tenantId: card.tenantId, cardId: card.id, provider: "google_sheets", rowNumber: found + 1, status: card.status, updatedAt: new Date() };
      await db.collection("transfers").updateOne({ tenantId: card.tenantId, cardId: card.id, provider: "google_sheets" }, { $set: recovered }, { upsert: true });
      return recovered;
    }
  } else if (existing?.rowNumber) return existing;
  const rowNumber = await gateway.append(sheetRow(card, options.people || await names(db, card)));
  const transfer = { tenantId: card.tenantId, cardId: card.id, provider: "google_sheets", rowNumber, status: card.status, createdAt: existing?.createdAt || new Date() };
  await db.collection("transfers").updateOne({ tenantId: card.tenantId, cardId: card.id, provider: "google_sheets" }, { $set: transfer }, { upsert: true });
  return transfer;
}

export async function updateSheetRecord(db, card, options = {}) {
  const gateway = options.gateway === undefined ? createSheetGateway(options.env) : options.gateway;
  if (!gateway) return { skipped: true };
  const transfer = await db.collection("transfers").findOne({ tenantId: card.tenantId, cardId: card.id, provider: "google_sheets" });
  if (!transfer?.rowNumber) return addPendingSheetRecord(db, card, { ...options, gateway });
  let rowNumber = transfer.rowNumber;
  if (gateway.readAll) {
    const rows = await gateway.readAll();
    const idColumn = rows[0]?.indexOf("CardSnap record ID");
    if (idColumn === undefined || idColumn < 0) throw Object.assign(new Error("The register is missing its synchronization ID column."), { code: "SHEET_COLUMNS_INVALID", status: 502 });
    const found = rows.findIndex((row, index) => index > 0 && String(row[idColumn] || "") === card.id);
    if (found < 1) return addPendingSheetRecord(db, card, { ...options, gateway });
    rowNumber = found + 1;
  }
  await gateway.update(rowNumber, sheetRow(card, options.people || await names(db, card)));
  await db.collection("transfers").updateOne({ _id: transfer._id }, { $set: { rowNumber, status: card.status, updatedAt: new Date() } });
  return { ...transfer, rowNumber, status: card.status };
}

export async function removeSheetRecord(db, card, options = {}) {
  const gateway = options.gateway === undefined ? createSheetGateway(options.env) : options.gateway;
  if (!gateway) return { skipped: true };
  const transfer = await db.collection("transfers").findOne({ tenantId: card.tenantId, cardId: card.id, provider: "google_sheets" });
  if (!transfer?.rowNumber || transfer.status === "removed") return transfer || { skipped: true };
  let rowNumber = transfer.rowNumber;
  if (gateway.readAll) {
    const rows = await gateway.readAll();
    const idColumn = rows[0]?.indexOf("CardSnap record ID");
    if (idColumn === undefined || idColumn < 0) throw Object.assign(new Error("The register is missing its synchronization ID column."), { code: "SHEET_COLUMNS_INVALID", status: 502 });
    const found = rows.findIndex((row, index) => index > 0 && String(row[idColumn] || "") === card.id);
    if (found < 1) return { skipped: true };
    rowNumber = found + 1;
  }
  await gateway.remove(rowNumber);
  await db.collection("transfers").updateOne({ _id: transfer._id }, { $set: { status: "removed", removedAt: new Date() } });
  await db.collection("transfers").updateMany(
    { tenantId: card.tenantId, provider: "google_sheets", status: { $ne: "removed" }, rowNumber: { $gt: rowNumber } },
    { $inc: { rowNumber: -1 } },
  );
  return { ...transfer, status: "removed" };
}
