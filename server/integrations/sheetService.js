import { GoogleAuth } from "google-auth-library";
import { ObjectId } from "mongodb";
import { readFileSync } from "node:fs";
import { createPrivateKey } from "node:crypto";
import mapping from "../../config/sheetMapping.json" with { type: "json" };
import { pilot } from "../pilot.js";

// PILOT: broader fields remain in sheetMapping.json and the legacy gateway below.
// Existing sheet data is kept; excluded columns are hidden during configuration.
const historicFields = new Set(["whereMet", "obtainedAt", "lastConfirmedAt", "transferStatus", "reviewedByName", "reviewedAt"]);
export const pilotColumns = mapping.columns.filter(column => !historicFields.has(column.field));
const normalizeHeader = value => String(value || "").trim().toLowerCase();
export function sheetField(header) {
  if (["contact id", "record id", "lead71 record id", "cardsnap record id"].includes(normalizeHeader(header))) return "recordId";
  return mapping.columns.find(column => normalizeHeader(column.header) === normalizeHeader(header))?.field;
}
export function pilotHeaders() {
  return pilotColumns.map(column => column.field === "recordId" ? "Contact ID" : column.header);
}

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
    status: { draft: "Draft", submitted: "Pending Review", approved: "Approved", rejected: "Rejected", correction_requested: pilot.internalReviewEnabled ? "Return for Correction" : "Needs Correction", transferred: "Transferred" }[card.status] || card.status,
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

export function normalizeGooglePrivateKey(value) {
  let text = String(value || "").trim();
  if (text.startsWith('"') && text.endsWith('"')) {
    try { text = JSON.parse(text); }
    catch { text = text.slice(1, -1); }
  } else if (text.startsWith("'") && text.endsWith("'")) text = text.slice(1, -1);
  return text.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\r\n/g, "\n").trim();
}

export function sheetFailure(error) {
  const messages = {
    SHEET_NOT_CONFIGURED: "Set GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY in Vercel Production, then redeploy.",
    SHEET_CREDENTIALS_INVALID: "Google service-account credentials could not be loaded. Locally, check that GOOGLE_SERVICE_ACCOUNT_KEY_FILE points to a valid, readable service-account JSON file. On Vercel, supply GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY instead. Restart or redeploy after changing credentials.",
    SHEET_KEY_INVALID: "The private key format is invalid. Paste the full private_key value from the service-account JSON, including BEGIN and END lines.",
    SHEET_TARGET_REFUSED: "Set SHEET_TARGET_APPROVED=true for the authorized production register, then redeploy.",
    SHEET_AUTH_FAILED: "Google authentication failed. Check that the service-account email and private key come from the same active credential JSON.",
    SHEET_API_DISABLED: "Enable the Google Sheets API in the service account's Google Cloud project.",
    SHEET_ACCESS_DENIED: "Google denied access. Share this spreadsheet with the configured service account as Editor and check protected-range permissions.",
    SHEET_NOT_FOUND: "Google could not access the spreadsheet. Check GOOGLE_SHEET_ID and service-account sharing.",
    SHEET_RANGE_INVALID: "Check GOOGLE_SHEET_TAB. It must exactly match the tab name inside the spreadsheet, such as Sheet1.",
    SHEET_COLUMNS_INVALID: pilot.submissionOnlyEnabled ? "The existing Sheet headers are missing or duplicated, or Contact IDs are duplicated. Check GOOGLE_SHEET_HEADER_ROW and the existing column names; do not run configure:sheet in submission-only mode." : "The register is missing required headers or has duplicate headers/IDs. Run npm run configure:sheet with the current backend configuration.",
    SHEET_RATE_LIMITED: "Google Sheets is temporarily rate limited. Retry synchronization later.",
    SHEET_NETWORK_FAILED: "The server could not reach Google Sheets. Retry synchronization later.",
  };
  const code = messages[error?.code] ? error.code : "SHEET_SYNC_FAILED";
  return { code, message: messages[code] || "Google Sheet synchronization failed. Run Check Google Sheet in the administrator Users page." };
}

