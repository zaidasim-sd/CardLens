import { ObjectId } from "mongodb";
import { decryptValue, encryptValue } from "../security/encryption.js";
import { requireAction } from "../auth/permissions.js";
import { writeAudit } from "../audit/service.js";
import { removeSheetRecord } from "./sheetService.js";

const AUTH_URL = "https://authz.constantcontact.com/oauth2/default/v1";
const API_URL = "https://api.cc.email/v3";

function fail(code, status, message) {
  throw Object.assign(new Error(message), { code, status });
}

function verifyTestEnvironment(env) {
  if ((env.CC_ENV || "test") !== "test" && env.CC_REAL_ACCOUNT_APPROVED !== "true") {
    fail("CC_REAL_ACCOUNT_REFUSED", 403, "The real Constant Contact account is not approved.");
  }
}

function names(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  return { firstName: parts.shift() || "", lastName: parts.join(" ") };
}

export function constantContactPayload(card, settings) {
  const data = card.verifiedData || {};
  if (!data.email) fail("CC_EMAIL_REQUIRED", 409, "An email address is required for transfer.");
  const split = names(data.fullName);
  return {
    email_address: { address: data.email, permission_to_send: "implicit" },
    first_name: split.firstName,
    last_name: split.lastName,
    company_name: data.companyName || "",
    create_source: "Account",
    list_memberships: [settings.listId],
    phone_numbers: data.phone ? [{ phone_number: data.phone, kind: "work" }] : [],
    custom_fields: settings.eventFieldId ? [{ custom_field_id: settings.eventFieldId, value: data.meetingContext?.metAtLocation || "CardSnap test" }] : [],
  };
}

export function createConstantContactClient(env = process.env, fetcher = fetch) {
  verifyTestEnvironment(env);
  async function request(path, token, options = {}) {
    const response = await fetcher(`${API_URL}${path}`, { ...options, signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...options.headers } });
    if (!response.ok) fail(response.status === 429 ? "CC_RATE_LIMITED" : "CC_REQUEST_FAILED", response.status === 429 ? 429 : 502, "Constant Contact request failed.");
    return response.status === 204 ? {} : response.json();
  }
  return {
    authorizationUrl(state) {
      if (!env.CC_CLIENT_ID || !env.CC_REDIRECT_URI) fail("CC_NOT_CONFIGURED", 503, "Constant Contact is not configured.");
      return `${AUTH_URL}/authorize?${new URLSearchParams({ client_id: env.CC_CLIENT_ID, redirect_uri: env.CC_REDIRECT_URI, response_type: "code", scope: "contact_data offline_access", state })}`;
    },
    async exchange(code) {
      const response = await fetcher(`${AUTH_URL}/token`, { method: "POST", signal: AbortSignal.timeout(20000), headers: { Authorization: `Basic ${Buffer.from(`${env.CC_CLIENT_ID}:${env.CC_CLIENT_SECRET}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: env.CC_REDIRECT_URI }) });
      if (!response.ok) fail("CC_AUTH_FAILED", 502, "Constant Contact sign in failed.");
      return response.json();
    },
    async lookup(token, email) {
      return (await request(`/contacts?email=${encodeURIComponent(email)}&include=list_memberships`, token)).contacts || [];
    },
    async create(token, payload) {
      return request("/contacts", token, { method: "POST", body: JSON.stringify(payload) });
    },
    async assignList(token, contactId, listId) {
      return request("/activities/add_list_memberships", token, { method: "POST", body: JSON.stringify({ source: { contact_ids: [contactId] }, list_ids: [listId] }) });
    },
  };
}

export async function storeConstantContactToken(db, actor, token, now = new Date()) {
  requireAction(actor, "manage_users");
  const value = { ...token, expiresAt: new Date(now.getTime() + Number(token.expires_in || 7200) * 1000).toISOString() };
  await db.collection("settings").updateOne(
    { tenantId: actor.tenantId, key: "constant_contact_token" },
    { $set: { tenantId: actor.tenantId, key: "constant_contact_token", value: encryptValue(value), updatedAt: now } },
    { upsert: true },
  );
}

export async function transferApprovedCard(db, actor, id, options = {}) {
  requireAction(actor, "transfer_approved_card");
  if (!ObjectId.isValid(id)) fail("CARD_NOT_FOUND", 404, "Record not found.");
  const _id = new ObjectId(id);
  const stored = await db.collection("cards").findOne({ _id, tenantId: actor.tenantId, assignedReviewerId: new ObjectId(actor.id) });
  if (!stored) fail("CARD_NOT_FOUND", 404, "Record not found.");
  if (stored.status === "transferred") return { status: "transferred", repeated: true };
  if (stored.status !== "approved") fail("CARD_NOT_APPROVED", 409, "Only an approved contact can be transferred.");
  const previous = await db.collection("transfers").findOne({ tenantId: actor.tenantId, cardId: id, provider: "constant_contact", status: "transferred" });
  if (previous) return { status: "transferred", repeated: true };
  const card = { id, tenantId: stored.tenantId, status: stored.status, capturedBy: String(stored.capturedBy), reviewedBy: stored.reviewedBy ? String(stored.reviewedBy) : null, reviewedAt: stored.reviewedAt?.toISOString(), createdAt: stored.createdAt.toISOString(), transferStatus: stored.transferStatus, ...decryptValue(stored.payload) };
  const settings = options.settings || await db.collection("settings").findOne({ tenantId: actor.tenantId, key: "constant_contact" });
  if (!settings?.listId) fail("CC_SETTINGS_REQUIRED", 409, "Choose a Constant Contact list.");
  const encrypted = await db.collection("settings").findOne({ tenantId: actor.tenantId, key: "constant_contact_token" });
  const token = options.token || (encrypted?.value ? decryptValue(encrypted.value) : null);
  if (!token?.access_token) fail("CC_SIGN_IN_REQUIRED", 409, "Constant Contact sign in is required.");
  const client = options.client || createConstantContactClient(options.env);
  const payload = constantContactPayload(card, settings);
  const existing = await client.lookup(token.access_token, card.verifiedData.email);
  let contactId;
  let duplicate = false;
  if (existing.length) {
    duplicate = true;
    contactId = existing[0].contact_id;
    if (!(existing[0].list_memberships || []).includes(settings.listId)) await client.assignList(token.access_token, contactId, settings.listId);
  } else {
    const created = await client.create(token.access_token, payload);
    contactId = created.contact_id;
  }
  if (!contactId) fail("CC_RESULT_INVALID", 502, "Constant Contact did not confirm the transfer.");
  const now = new Date();
  await db.collection("transfers").updateOne(
    { tenantId: actor.tenantId, cardId: id, provider: "constant_contact" },
    { $set: { tenantId: actor.tenantId, cardId: id, provider: "constant_contact", status: "transferred", contactId, duplicate, transferredAt: now, actorId: actor.id } },
    { upsert: true },
  );
  await db.collection("cards").updateOne({ _id, tenantId: actor.tenantId }, { $set: { status: "transferred", transferStatus: "transferred", updatedAt: now } });
  const transferredCard = { ...card, status: "transferred", transferStatus: "transferred" };
  try { await removeSheetRecord(db, transferredCard, options.sheet || {}); } catch { await db.collection("cards").updateOne({ _id }, { $set: { sheetStatus: "remove_failed" } }); }
  await writeAudit(db, { tenantId: actor.tenantId, actor, action: "transfer", recordRef: _id, outcome: "success", now });
  return { status: "transferred", contactId, duplicate, repeated: false };
}
