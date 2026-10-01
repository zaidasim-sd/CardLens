import { randomBytes, createHash } from "node:crypto";
import { encryptValue, decryptValue } from "../security/encryption.js";
import { writeAudit } from "../audit/service.js";
import { updateSheetRecord } from "./sheetService.js";

const key = "constant_contact";
const base = "https://api.cc.email/v3";
const tokenUrl = "https://authz.constantcontact.com/oauth2/default/v1/token";
export const hash = value => createHash("sha256").update(String(value)).digest("hex");
const problem = (message, uncertain = false) => Object.assign(new Error(message), { uncertain });
export function approvalTransfer(card, user, now = new Date()) {
  if (process.env.CC_ENABLED === "false" || !process.env.CC_CLIENT_ID) return {};
  if (String(card.capturedBy) === user.id) throw problem("A different reviewer must approve this contact.");
  if (["transferred", "existing_contact"].includes(card.transferStatus)) return {};
  return { ccApproval: { reviewerId: user.id, version: now.toISOString() }, transferStatus: card.transferStatus === "reconciliation_required" ? "reconciliation_required" : "pending", transferError: "" };
}
export async function connectionStatus(db, tenantId) {
  const config = await db.collection("settings").findOne({ tenantId, key });
  return { configured: Boolean(process.env.CC_CLIENT_ID && process.env.CC_CLIENT_SECRET && process.env.CC_REDIRECT_URI), connected: Boolean(config?.tokens), listName: config?.listName || process.env.CC_LIST_NAME || "First active list" };
}
async function exchange(db, tenantId, values) {
  const response = await fetch(tokenUrl, { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${process.env.CC_CLIENT_ID}:${process.env.CC_CLIENT_SECRET}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(values), signal: AbortSignal.timeout(12000), redirect: "error" });
  if (!response.ok) throw problem("Constant Contact authorization failed. Reconnect the account.");
  const result = await response.json();
  if (!result.access_token || !result.refresh_token) throw problem("Constant Contact did not return valid authorization.");
  await db.collection("settings").updateOne({ tenantId, key }, { $set: { tokens: encryptValue({ access: result.access_token, refresh: result.refresh_token, expires: Date.now() + Number(result.expires_in || 3600) * 1000 }), refreshUntil: new Date(0) } }, { upsert: true });
  return result.access_token;
}
async function accessToken(db, tenantId) {
  const config = await db.collection("settings").findOne({ tenantId, key });
  if (!config?.tokens) throw problem("Connect Constant Contact in administrator settings.");
  const tokens = decryptValue(config.tokens);
  if (tokens.expires > Date.now() + 60000) return tokens.access;
  const lock = await db.collection("settings").findOneAndUpdate({ tenantId, key, $or: [{ refreshUntil: { $lt: new Date() } }, { refreshUntil: { $exists: false } }] }, { $set: { refreshUntil: new Date(Date.now() + 30000) } });
  if (!lock) throw problem("Authorization is refreshing. Retry shortly.");
  try { return await exchange(db, tenantId, { grant_type: "refresh_token", refresh_token: tokens.refresh }); }
  finally { await db.collection("settings").updateOne({ tenantId, key }, { $set: { refreshUntil: new Date(0) } }); }
}
export async function beginConnection(db, user, session) {
  if (!(await connectionStatus(db, user.tenantId)).configured) throw problem("Configure Constant Contact server credentials first.");
  const redirect = new URL(process.env.CC_REDIRECT_URI);
  if (redirect.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(redirect.hostname)) throw problem("OAuth redirect must use HTTPS.");
  const state = randomBytes(32).toString("hex"), nonce = randomBytes(32).toString("hex");
  await db.collection("settings").insertOne({ tenantId: user.tenantId, key: `cc_oauth:${hash(state)}`, userId: session.userId, sessionId: session._id, nonceHash: hash(nonce), expires: new Date(Date.now() + 600000) });
  const url = new URL("https://authz.constantcontact.com/oauth2/default/v1/authorize");
  url.search = new URLSearchParams({ client_id: process.env.CC_CLIENT_ID, redirect_uri: redirect.href, response_type: "code", scope: "contact_data offline_access", state }).toString();
  return { url: url.href, cookie: `cc_oauth=${nonce}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${redirect.protocol === "https:" ? "; Secure" : ""}` };
}
export async function finishConnection(db, query, nonce) {
  if (!query.state || !query.code || !nonce) throw problem("Authorization was cancelled or expired. Connect again.");
  const state = await db.collection("settings").findOneAndDelete({ key: `cc_oauth:${hash(query.state)}`, nonceHash: hash(nonce), expires: { $gt: new Date() } });
  if (!state) throw problem("Authorization expired. Connect again.");
  const session = await db.collection("sessions").findOne({ _id: state.sessionId, userId: state.userId });
  const user = await db.collection("users").findOne({ _id: state.userId, tenantId: state.tenantId, role: "vision71_administrator", removedAt: { $exists: false } });
  if (!session || !user || session.anonymous || new Date(session.absoluteExpiresAt) <= new Date() || (user.expiresAt && new Date(user.expiresAt) <= new Date()) || Date.now() - new Date(session.lastSeenAt).getTime() > 30 * 60000) throw problem("Administrator session expired. Sign in and connect again.");
  await exchange(db, state.tenantId, { grant_type: "authorization_code", code: query.code, redirect_uri: process.env.CC_REDIRECT_URI });
  return state.tenantId;
}
export function contactPayload(data, listId, fieldId, recordId) {
  const email = String(data.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw problem("An email address is required for Constant Contact transfer.");
  const [first = "", ...rest] = String(data.fullName || "").trim().split(/\s+/);
  return { email_address: { address: email, permission_to_send: "implicit" }, create_source: "Account", first_name: first.slice(0, 50), last_name: rest.join(" ").slice(0, 50), company_name: String(data.companyName || "").slice(0, 50), job_title: String(data.jobTitle || "").slice(0, 50), list_memberships: [listId], ...(data.phone ? { phone_numbers: [{ phone_number: data.phone.slice(0, 25), kind: "work" }] } : {}), ...(fieldId ? { custom_fields: [{ custom_field_id: fieldId, value: `CardSnap:${recordId}|${data.meetingContext?.metAtLocation || ""}|${data.meetingContext?.whereMet || ""}`.slice(0, 255) }] } : {}) };
}
export async function transferApproved(db, cardId, tenantId, fetcher = fetch) {
  if (process.env.CC_ENABLED === "false") return;
  const card = await db.collection("cards").findOne({ _id: cardId, tenantId });
  if (!card || card.status !== "approved" || !card.ccApproval || card.ccApproval.reviewerId === String(card.capturedBy) || card.duplicateReview?.state === "pending" || ["transferred", "existing_contact"].includes(card.transferStatus)) return;
  const version = card.ccApproval.version;
  if (new Date(card.updatedAt).toISOString() !== version) return;
  const claimed = await db.collection("cards").findOneAndUpdate({ _id: cardId, tenantId, status: "approved", transferStatus: { $in: ["pending", "failed", "reconciliation_required"] }, "ccApproval.version": version, $or: [{ ccLease: { $lt: new Date() } }, { ccLease: { $exists: false } }] }, { $set: { ccLease: new Date(Date.now() + 180000), ccLastAttemptAt: new Date() } });
  if (!claimed) return;
  let status = "failed", error = "Constant Contact transfer failed. Retry from administrator settings.", remoteId;
  try {
    const token = await accessToken(db, tenantId);
    const call = async (path, body) => {
      let response;
      try { response = await fetcher(`${base}${path}`, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(12000), redirect: "error" }); }
      catch { throw problem("Provider response was uncertain. Retry to check the existing contact before sending again.", Boolean(body)); }
      if (!response.ok) throw problem(response.status === 401 ? "Authorization expired. Reconnect Constant Contact." : "Constant Contact rejected the request. Retry or check account settings.", Boolean(body && response.status >= 500));
      try { return await response.json(); }
      catch { throw problem("Provider returned an unreadable response. Check before retrying.", Boolean(body)); }
    };
    const data = decryptValue(card.payload).verifiedData;
    contactPayload(data, "check", null, String(cardId));
    const matches = await call(`/contacts?email=${encodeURIComponent(data.email.trim().toLowerCase())}&status=all&include=custom_fields,list_memberships`);
    if (matches.contacts?.length) {
      const recovered = card.transferStatus === "reconciliation_required" && matches.contacts.find(item => item.custom_fields?.some(field => field.value?.startsWith(`CardSnap:${cardId}|`)) && item.list_memberships?.length);
      if (recovered) { status = "transferred"; remoteId = recovered.contact_id; error = ""; }
      else { status = "existing_contact"; error = "Email already exists in Constant Contact. Existing contact was preserved."; }
    }
    else {
      if (card.transferStatus === "reconciliation_required") throw problem("Previous transfer has an uncertain result. Check Constant Contact before creating this contact again.", true);
      const lists = await call("/contact_lists?limit=1000&status=active");
      const list = lists.lists?.find(item => item.name === process.env.CC_LIST_NAME) || lists.lists?.[0];
      if (!list?.list_id) throw problem("No active Constant Contact list is available.");
      let fieldId;
      if (process.env.CC_CUSTOM_FIELD_LABEL) {
        const label = process.env.CC_CUSTOM_FIELD_LABEL;
        if (label.length > 50) throw problem("Custom field label must be at most 50 characters.");
        const fields = await call("/contact_custom_fields");
        const existing = fields.custom_fields?.find(item => item.label === label || item.name === label);
        if (existing && existing.type !== "string") throw problem("The configured custom field must be a text field.");
        fieldId = existing?.custom_field_id || (await call("/contact_custom_fields", { label, type: "string" })).custom_field_id;
      }
      await db.collection("settings").updateOne({ tenantId, key }, { $set: { listName: list.name } });
      await db.collection("cards").updateOne({ _id: cardId, tenantId }, { $set: { transferStatus: "reconciliation_required" } });
      const created = await call("/contacts", contactPayload(data, list.list_id, fieldId, String(cardId)));
      if (!created.contact_id) throw problem("Provider response was uncertain. Retry to check the contact.", true);
      remoteId = created.contact_id; status = "transferred"; error = "";
    }
  } catch (failure) { error = failure.message; status = failure.uncertain ? "reconciliation_required" : "failed"; }
  await db.collection("cards").updateOne({ _id: cardId, tenantId, "ccApproval.version": version }, { $set: { transferStatus: status, transferError: error, ...(remoteId ? { ccContactId: remoteId, transferredAt: new Date() } : {}) }, $unset: { ccLease: "" } });
  await writeAudit(db, { tenantId, actor: { id: card.ccApproval.reviewerId, role: "aventure_reviewer" }, action: "transfer", recordRef: cardId, outcome: status === "transferred" ? "success" : status === "existing_contact" ? "refused" : "failed" });
  return status;
}
export async function processTransfers(db, tenantId, limit = 5) {
  const connected = tenantId ? [tenantId] : (await db.collection("settings").find({ key, tokens: { $exists: true } }, { projection: { tenantId: 1 } }).toArray()).map(item => item.tenantId);
  if (!connected.length) return 0;
  const records = await db.collection("cards").find({ tenantId: { $in: connected }, status: "approved", ccApproval: { $exists: true }, transferStatus: { $in: ["pending", "failed", "reconciliation_required"] } }).sort({ ccLastAttemptAt: 1 }).limit(limit).toArray();
  let processed = 0;
  for (const card of records) {
    if (!(await connectionStatus(db, card.tenantId)).connected) continue;
    await transferApproved(db, card._id, card.tenantId);
    processed++;
    const updated = await db.collection("cards").findOne({ _id: card._id, tenantId: card.tenantId });
    if (!updated) continue;
    try { await updateSheetRecord(db, { ...updated, ...decryptValue(updated.payload), id: String(updated._id) }); }
    catch { await db.collection("cards").updateOne({ _id: card._id }, { $set: { sheetStatus: "failed" } }); }
  }
  return processed;
}