function credentials(env) {
  // Hosted deployments must not depend on a workstation path or optional bundled file.
  // Prefer a complete explicit pair even when a stale KEY_FILE variable remains set.
  const email = String(env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "").trim();
  const privateKey = normalizeGooglePrivateKey(env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
  if (email && privateKey) return { client_email: email, private_key: privateKey };
  if (env.VERCEL === "1") {
    if (env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE) throw Object.assign(new Error("Hosted Google service-account email/private key are incomplete; local credential files are unsupported."), { code: "SHEET_CREDENTIALS_INVALID", status: 503 });
    return null;
  }
  if (env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE) {
    try {
      const value = JSON.parse(readFileSync(env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE, "utf8"));
      if (value.type !== "service_account" || !value.client_email || !value.private_key) throw new Error();
      return { client_email: value.client_email, private_key: value.private_key };
    } catch { throw Object.assign(new Error("Google service account credential file is missing or invalid."), { code: "SHEET_CREDENTIALS_INVALID", status: 503 }); }
  }
  return null;
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
  try { createPrivateKey(selectedCredentials.private_key); }
  catch { throw Object.assign(new Error("Google service account private key is invalid."), { code: "SHEET_KEY_INVALID", status: 503 }); }
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
  let response;
  try { response = await fetcher(url, { ...options, signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...options.headers } }); }
  catch { throw Object.assign(new Error("Google Sheet network request failed."), { code: "SHEET_NETWORK_FAILED", status: 502 }); }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const reasons = [...(body.error?.errors || []).map(item => item.reason), ...(body.error?.details || []).map(item => item.reason)];
    const code = reasons.some(reason => ["SERVICE_DISABLED", "accessNotConfigured"].includes(reason)) ? "SHEET_API_DISABLED" : ({ 400: "SHEET_RANGE_INVALID", 401: "SHEET_AUTH_FAILED", 403: "SHEET_ACCESS_DENIED", 404: "SHEET_NOT_FOUND", 429: "SHEET_RATE_LIMITED" }[response.status] || "SHEET_REQUEST_FAILED");
    throw Object.assign(new Error(`Google Sheet request failed (HTTP ${response.status}).`), { code, status: 502 });
  }
  return response.status === 204 ? {} : response.json();
}

export async function diagnoseSheet(env = process.env) {
  const checks = {
    sheetIdConfigured: Boolean(env.GOOGLE_SHEET_ID || env.GOOGLE_SHEET_TEST_ID),
    emailConfigured: Boolean(env.GOOGLE_SERVICE_ACCOUNT_EMAIL),
    privateKeyConfigured: Boolean(env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY),
    localCredentialFileConfigured: Boolean(env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE),
    hostedOnVercel: env.VERCEL === "1",
    credentialSource: env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() && normalizeGooglePrivateKey(env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) ? "environment" : env.VERCEL !== "1" && env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE ? "local_file" : "missing",
    productionTargetApproved: env.SHEET_TARGET_APPROVED === "true",
    tab: env.GOOGLE_SHEET_TAB || "Contacts",
  };
  try {
    const selected = config(env);
    if (!selected) throw { code: "SHEET_NOT_CONFIGURED" };
    await accessToken(env);
    const metadata = await googleRequest(env, `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(selected.sheetId)}?fields=sheets(properties)`);
    const tab = metadata.sheets?.find(item => item.properties?.title === selected.tab);
    if (!tab) throw { code: "SHEET_RANGE_INVALID" };
    await createSheetGateway(env).readAll();
    return { ok: true, checks, message: "Google authentication, spreadsheet access, tab name and required register headers passed. This check does not write any contacts.", tabIdMatches: !pilot.internalReviewEnabled || tab.properties.sheetId === selected.tabId };
  } catch (error) { return { ok: false, checks, ...sheetFailure(error) }; }
}

export function createSheetGateway(env = process.env, fetcher = fetch) {
  // SUBMISSION-ONLY PILOT: existing review gateways remain below for restoration.
  if (pilot.submissionOnlyEnabled && !pilot.internalReviewEnabled) return createSubmissionSheetGateway(env, fetcher);
  return pilot.internalReviewEnabled ? createLegacySheetGateway(env, fetcher) : createPilotSheetGateway(env, fetcher);
}

