import { ObjectId } from "mongodb";
import { blindIndex, decryptValue, encryptValue } from "../security/encryption.js";
import { requireAction } from "../auth/permissions.js";

export const RECORD_STATES = ["draft", "submitted", "correction_requested", "approved", "rejected", "transferred"];
const IMAGE_LIMIT_BYTES = 500 * 1024;

function fail(code, status, message, extra = {}) {
  throw Object.assign(new Error(message), { code, status, ...extra });
}

function normalized(value) {
  return String(value || "").trim().toLocaleLowerCase("en");
}

function phone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 7 ? digits : "";
}

function duplicateKeys(data) {
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

function queryForDuplicates(tenantId, keys, excludingId) {
  const alternatives = [];
  if (keys.email) alternatives.push({ "duplicateKeys.email": keys.email });
  if (keys.phones.length) alternatives.push({ "duplicateKeys.phones": { $in: keys.phones } });
  if (keys.nameCompany) alternatives.push({ "duplicateKeys.nameCompany": keys.nameCompany });
  if (!alternatives.length) return null;
  const query = { tenantId, $or: alternatives };
  if (excludingId) query._id = { $ne: excludingId };
  return query;
}

function toPublic(card) {
  const payload = decryptValue(card.payload);
  return {
    id: String(card._id),
    tenantId: card.tenantId,
    capturedBy: String(card.capturedBy),
    status: card.status,
    createdAt: card.createdAt.toISOString(),
    updatedAt: card.updatedAt.toISOString(),
    verifiedAt: card.verifiedAt?.toISOString(),
    hasImage: Boolean(card.hasImage),
    imageExpiresAt: card.imageExpiresAt?.toISOString() || null,
    ...payload,
  };
}

function cardId(id) {
  if (!ObjectId.isValid(id)) fail("CARD_NOT_FOUND", 404, "Record not found.");
  return new ObjectId(id);
}

function canRead(user, card) {
  if (card.tenantId !== user.tenantId) return false;
  if (user.role === "aventure_reviewer") return true;
  return user.role === "exhibition_assistant" && String(card.capturedBy) === user.id && ["draft", "correction_requested"].includes(card.status);
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
  const match = await db.collection("cards").findOne(query);
  return match ? duplicateResult(user, match) : null;
}

export async function createCard(db, user, input, now = new Date()) {
  requireAction(user, "capture_card");
  const status = input.status || "draft";
  if (!RECORD_STATES.includes(status) || !["draft", "submitted"].includes(status)) fail("STATE_INVALID", 400, "Record state is invalid.");
  if (status === "submitted") requireAction(user, "submit_own_draft", { tenantId: user.tenantId, capturedBy: user.id });
  const data = input.verifiedData || {};
  const keys = duplicateKeys(data);
  if (!input.allowDuplicate) {
    const query = queryForDuplicates(user.tenantId, keys);
    const existing = query ? await db.collection("cards").findOne(query) : null;
    if (existing) fail("DUPLICATE_FOUND", 409, "A possible matching record already exists.", { duplicate: duplicateResult(user, existing) });
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
  const card = {
    tenantId: user.tenantId,
    capturedBy: new ObjectId(user.id),
    status,
    createdAt: now,
    updatedAt: now,
    verifiedAt: status === "submitted" ? now : null,
    payload: encryptValue(payload),
    duplicateKeys: keys,
    hasImage: Boolean(image),
  };
  const inserted = await db.collection("cards").insertOne(card);
  if (image) {
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    await db.collection("cardImages").insertOne({ tenantId: user.tenantId, cardId: inserted.insertedId, encryptedImage: encryptValue(image), mimeType: input.imageMimeType || "image/jpeg", byteLength: image.length, createdAt: now, expiresAt });
    card.imageExpiresAt = expiresAt;
    await db.collection("cards").updateOne({ _id: inserted.insertedId, tenantId: user.tenantId }, { $set: { imageExpiresAt: expiresAt } });
  }
  return toPublic({ ...card, _id: inserted.insertedId });
}

export async function getCard(db, user, id) {
  const card = await db.collection("cards").findOne({ _id: cardId(id), tenantId: user.tenantId });
  if (!card || !canRead(user, card)) fail("CARD_NOT_FOUND", 404, "Record not found.");
  return toPublic(card);
}

export async function listCards(db, user) {
  let query;
  if (user.role === "aventure_reviewer") {
    requireAction(user, "view_review_queue");
    query = { tenantId: user.tenantId, status: { $in: ["submitted", "correction_requested", "approved", "rejected", "transferred"] } };
  } else {
    requireAction(user, "view_own_draft");
    query = { tenantId: user.tenantId, capturedBy: new ObjectId(user.id), status: { $in: ["draft", "correction_requested"] } };
  }
  return (await db.collection("cards").find(query).sort({ createdAt: -1 }).toArray()).map(toPublic);
}

export async function updateCard(db, user, id, input, now = new Date()) {
  const _id = cardId(id);
  const card = await db.collection("cards").findOne({ _id, tenantId: user.tenantId });
  if (!card) fail("CARD_NOT_FOUND", 404, "Record not found.");
  if (user.role === "exhibition_assistant") {
    requireAction(user, "correct_own_draft", card);
    if (!["draft", "correction_requested"].includes(card.status)) fail("STATE_INVALID", 409, "This record cannot be changed.");
  } else {
    requireAction(user, "correct_submitted_card", card);
  }
  const existing = decryptValue(card.payload);
  const payload = { ...existing, verifiedData: input.verifiedData || existing.verifiedData };
  const nextState = input.status || card.status;
  if (!RECORD_STATES.includes(nextState)) fail("STATE_INVALID", 400, "Record state is invalid.");
  if (user.role === "exhibition_assistant" && nextState === "submitted") requireAction(user, "submit_own_draft", card);
  await db.collection("cards").updateOne({ _id, tenantId: user.tenantId }, { $set: { payload: encryptValue(payload), duplicateKeys: duplicateKeys(payload.verifiedData), status: nextState, updatedAt: now, verifiedAt: nextState === "submitted" ? now : card.verifiedAt } });
  return toPublic(await db.collection("cards").findOne({ _id, tenantId: user.tenantId }));
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
