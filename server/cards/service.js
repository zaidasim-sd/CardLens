import { ObjectId } from "mongodb";
import { blindIndex, decryptValue, encryptValue } from "../security/encryption.js";
import { requireAction } from "../auth/permissions.js";
import { writeAudit } from "../audit/service.js";
import { getRetentionHours } from "../retention/service.js";
import { syncContactSheet, synchronizePilotSheet, refreshStatusesFromSheet, sheetFailure } from "../integrations/sheetService.js";
import { approvalTransfer, transferApproved } from "../integrations/constantContact.js";
import { pilot } from "../pilot.js";
import { allocateRecordId } from "./recordId.js";

export const RECORD_STATES = ["draft", "submitted", "correction_requested", "approved", "rejected", "transferred"];
const IMAGE_LIMIT_BYTES = 500 * 1024;

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
  } catch (err) {
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

function cardId(id) {
  if (!ObjectId.isValid(id)) fail("CARD_NOT_FOUND", 404, "Record not found.");
  return new ObjectId(id);
}

function canRead(user, card) {
  if (card.tenantId !== user.tenantId) return false;
  if (user.role === "aventure_reviewer" || user.role === "vision71_administrator") return true;
  return user.role === "exhibition_assistant" && String(card.capturedBy) === user.id;
}

function duplicateResult(user, card) {
  if (canRead(user, card)) return toPublic(card);
  return { id: String(card._id), createdAt: card.createdAt.toISOString(), restricted: true, verifiedData: {} };
}

export async function findDuplicate(db, user, verifiedData, excludingId) {
  requireAction(user, "capture_card");
  const keys = duplicateKeys(verifiedData);
  const query = queryForDuplicates(user.tenantId, keys, excludingId ? cardId(excludingId) : null);
  if (!query) return null;
  const matches = await matchingCards(db, user.tenantId, verifiedData, excludingId ? cardId(excludingId) : null);
  const match = matches[0];
  return match ? { ...duplicateResult(user, match), matchReason: match.matchReason } : null;
}

export async function matchingCards(db, tenantId, data, excludingId, session) {
  const keys = duplicateKeys(data);
  const query = queryForDuplicates(tenantId, keys, excludingId);
  if (!query) return [];
  const cards = await db.collection("cards").find(query, session ? { session } : {}).sort({ createdAt: -1 }).toArray();
  return cards.map(card => {
    const emailMatch = Boolean(keys.email && card.duplicateKeys?.email === keys.email);
    const phoneMatch = keys.phones.some(value => card.duplicateKeys?.phones?.includes(value));
    return { ...card, matchReason: emailMatch ? "Matching email address" : phoneMatch ? "Matching phone number" : "Matching name and company", matchRank: emailMatch ? 0 : phoneMatch ? 1 : 2 };
  }).sort((a, b) => a.matchRank - b.matchRank);
}

export async function createCard(db, user, input, now = new Date(), options = {}) {
  requireAction(user, "capture_card");
  const status = input.status || (pilot.internalReviewEnabled ? "draft" : "submitted");
  // PILOT: preserve the old draft creation branch, but start new contacts in Pending Review.
  if (!pilot.internalReviewEnabled && status !== "submitted") fail("STATE_INVALID", 400, "New pilot contacts must be submitted as Pending Review.");
  if (!RECORD_STATES.includes(status) || !["draft", "submitted"].includes(status)) fail("STATE_INVALID", 400, "Record state is invalid.");
  if (status === "submitted") requireAction(user, "submit_own_draft", { tenantId: user.tenantId, capturedBy: user.id });
  const data = input.verifiedData || {};
  if (!pilot.internalReviewEnabled && status === "submitted") validatePilotContact(data);
  const keys = duplicateKeys(data);
  const matches = await matchingCards(db, user.tenantId, data);
  if (!input.allowDuplicate) {
    const existing = matches[0];
    if (existing) fail("DUPLICATE_FOUND", 409, "A possible matching record already exists.", { duplicate: { ...duplicateResult(user, existing), matchReason: existing.matchReason } });
  }
  let image = null;
  if (input.imageBase64) {
    image = Buffer.from(input.imageBase64, "base64");
    if (image.length > IMAGE_LIMIT_BYTES) fail("IMAGE_TOO_LARGE", 413, "The card image is too large.");
  }
  const payload = {
    source: input.source === "manual" ? "manual" : "ocr",
    rawOCRText: String(input.rawOCRText || ""),
    ocrData: input.ocrData || {},
    verifiedData: data,
    originalFileName: String(input.originalFileName || "card.jpg"),
    isDemo: Boolean(input.isDemo),
  };
  const identity = pilot.submissionOnlyEnabled && !pilot.internalReviewEnabled
    ? await allocateRecordId(db, now, options.sheet?.env || process.env) : {};
  const card = {
    ...identity,
    tenantId: user.tenantId,
    capturedBy: new ObjectId(user.id),
    capturedByName: user.name || "Capturer",
    status,
    createdAt: now,
    updatedAt: now,
    capturedAt: now,
    obtainedAt: now,
    lastConfirmedAt: now,
    verifiedAt: status === "submitted" ? now : null,
    ...(pilot.constantContactEnabled ? { transferStatus: "not_started" } : {}),
    sheetStatus: status === "submitted" ? "pending" : "not_started",
    // SUBMISSION-ONLY PILOT: bind new delivery jobs to this Sheet. Old testing jobs
    // must not be migrated into the client's new register by an administrator retry.
    ...(pilot.submissionOnlyEnabled ? { sheetTarget: `${(options.sheet?.env || process.env).GOOGLE_SHEET_ID || (options.sheet?.env || process.env).GOOGLE_SHEET_TEST_ID || ""}:${(options.sheet?.env || process.env).GOOGLE_SHEET_TAB || "Contacts"}` } : {}),
    ...(!pilot.internalReviewEnabled && status === "submitted" ? { sheetWritePending: true } : {}),
    payload: encryptValue(payload),
    duplicateKeys: keys,
    duplicateReview: matches.length ? { state: "pending", candidateIds: matches.map(card => String(card._id)), reason: matches[0].matchReason } : null,
    hasImage: false,
  };
  const inserted = await db.collection("cards").insertOne(card);
  const retentionHours = image ? await getRetentionHours(db, user.tenantId) : 0;
  if (image && retentionHours > 0) {
    const expiresAt = new Date(now.getTime() + retentionHours * 60 * 60 * 1000);
    await db.collection("cardImages").insertOne({ tenantId: user.tenantId, cardId: inserted.insertedId, encryptedImage: encryptValue(image), mimeType: input.imageMimeType || "image/jpeg", byteLength: image.length, createdAt: now, expiresAt });
    card.hasImage = true;
    card.imageExpiresAt = expiresAt;
    await db.collection("cards").updateOne({ _id: inserted.insertedId, tenantId: user.tenantId }, { $set: { hasImage: true, imageExpiresAt: expiresAt } });
  }
  await writeAudit(db, { tenantId: user.tenantId, actor: user, action: "upload", recordRef: inserted.insertedId, outcome: "success", now });
  let publicCard = toPublic({ ...card, _id: inserted.insertedId });
  if (status === "submitted") {
    try {
      const result = await syncContactSheet(db, publicCard, options.sheet);
      const sheetStatus = result.skipped ? "not_configured" : "submitted";
      await db.collection("cards").updateOne({ _id: inserted.insertedId, tenantId: user.tenantId }, { $set: { sheetStatus } });
      publicCard.sheetStatus = sheetStatus;
      } catch (error) {
        const sheetError = sheetFailure(error);
        console.warn("Google Sheet synchronization:", sheetError.code);
        await db.collection("cards").updateOne({ _id: inserted.insertedId, tenantId: user.tenantId }, { $set: { sheetStatus: "failed", sheetError } });
        publicCard.sheetStatus = "failed";
        publicCard.sheetError = sheetError;
    }
  }
  return publicCard;
}

export async function getCard(db, user, id) {
  const card = await db.collection("cards").findOne({ _id: cardId(id), tenantId: user.tenantId });
  if (!card || !canRead(user, card)) fail("CARD_NOT_FOUND", 404, "Record not found.");
  return toPublic(card);
}

export async function listCards(db, user) {
  let query;
  if (user.role === "exhibition_assistant") {
    requireAction(user, "view_own_draft");
    if (!pilot.internalReviewEnabled) await synchronizePilotSheet(db, user.tenantId);
    else { try { await refreshStatusesFromSheet(db, user.tenantId); } catch {} }
    query = { tenantId: user.tenantId, capturedBy: new ObjectId(user.id) };
  } else if (user.role === "aventure_reviewer" || user.role === "vision71_administrator") {
    requireAction(user, "view_review_queue");
    if (!pilot.internalReviewEnabled) await synchronizePilotSheet(db, user.tenantId);
    else { try { await refreshStatusesFromSheet(db, user.tenantId); } catch {} }
    query = { tenantId: user.tenantId };
  } else fail("FORBIDDEN", 403, "Access denied.");
  const rawCards = await db.collection("cards").find(query).sort({ createdAt: -1 }).toArray();
  const capturerIds = [...new Set(rawCards.map((c) => c.capturedBy?.toString()).filter(Boolean))].map((id) => new ObjectId(id));
  const capturers = capturerIds.length > 0 ? await db.collection("users").find({ _id: { $in: capturerIds } }, { projection: { _id: 1, name: 1, email: 1 } }).toArray() : [];
  const capturerMap = new Map(capturers.map((u) => [u._id.toString(), u.name || u.email]));
  const records = rawCards.map((card) => {
    const pub = toPublic(card);
    if (card.status === "submitted" && !card.duplicateReview && user.role !== "exhibition_assistant") {
      const keys = card.duplicateKeys || {};
      const candidates = rawCards.filter(other => !other._id.equals(card._id) && other.status !== "rejected" && (
        (keys.email && keys.email === other.duplicateKeys?.email) ||
        keys.phones?.some(value => other.duplicateKeys?.phones?.includes(value)) ||
        (keys.nameCompany && keys.nameCompany === other.duplicateKeys?.nameCompany)
      ));
      if (candidates.length) pub.duplicateReview = { state: "pending", candidateIds: candidates.map(other => String(other._id)), reason: candidates.some(other => keys.email && keys.email === other.duplicateKeys?.email) ? "Matching email address" : "Matching contact details" };
    }
    if (!pub.capturedByName && card.capturedBy) {
      pub.capturedByName = capturerMap.get(card.capturedBy.toString()) || "";
    }
    return pub;
  });
  return records;
}

export async function updateCard(db, user, id, input, now = new Date(), options = {}) {
  // PILOT: Administrator manages the system; only capturers edit/resubmit contacts.
  if (!pilot.internalReviewEnabled && user.role !== "exhibition_assistant") fail("FORBIDDEN", 403, "Contact review takes place in Google Sheets.");
  const _id = cardId(id);
  const card = await db.collection("cards").findOne({ _id, tenantId: user.tenantId });
  if (pilot.constantContactEnabled && card?.ccLease > now) fail("TRANSFER_IN_PROGRESS", 409, "A transfer is being checked. Retry this change shortly.");
  if (card?.sheetSyncLease > now) fail("SHEET_SYNC_BUSY", 409, "This contact is syncing. Please retry shortly.");
  if (!card) fail("CARD_NOT_FOUND", 404, "Record not found.");
  if (user.role === "exhibition_assistant") {
    requireAction(user, "correct_own_draft", card);
    if (!["draft", "correction_requested"].includes(card.status)) fail("STATE_INVALID", 409, "This record cannot be changed.");
  } else if (user.role === "aventure_reviewer" || user.role === "vision71_administrator") {
    if (input.verifiedData) requireAction(user, "correct_submitted_card", card);
  } else {
    fail("FORBIDDEN", 403, "Access denied.");
  }
  const existing = decryptValue(card.payload);
  const payload = { ...existing, verifiedData: input.verifiedData || existing.verifiedData };
  const nextState = input.status || card.status;
  if (!pilot.internalReviewEnabled && nextState === "submitted") validatePilotContact(payload.verifiedData);
  if (pilot.internalReviewEnabled && card.duplicateReview?.state === "resolved" && card.duplicateReview.decision !== "keep_both" && nextState !== "rejected") fail("REVIEW_ALREADY_COMPLETED", 409, "This duplicate submission was closed by the reviewer and cannot be reopened.");
  if (!RECORD_STATES.includes(nextState)) fail("STATE_INVALID", 400, "Record state is invalid.");
  if (user.role === "exhibition_assistant") {
    if (nextState !== card.status && nextState !== "submitted") fail("STATE_INVALID", 409, "This record cannot enter that state.");
    if (nextState === "submitted") requireAction(user, "submit_own_draft", card);
  }
  if (user.role === "aventure_reviewer" || user.role === "vision71_administrator") {
    if (nextState !== card.status) {
      if (!["approved", "rejected", "correction_requested", "submitted"].includes(nextState)) {
        fail("STATE_INVALID", 409, "This record cannot enter that state.");
      }
      if (nextState === "approved") requireAction(user, "approve_card", card);
      if (nextState === "rejected") requireAction(user, "reject_card", card);
      if (nextState === "correction_requested") requireAction(user, "request_correction", card);
    }
  }
  if (nextState === "approved" && card.duplicateReview?.state !== "resolved") {
    const matches = await matchingCards(db, user.tenantId, payload.verifiedData, _id);
    if (card.duplicateReview?.state === "pending" || matches.length) fail("DUPLICATE_REVIEW_REQUIRED", 409, "Compare the possible existing records and choose a duplicate decision before approving.");
  }
  const metadata = {
    payload: encryptValue(payload),
    duplicateKeys: duplicateKeys(payload.verifiedData),
    status: nextState,
    updatedAt: now,
    verifiedAt: nextState === "submitted" ? now : card.verifiedAt,
    lastConfirmedAt: now,
    // PILOT: marks a durable outbound change; status readers must not undo it.
    ...(nextState === "submitted" ? { sheetStatus: "pending", ...(!pilot.internalReviewEnabled ? { sheetWritePending: true } : {}) } : {}),
  };
  if (nextState === "approved") {
    requireAction(user, "approve_card", card);
    if (pilot.constantContactEnabled) Object.assign(metadata, approvalTransfer(card, user, now));
  }
  if (user.role === "aventure_reviewer" || user.role === "vision71_administrator") {
    if (nextState !== card.status) {
      metadata.reviewedBy = new ObjectId(user.id);
      metadata.reviewedByName = user.name || "Reviewer";
      metadata.reviewedAt = now;
    }
    if (input.reviewerComment !== undefined) {
      metadata.reviewerComment = String(input.reviewerComment || "");
    }
  }
  const saved = await db.collection("cards").updateOne({ _id, tenantId: user.tenantId, updatedAt: card.updatedAt, $and: [
    { $or: [{ sheetSyncLease: { $exists: false } }, { sheetSyncLease: { $lte: now } }] },
    ...(pilot.constantContactEnabled ? [{ $or: [{ ccLease: { $exists: false } }, { ccLease: { $lte: now } }] }] : []),
  ] }, { $set: metadata });
  if (!saved.matchedCount) fail("TRANSFER_IN_PROGRESS", 409, "A transfer started while saving. Reload shortly.");
  const action = nextState === "approved" ? "approval" : nextState === "rejected" ? "rejection" : "correction";
  await writeAudit(db, { tenantId: user.tenantId, actor: user, action, recordRef: _id, outcome: "success", now });
  // PILOT: automatic Constant Contact transfer retained but suspended.
  if (pilot.constantContactEnabled && nextState === "approved") await transferApproved(db, _id, user.tenantId);
  let updated = toPublic(await db.collection("cards").findOne({ _id, tenantId: user.tenantId }));
  try {
    const result = nextState === "draft" ? { skipped: true } : await syncContactSheet(db, updated, options.sheet);
    if (!result.skipped) {
      const displayStatus = nextState === "approved" ? "Approved" : nextState === "rejected" ? "Rejected" : nextState === "correction_requested" ? "Needs Correction" : updated.status;
      await db.collection("cards").updateOne({ _id, tenantId: user.tenantId }, { $set: { sheetStatus: displayStatus }, $unset: { sheetError: "" } });
      updated.sheetStatus = displayStatus;
      updated.sheetError = null;
    }
    else if (nextState !== "draft") {
      await db.collection("cards").updateOne({ _id, tenantId: user.tenantId }, { $set: { sheetStatus: "not_configured" } });
      updated.sheetStatus = "not_configured";
    }
  } catch (error) {
    const sheetError = sheetFailure(error);
    console.warn("Google Sheet synchronization:", sheetError.code);
    await db.collection("cards").updateOne({ _id, tenantId: user.tenantId }, { $set: { sheetStatus: "failed", sheetError } });
    updated.sheetStatus = "failed";
    updated.sheetError = sheetError;
  }
  return updated;
}

export async function getCardImage(db, user, id) {
  const _id = cardId(id);
  const card = await db.collection("cards").findOne({ _id, tenantId: user.tenantId });
  if (!card || !canRead(user, card)) fail("CARD_NOT_FOUND", 404, "Record not found.");
  const image = await db.collection("cardImages").findOne({ cardId: _id, tenantId: user.tenantId });
  if (!image) return null;
  return { data: decryptValue(image.encryptedImage, true), mimeType: image.mimeType, expiresAt: image.expiresAt };
}

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

export async function deleteCard(db, user, id, now = new Date()) {
  requireAction(user, "delete_record");
  const _id = cardId(id);
  const card = await db.collection("cards").findOne({ _id, tenantId: user.tenantId }, { projection: { _id: 1 } });
  if (!card) fail("CARD_NOT_FOUND", 404, "Record not found.");
  await db.collection("cardImages").deleteMany({ cardId: _id, tenantId: user.tenantId });
  await db.collection("cards").deleteOne({ _id, tenantId: user.tenantId });
  await writeAudit(db, { tenantId: user.tenantId, actor: user, action: "deletion", recordRef: _id, outcome: "success", now });
}