// Uses the client's existing layout without configuring headers, formatting or status fields.
export function createSubmissionSheetGateway(env = process.env, fetcher = fetch) {
  const selected = config(env);
  if (!selected) return null;
  const headerRow = Number(env.GOOGLE_SHEET_HEADER_ROW || 1);
  const timeZone = env.GOOGLE_SHEET_CAPTURE_TIME_ZONE || "Etc/GMT+4"; // Fixed GMT-4.
  if (!Number.isInteger(headerRow) || headerRow < 1) throw Object.assign(new Error("Invalid header row."), { code: "SHEET_COLUMNS_INVALID", status: 502 });
  new Intl.DateTimeFormat("en", { timeZone });
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(selected.sheetId)}`;
  const tab = `'${selected.tab.replaceAll("'", "''")}'`;
  const request = (path, options) => googleRequest(env, `${base}${path}`, options, fetcher);
  const field = header => {
    const text = normalizeHeader(String(header).replace(/\s+/g, " "));
    if (["place/exhibition", "place / exhibition"].includes(text)) return "event";
    if (/^time\s*\(gmt\s*-\s*4\)$/.test(text)) return "capturedTime";
    return sheetField(text);
  };
  const required = ["recordId", "event", "fullName", "companyName", "jobTitle", "email", "phone", "notes", "capturedAt", "capturedTime", "capturedByName"];
  let headers;
  const readAll = async () => {
    const rows = (await request(`/values/${encodeURIComponent(`${tab}!A${headerRow}:ZZ`)}`)).values || [];
    headers = rows[0] || [];
    const fields = headers.map(field).filter(Boolean);
    if (!required.every(value => fields.includes(value)) || new Set(fields).size !== fields.length) throw Object.assign(new Error("Existing submission headers are missing or duplicated."), { code: "SHEET_COLUMNS_INVALID", status: 502 });
    const index = headers.findIndex(header => field(header) === "recordId");
    const ids = rows.slice(1).map(row => String(row[index] || "").trim()).filter(Boolean);
    if (new Set(ids).size !== ids.length) throw Object.assign(new Error("Duplicate Contact IDs."), { code: "SHEET_COLUMNS_INVALID", status: 502 });
    return rows;
  };
  const aligned = row => headers.map(header => {
    const key = field(header);
    const dateValue = row[mapping.columns.findIndex(column => column.field === "capturedAt")];
    if (key === "capturedAt" || key === "capturedTime") {
      const date = new Date(dateValue);
      return key === "capturedAt"
        ? new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date)
        : new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(date);
    }
    const index = mapping.columns.findIndex(column => column.field === key);
    return index < 0 ? "" : row[index];
  });
  return {
    headerRow, readAll,
    async configure() {
      // Explicitly refuse the previous schema-writing setup command in this pilot.
      throw Object.assign(new Error("Submission-only mode uses existing headers. Do not run configure:sheet."), { code: "SHEET_CONFIGURATION_DISABLED", status: 409 });
    },
    async append(row) {
      if (!headers) await readAll();
      const range = `${tab}!A${headerRow}:${columnLetter(headers.length)}`;
      const result = await request(`/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: "POST", body: JSON.stringify({ values: [aligned(row)] }) });
      const rowNumber = Number(result.updates?.updatedRange?.match(/![A-Z]+(\d+):/)?.[1]);
      if (!rowNumber) throw Object.assign(new Error("Sheet insertion could not be confirmed."), { code: "SHEET_RESULT_INVALID", status: 502 });
      return rowNumber;
    },
    async update(rowNumber, row) {
      if (!headers) await readAll();
      const values = aligned(row);
      const data = headers.flatMap((header, index) => required.includes(field(header)) ? [{ range: `${tab}!${columnLetter(index + 1)}${rowNumber}`, values: [[values[index]]] }] : []);
      await request("/values:batchUpdate", { method: "POST", body: JSON.stringify({ valueInputOption: "RAW", data }) });
    },
    async remove(rowNumber) {
      const metadata = await request("?fields=sheets(properties)");
      const sheet = metadata.sheets?.find(item => item.properties.title === selected.tab);
      if (!sheet) throw Object.assign(new Error("Sheet tab was not found."), { code: "SHEET_RANGE_INVALID", status: 502 });
      await request(":batchUpdate", { method: "POST", body: JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId: sheet.properties.sheetId, dimension: "ROWS", startIndex: rowNumber - 1, endIndex: rowNumber } } }] }) });
    },
  };
}

export function validatePilotHeaders(headers) {
  const fields = headers.map(sheetField).filter(Boolean);
  if (new Set(fields).size !== fields.length || !pilotColumns.every(column => fields.includes(column.field))) {
    throw Object.assign(new Error("Required pilot headers are missing or duplicated."), { code: "SHEET_COLUMNS_INVALID", status: 502 });
  }
}

export function createPilotSheetGateway(env = process.env, fetcher = fetch) {
  const selected = config(env);
  if (!selected) return null;
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(selected.sheetId)}`;
  const tab = `'${selected.tab.replaceAll("'", "''")}'`;
  let headers;
  let tabId;
  const request = (path, options) => googleRequest(env, `${base}${path}`, options, fetcher);
  const rawRows = async () => (await request(`/values/${encodeURIComponent(tab)}`)).values || [];
  const resolveTab = async () => {
    const metadata = await request("?fields=sheets(properties,protectedRanges)");
    const sheet = metadata.sheets?.find(item => item.properties.title === selected.tab);
    if (!sheet) throw Object.assign(new Error("Configured sheet tab was not found."), { code: "SHEET_RANGE_INVALID", status: 502 });
    tabId = sheet.properties.sheetId; // Resolve from name; no fragile hardcoded tab ID.
    return sheet;
  };
  const readAll = async () => {
    const rows = await rawRows();
    validatePilotHeaders(rows[0] || []);
    headers = rows[0];
    const idIndex = headers.findIndex(header => sheetField(header) === "recordId");
    const ids = rows.slice(1).map(row => String(row[idIndex] || "").trim()).filter(Boolean);
    if (new Set(ids).size !== ids.length) throw Object.assign(new Error("Duplicate Contact IDs in the Sheet must be corrected before synchronization."), { code: "SHEET_COLUMNS_INVALID", status: 502 });
    return rows;
  };
  const aligned = row => headers.map(header => {
    if (historicFields.has(sheetField(header))) return ""; // PILOT: no new historic/transfer values.
    const index = mapping.columns.findIndex(column => column.field === sheetField(header));
    return index < 0 ? "" : row[index];
  });
  return {
    readAll,
    async configure() {
      const selectedTab = await resolveTab();
      const rows = await rawRows();
      headers = rows[0]?.some(Boolean) ? [...rows[0]] : pilotHeaders();
      const known = headers.map(sheetField).filter(Boolean);
      if (new Set(known).size !== known.length) throw Object.assign(new Error("Duplicate register headings require manual correction."), { code: "SHEET_COLUMNS_INVALID", status: 409 });
      // Repair/add headings at the end without moving, clearing or deleting old data.
      for (const column of pilotColumns) if (!known.includes(column.field)) headers.push(column.field === "recordId" ? "Contact ID" : column.header);
      validatePilotHeaders(headers);
      const last = columnLetter(headers.length);
      await request(`/values/${encodeURIComponent(`${tab}!A1:${last}1`)}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: [headers] }) });
      const statusIndex = headers.findIndex(header => sheetField(header) === "status");
      const requests = (selectedTab.protectedRanges || []).filter(item => /^(CardSnap|Lead71) system:/.test(item.description || "")).map(item => ({ deleteProtectedRange: { protectedRangeId: item.protectedRangeId } }));
      requests.push(
        { updateSheetProperties: { properties: { sheetId: tabId, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } },
        { setDataValidation: { range: { sheetId: tabId, startRowIndex: 1, startColumnIndex: statusIndex, endColumnIndex: statusIndex + 1 }, rule: { condition: { type: "ONE_OF_LIST", values: ["Pending Review", "Approved", "Needs Correction", "Rejected"].map(userEnteredValue => ({ userEnteredValue })) }, strict: true, showCustomUi: true } } },
        { setBasicFilter: { filter: { range: { sheetId: tabId, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: headers.length } } } },
        { repeatCell: { range: { sheetId: tabId, startRowIndex: 0, endRowIndex: 1, endColumnIndex: headers.length }, cell: { userEnteredFormat: { backgroundColor: { red: 0.08, green: 0.23, blue: 0.31 }, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }, wrapStrategy: "WRAP" } }, fields: "userEnteredFormat" } },
        { addProtectedRange: { protectedRange: { description: "Lead71 system: column headings", range: { sheetId: tabId, startRowIndex: 0, endRowIndex: 1 }, warningOnly: false, editors: { users: [credentials(env).client_email] } } } },
      );
      headers.forEach((header, index) => {
        const field = sheetField(header);
        const hidden = historicFields.has(field) || field === "recordId";
        if (field) requests.push({ updateDimensionProperties: { range: { sheetId: tabId, dimension: "COLUMNS", startIndex: index, endIndex: index + 1 }, properties: { hiddenByUser: hidden, pixelSize: 180 }, fields: "hiddenByUser,pixelSize" } });
        if (["recordId", "capturedAt", "capturedByName", "duplicateFlag"].includes(field)) requests.push({ addProtectedRange: { protectedRange: { description: `Lead71 system: ${field}`, range: { sheetId: tabId, startRowIndex: 1, startColumnIndex: index, endColumnIndex: index + 1 }, warningOnly: false, editors: { users: [credentials(env).client_email] } } } });
      });
      await request(":batchUpdate", { method: "POST", body: JSON.stringify({ requests }) });
      return { columns: headers.length, visibleColumns: headers.filter(header => { const field = sheetField(header); return !historicFields.has(field) && field !== "recordId"; }).length };
    },
    async append(row) {
      if (!headers) await readAll();
      const result = await request(`/values/${encodeURIComponent(`${tab}!A:${columnLetter(headers.length)}`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: "POST", body: JSON.stringify({ values: [aligned(row)] }) });
      const rowNumber = Number(result.updates?.updatedRange?.match(/![A-Z]+(\d+):/)?.[1]);
      if (!rowNumber) throw Object.assign(new Error("Sheet insertion could not be confirmed."), { code: "SHEET_RESULT_INVALID", status: 502 });
      return rowNumber;
    },
    async update(rowNumber, row) {
      if (!headers) await readAll();
      // Write active fields only. Legacy/unknown column values stay untouched.
      const values = aligned(row);
      const data = headers.flatMap((header, index) => pilotColumns.some(column => column.field === sheetField(header)) ? [{ range: `${tab}!${columnLetter(index + 1)}${rowNumber}`, values: [[values[index]]] }] : []);
      await request("/values:batchUpdate", { method: "POST", body: JSON.stringify({ valueInputOption: "RAW", data }) });
    },
    async remove(rowNumber) {
      if (tabId === undefined) await resolveTab();
      await request(":batchUpdate", { method: "POST", body: JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId: tabId, dimension: "ROWS", startIndex: rowNumber - 1, endIndex: rowNumber } } }] }) });
    },
  };
}

