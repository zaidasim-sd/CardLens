import { submitDirect } from "./directSubmission.js";
import { blindIndex, decryptValue } from "../security/encryption.js";
import { requireAction } from "../auth/permissions.js";
import { pilot } from "../pilot.js";

export const RECORD_STATES = ["draft", "submitted", "correction_requested", "approved", "rejected", "transferred"];

function fail(code, status, message, extra = {}) {
  throw Object.assign(new Error(message), { code, status, ...extra });
}

function normalized(value) {
  return String(value || "").trim().toLocaleLowerCase("en");
}

export function validatePilotContact(data) {
  if (!String(data.meetingContext?.metAtLocation || "").trim()) fail("CONTACT_INVALID", 400, "Select an exhibition / source.");
  if (!String(data.fullName || "").trim() && !String(data.companyName || "").trim()) fail("CONTACT_INVALID", 400, "Enter a contact name or company name.");
  if (!String(data.email || "").trim() && !String(data.phone || "").trim()) fail("CONTACT_INVALID", 400, "Enter an email address or phone number.");
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.email).trim())) fail("CONTACT_INVALID", 400, "Enter a valid email address.");
}

function phone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 7 ? digits : "";
}

export function duplicateKeys(data) {
  const email = normalized(data?.email);
  const phones = [phone(data?.phone), phone(data?.alternatePhone)].filter(Boolean);
  const name = normalized(data?.fullName);
  const company = normalized(data?.companyName);
  return {
    email: email ? blindIndex(`email:${email}`) : null,
    phones: [...new Set(phones.map((value) => blindIndex(`phone:${value}`)))],
    nameCompany: name && company ? blindIndex(`name_company:${name}\u0000${company}`) : null,
  };
}

export function queryForDuplicates(tenantId, keys, excludingId) {
  const alternatives = [];
  if (keys.email) alternatives.push({ "duplicateKeys.email": keys.email });
  if (keys.phones.length) alternatives.push({ "duplicateKeys.phones": { $in: keys.phones } });
  if (keys.nameCompany) alternatives.push({ "duplicateKeys.nameCompany": keys.nameCompany });
  if (!alternatives.length) return null;
  const query = { tenantId, status: { $ne: "rejected" }, $or: alternatives };
  if (excludingId) query._id = { $ne: excludingId };
  return query;
}

export function toPublic(card) {
  let payload = {};
  try {
    payload = decryptValue(card.payload);
  } catch {
    payload = {
      verifiedData: {
        fullName: "(Unreadable Record)",
        notes: "This card was saved with an earlier encryption key.",
      },
    };
  }
  return {
    id: String(card._id),
    recordId: card.recordId || String(card._id),
    tenantId: card.tenantId,
    capturedBy: String(card.capturedBy),
    capturedByName: card.capturedByName || "",
    reviewedBy: card.reviewedBy ? String(card.reviewedBy) : null,
    reviewedAt: card.reviewedAt ? new Date(card.reviewedAt).toISOString() : null,
    duplicateReview: card.duplicateReview || null,
    // PILOT: transfer status handling retained for restoration, omitted from responses.
    ...(pilot.constantContactEnabled ? { transferStatus: card.transferStatus || "not_started", transferError: card.transferError || "" } : {}),
    // Legacy successful insertions used "pending" as the sync marker, not an outbound job.
    sheetStatus: !pilot.internalReviewEnabled && card.sheetStatus === "pending" && !card.sheetWritePending ? "submitted" : card.sheetStatus || "not_started",
    sheetError: card.sheetError || null,
    reviewerComment: card.reviewerComment || "",
    reviewedByName: card.reviewedByName || "",
    status: card.status,
    createdAt: card.createdAt ? new Date(card.createdAt).toISOString() : new Date().toISOString(),
    obtainedAt: new Date(card.obtainedAt || card.createdAt).toISOString(),
    lastConfirmedAt: new Date(card.lastConfirmedAt || card.updatedAt || card.createdAt).toISOString(),
    updatedAt: card.updatedAt ? new Date(card.updatedAt).toISOString() : new Date().toISOString(),
    verifiedAt: card.verifiedAt ? new Date(card.verifiedAt).toISOString() : null,
    hasImage: Boolean(card.hasImage),
    imageExpiresAt: card.imageExpiresAt ? new Date(card.imageExpiresAt).toISOString() : null,
    imageExpiredAt: card.imageExpiredAt ? new Date(card.imageExpiredAt).toISOString() : null,
    ...payload,
  };
}

export async function findDuplicate(db, user) { requireAction(user, "capture_card"); return null; }
export async function matchingCards() { return []; }
export async function createCard(db, user, input, now = new Date(), options = {}) { return submitDirect(db, user, input, now, options); }
export async function listCards(db, user) {
  requireAction(user, user.role === "exhibition_assistant" ? "view_own_draft" : "view_review_queue");
  return []; // Review and contact history are owned by the Google Sheet.
}
function sheetOnly() { fail("SHEET_ONLY", 410, "Contacts and review are held in Google Sheets. Lead71 does not store contacts or images."); }
export async function getCard() { sheetOnly(); }
export async function getCardImage() { sheetOnly(); }
export async function updateCard() { sheetOnly(); }
export async function deleteCard() { sheetOnly(); }
export async function storageHealth(db, user) {
  requireAction(user, "manage_users");
  const names = ["users", "sessions", "loginAttempts", "cards", "cardImages", "auditLogs", "settings", "rateLimits", "transfers", "lists"];
  const collections = [];
  for (const name of names) {
    try {
      const result = await db.command({ collStats: name, scale: 1 });
      collections.push({ name, bytes: result.storageSize || result.size || 0 });
    } catch {
      collections.push({ name, bytes: 0 });
    }
  }
  const usedBytes = collections.reduce((sum, item) => sum + item.bytes, 0);
  const limitBytes = 512 * 1024 * 1024;
  return { usedBytes, limitBytes, percentUsed: Number(((usedBytes / limitBytes) * 100).toFixed(2)), warning: usedBytes >= limitBytes * 0.8, collections };
}