// PILOT: previous nineteen-column register implementation is preserved here.
export function createLegacySheetGateway(env = process.env, fetcher = fetch) {
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
  ["Needs Correction", "correction_requested"],
  ["Rejected", "rejected"],
]);

export async function refreshStatusesFromSheet(db, tenantId, options = {}) {
  // SUBMISSION-ONLY PILOT: retain review synchronization without requiring status columns.
  if (pilot.submissionOnlyEnabled && !pilot.internalReviewEnabled) return { skipped: true, updated: 0 };
  const gateway = options.gateway === undefined ? createSheetGateway(options.env) : options.gateway;
  if (!gateway) return { skipped: true, updated: 0 };
  const rows = await gateway.readAll();
  if (rows.length < 2) return { updated: 0 };
  const headers = rows[0];
  const headerIndex = label => headers.findIndex(header => String(header).trim().toLowerCase() === label.toLowerCase());
  const statusIndex = headerIndex("Record Status");
  const commentIndex = headerIndex("Reviewer Comment");
  const idIndex = headers.findIndex(header => sheetField(header) === "recordId");
  if (statusIndex < 0 || idIndex < 0) throw Object.assign(new Error("Sheet columns are invalid"), { code: "SHEET_COLUMNS_INVALID", status: 502 });
  let updated = 0;
  for (const row of rows.slice(1)) {
    const nextStatus = SHEET_TO_RECORD_STATUS.get(String(row[statusIndex] || "").trim());
    const id = String(row[idIndex] || "").trim();
    if (!nextStatus || !id) continue;
    if (!ObjectId.isValid(id)) continue;
    const _id = new ObjectId(id);
    const card = await db.collection("cards").findOne({ _id, tenantId });
    const reviewerComment = commentIndex >= 0 ? String(row[commentIndex] || "") : "";
    if (!card || card.status === "draft" || (card.status === nextStatus && (card.reviewerComment || "") === reviewerComment)) continue;
    // PILOT: outbound changes and in-flight writes must finish before Sheet review is read.
    if (!pilot.internalReviewEnabled && (card.sheetWritePending || ["failed", "not_configured"].includes(card.sheetStatus) || card.sheetSyncLease > new Date())) continue;
    const restoreAutomatic = async (storedCard = card) => {
      if (!gateway.updateAutomatic || !storedCard.payload) return;
      const { toPublic } = await import("../cards/service.js");
      const publicCard = toPublic(storedCard);
      await gateway.updateAutomatic(rows.indexOf(row) + 1, publicCard, await names(db, publicCard));
    };
    // A spreadsheet status change cannot bypass an explicit duplicate decision.
    // PILOT: old internal duplicate approval gates retained, disabled. Sheets owns review.
    if (pilot.internalReviewEnabled && (card.ccLease > new Date() || card.duplicateReview?.state === "pending")) { await restoreAutomatic(); continue; }
    if (pilot.internalReviewEnabled && card.duplicateReview?.state === "resolved" && card.duplicateReview.decision !== "keep_both" && nextStatus !== "rejected") { await restoreAutomatic(); continue; }
    if (pilot.internalReviewEnabled && nextStatus === "approved" && card.duplicateKeys && card.duplicateReview?.state !== "resolved") {
      const { matchingCards } = await import("../cards/service.js");
      const { decryptValue } = await import("../security/encryption.js");
      if ((await matchingCards(db, tenantId, decryptValue(card.payload).verifiedData, _id)).length) { await restoreAutomatic(); continue; }
    }
    const now = new Date();
    const update = { status: nextStatus, sheetStatus: nextStatus, updatedAt: now, reviewerComment };
    update.lastConfirmedAt = now;
    if (nextStatus !== "submitted") { update.reviewedAt = now; update.reviewedByName = options.reviewerName || process.env.SHEET_REVIEWER_NAME || "Hala"; }
    const saved = await db.collection("cards").updateOne({ _id, tenantId, status: card.status, updatedAt: card.updatedAt,
      ...(!pilot.internalReviewEnabled ? { sheetStatus: card.sheetStatus, $or: [{ sheetSyncLease: { $exists: false } }, { sheetSyncLease: { $lte: now } }] } : {}),
    }, { $set: update });
    if (saved?.matchedCount === 0) continue;
    // PILOT: never write a stale Sheet snapshot back over the human's latest review.
    if (pilot.internalReviewEnabled) await restoreAutomatic({ ...card, ...update });
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
    const idColumn = rows[0]?.findIndex(header => sheetField(header) === "recordId");
    if (idColumn === undefined || idColumn < 0) throw Object.assign(new Error("The register is missing the Lead71 record ID column."), { code: "SHEET_COLUMNS_INVALID", status: 502 });
    const found = rows.findIndex((row, index) => index > 0 && String(row[idColumn] || "") === card.id);
    if (rows.filter((row, index) => index > 0 && String(row[idColumn] || "") === card.id).length > 1) throw Object.assign(new Error("Multiple Sheet records have the same Contact ID."), { code: "SHEET_COLUMNS_INVALID", status: 502 });
    if (found > 0) {
      const values = sheetRow(card, options.people || await names(db, card));
      // PILOT: reviewer feedback is owned by Sheets, including edits since the last poll.
      if (!pilot.internalReviewEnabled) {
        const commentIndex = rows[0].findIndex(header => sheetField(header) === "reviewerComment");
        if (commentIndex >= 0) values[mapping.columns.findIndex(column => column.field === "reviewerComment")] = String(rows[found][commentIndex] || "");
      }
      const rowNumber = found + (gateway.headerRow || 1);
      await gateway.update(rowNumber, values);
      const recovered = { tenantId: card.tenantId, cardId: card.id, provider: "google_sheets", rowNumber, status: card.status, updatedAt: new Date() };
      await db.collection("transfers").updateOne({ tenantId: card.tenantId, cardId: card.id, provider: "google_sheets" }, { $set: recovered }, { upsert: true });
      return recovered;
    }
  } else if (existing?.rowNumber) return existing;
  const rowNumber = await gateway.append(sheetRow(card, options.people || await names(db, card)));
  const transfer = { tenantId: card.tenantId, cardId: card.id, provider: "google_sheets", rowNumber, status: card.status, createdAt: existing?.createdAt || new Date() };
  await db.collection("transfers").updateOne({ tenantId: card.tenantId, cardId: card.id, provider: "google_sheets" }, { $set: transfer }, { upsert: true });
  return transfer;
}

// Distributed contact lease prevents simultaneous submissions/retries appending twice.
// A retry always reads IDs first, including after an uncertain Google response.
export async function syncContactSheet(db, card, options = {}) {
  const gateway = options.gateway === undefined ? createSheetGateway(options.env) : options.gateway;
  if (!gateway) return { skipped: true };
  const _id = new ObjectId(card.id);
  const lease = new Date(Date.now() + 120000);
  const claimed = await db.collection("cards").findOneAndUpdate({ _id, tenantId: card.tenantId,
    updatedAt: new Date(card.updatedAt),
    $or: [{ sheetSyncLease: { $exists: false } }, { sheetSyncLease: { $lte: new Date() } }],
  }, { $set: { sheetSyncLease: lease } }, { returnDocument: "after" });
  if (!claimed) throw Object.assign(new Error("This contact is already syncing or has changed. Retry shortly."), { code: "SHEET_SYNC_BUSY", status: 409 });
  try {
    const result = await updateSheetRecord(db, card, { ...options, gateway });
    await db.collection("cards").updateOne({ _id, tenantId: card.tenantId, sheetSyncLease: lease }, { $set: { sheetStatus: card.status }, $unset: { sheetError: "", sheetWritePending: "" } });
    return result;
  } finally {
    await db.collection("cards").updateOne({ _id, tenantId: card.tenantId, sheetSyncLease: lease }, { $unset: { sheetSyncLease: "" } });
  }
}

export async function synchronizePilotSheet(db, tenantId, options = {}) {
  // SUBMISSION-ONLY PILOT: no status polling or migration of old queued test contacts.
  // Restore by setting submissionOnlyEnabled=false; the complete workflow is retained.
  if (pilot.submissionOnlyEnabled) return { skipped: true };
  const now = options.now || new Date();
  const key = "pilot_sheet_sync";
  const env = options.env || process.env;
  const target = `${env.GOOGLE_SHEET_ID || env.GOOGLE_SHEET_TEST_ID || ""}:${env.GOOGLE_SHEET_TAB || "Contacts"}`;
  await db.collection("settings").updateOne({ tenantId, key }, { $setOnInsert: { tenantId, key, checkedAt: new Date(0) } }, { upsert: true });
  const lease = new Date(now.getTime() + 120000);
  const claimed = await db.collection("settings").findOneAndUpdate({ tenantId, key, $and: [
    { $or: [{ checkedAt: { $lte: new Date(now.getTime() - pilot.sheetPollIntervalMs) } }, { target: { $ne: target } }] },
    { $or: [{ lease: { $exists: false } }, { lease: { $lte: now } }] },
  ] }, { $set: { lease, target } }, { returnDocument: "after" });
  if (!claimed) return { skipped: true };
  try {
    const gateway = options.gateway === undefined ? createSheetGateway(env) : options.gateway;
    if (!gateway) throw Object.assign(new Error("Google Sheet is not configured."), { code: "SHEET_NOT_CONFIGURED" });
    const { toPublic } = await import("../cards/service.js");
    // Retry durable failed/outstanding submissions. Never resend an already reviewed row.
    const pending = await db.collection("cards").find({ tenantId, status: { $ne: "draft" }, $or: [{ sheetWritePending: true }, { sheetStatus: { $in: ["failed", "not_configured"] } }] }).limit(2).toArray();
    for (const stored of pending) {
      try { await syncContactSheet(db, toPublic(stored), { ...options, gateway }); }
      catch (error) {
        if (error.code !== "SHEET_SYNC_BUSY") await db.collection("cards").updateOne({ _id: stored._id, tenantId, updatedAt: stored.updatedAt }, { $set: { sheetStatus: "failed", sheetError: sheetFailure(error) } });
      }
    }
    const result = await refreshStatusesFromSheet(db, tenantId, { ...options, gateway });
    await db.collection("settings").updateOne({ tenantId, key, lease }, { $set: { checkedAt: now, lastSuccessAt: new Date(), error: null }, $unset: { lease: "" } });
    return result;
  } catch (error) {
    await db.collection("settings").updateOne({ tenantId, key, lease }, { $set: { checkedAt: now, error: sheetFailure(error) }, $unset: { lease: "" } });
    return { error: sheetFailure(error) };
  }
}

export async function updateSheetRecord(db, card, options = {}) {
  // PILOT: always locate by stable ID; the old row-number-based implementation below is retained.
  if (!pilot.internalReviewEnabled) return addPendingSheetRecord(db, card, options);
  const gateway = options.gateway === undefined ? createSheetGateway(options.env) : options.gateway;
  if (!gateway) return { skipped: true };
  const transfer = await db.collection("transfers").findOne({ tenantId: card.tenantId, cardId: card.id, provider: "google_sheets" });
  if (!transfer?.rowNumber) return addPendingSheetRecord(db, card, { ...options, gateway });
  let rowNumber = transfer.rowNumber;
  if (gateway.readAll) {
    const rows = await gateway.readAll();
    const idColumn = rows[0]?.findIndex(header => sheetField(header) === "recordId");
    if (idColumn === undefined || idColumn < 0) throw Object.assign(new Error("The register is missing its synchronization ID column."), { code: "SHEET_COLUMNS_INVALID", status: 502 });
    const found = rows.findIndex((row, index) => index > 0 && String(row[idColumn] || "") === card.id);
    if (found < 1) return addPendingSheetRecord(db, card, { ...options, gateway });
    rowNumber = found + (gateway.headerRow || 1);
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
    const idColumn = rows[0]?.findIndex(header => sheetField(header) === "recordId");
    if (idColumn === undefined || idColumn < 0) throw Object.assign(new Error("The register is missing its synchronization ID column."), { code: "SHEET_COLUMNS_INVALID", status: 502 });
    const found = rows.findIndex((row, index) => index > 0 && String(row[idColumn] || "") === card.id);
    if (found < 1) return { skipped: true };
    rowNumber = found + (gateway.headerRow || 1);
  }
  await gateway.remove(rowNumber);
  await db.collection("transfers").updateOne({ _id: transfer._id }, { $set: { status: "removed", removedAt: new Date() } });
  await db.collection("transfers").updateMany(
    { tenantId: card.tenantId, provider: "google_sheets", status: { $ne: "removed" }, rowNumber: { $gt: rowNumber } },
    { $inc: { rowNumber: -1 } },
  );
  return { ...transfer, status: "removed" };
}
