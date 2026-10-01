import { ObjectId } from "mongodb";
import { matchingCards, toPublic, duplicateKeys } from "./service.js";
import { requireAction } from "../auth/permissions.js";
import { decryptValue, encryptValue } from "../security/encryption.js";
import { writeAudit } from "../audit/service.js";
import { updateSheetRecord } from "../integrations/sheetService.js";
import { approvalTransfer, transferApproved } from "../integrations/constantContact.js";

const fail = (code, status, message) => { throw Object.assign(new Error(message), { code, status }); };
const fields = new Set(["fullName", "companyName", "jobTitle", "email", "phone", "alternatePhone", "website", "address", "city", "country", "notes", "metAtLocation", "whereMet"]);
const contextFields = new Set(["metAtLocation", "whereMet"]);

function validateReviewedData(data) {
  if (!data.fullName?.trim() && !data.companyName?.trim()) fail("CONTACT_INVALID", 400, "Keep a contact name or company.");
  if (!data.email?.trim() && !data.phone?.trim()) fail("CONTACT_INVALID", 400, "Keep an email or phone.");
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) fail("CONTACT_INVALID", 400, "Correct the email address before approving.");
  if (!data.meetingContext?.metAtLocation?.trim()) fail("CONTACT_INVALID", 400, "Select an exhibition / source before approving.");
}

export function applySelectedFields(existing, incoming, selected) {
  if (!Array.isArray(selected) || !selected.length || selected.some(field => !fields.has(field))) fail("FIELDS_INVALID", 400, "Select valid fields to update.");
  const result = { ...existing, meetingContext: { ...existing.meetingContext } };
  for (const field of new Set(selected)) {
    const value = contextFields.has(field) ? incoming.meetingContext?.[field] : incoming[field];
    if (typeof value !== "string") fail("FIELDS_INVALID", 400, "Selected fields must contain text.");
    if (contextFields.has(field)) result.meetingContext[field] = value.trim();
    else result[field] = field === "email" ? value.trim().toLowerCase() : value.trim();
  }
  return result;
}

function id(value) {
  if (!ObjectId.isValid(value)) fail("CARD_NOT_FOUND", 404, "Record not found.");
  return new ObjectId(value);
}

export async function duplicateReviewContext(db, user, recordId, session) {
  requireAction(user, "view_review_queue");
  const card = await db.collection("cards").findOne({ _id: id(recordId), tenantId: user.tenantId }, session ? { session } : {});
  if (!card) fail("CARD_NOT_FOUND", 404, "Record not found.");
  const matches = await matchingCards(db, user.tenantId, decryptValue(card.payload).verifiedData, card._id, session);
  // Keep capture-time candidates visible even if the new contact has since been edited.
  const linked = (card.duplicateReview?.candidateIds || []).filter(ObjectId.isValid).map(value => new ObjectId(value));
  if (linked.length) {
    const saved = await db.collection("cards").find({ tenantId: user.tenantId, _id: { $in: linked, $ne: card._id } }, session ? { session } : {}).toArray();
    for (const match of saved) if (!matches.some(item => item._id.equals(match._id))) matches.push({ ...match, matchReason: "Flagged when this contact was submitted" });
  }
  return { record: toPublic(card), matches: matches.map(match => ({ ...toPublic(match), matchReason: match.matchReason })) };
}

export async function resolveDuplicate(db, user, recordId, input, now = new Date()) {
  requireAction(user, "view_review_queue");
  if (!["retain_existing", "update_existing", "keep_both", "reject_new"].includes(input.decision)) fail("DECISION_INVALID", 400, "Choose a duplicate decision.");
  const session = db.client.startSession();
  let affectedIds = [];
  try {
    await session.withTransaction(async () => {
      const { record, matches } = await duplicateReviewContext(db, user, recordId, session);
      const activeTransfers = await db.collection("cards").findOne({ tenantId: user.tenantId, _id: { $in: [id(record.id), ...matches.map(match => id(match.id))] }, ccLease: { $gt: now } }, { session });
      if (activeTransfers) fail("TRANSFER_IN_PROGRESS", 409, "A compared record is transferring. Reload shortly.");
      if (record.duplicateReview?.state === "resolved" || record.status !== "submitted") fail("REVIEW_ALREADY_COMPLETED", 409, "This submission has already been reviewed. Reload the queue.");
      if (!input.expectedUpdatedAt || record.updatedAt !== input.expectedUpdatedAt) fail("REVIEW_STALE", 409, "The new submission changed. Reload and compare again.");
      if (!matches.length && record.duplicateReview?.state !== "pending") fail("NO_DUPLICATE", 409, "No possible existing record remains. Reload the review.");
      // All visible candidates are version checked, including keep-both decisions.
      for (const match of matches) {
        if (input.expectedMatches?.[match.id] !== match.updatedAt) fail("REVIEW_STALE", 409, "A possible existing record changed. Reload and compare again.");
      }
      const target = matches.find(match => match.id === input.existingId);
      if (["retain_existing", "update_existing"].includes(input.decision) && !target) fail("MATCH_INVALID", 409, "Select an existing record from the comparison.");
      if (input.decision === "keep_both") requireAction(user, "approve_card", { ...record, capturedBy: record.capturedBy });
      else requireAction(user, "reject_card", record);
      const resolution = { state: "resolved", decision: input.decision, existingId: target?.id || null, candidateIds: matches.map(match => match.id), resolvedBy: user.id, resolvedAt: now.toISOString(), updatedFields: input.decision === "update_existing" ? input.fields : [] };
      if (input.decision === "keep_both") validateReviewedData(record.verifiedData);
      affectedIds = [record.id];
      if (input.decision === "update_existing") {
        requireAction(user, "correct_submitted_card", target);
        requireAction(user, "approve_card", target);
        requireAction(user, "approve_card", record);
        if (target.status === "rejected" || target.status === "transferred" || target.duplicateReview?.state === "pending") fail("TARGET_STATE_INVALID", 409, "Choose an active existing record without an unresolved duplicate review.");
        const rawTarget = await db.collection("cards").findOne({ _id: id(target.id), tenantId: user.tenantId }, { session });
        const payload = decryptValue(rawTarget.payload);
        const updatedData = applySelectedFields(payload.verifiedData, record.verifiedData, input.fields);
        validateReviewedData(updatedData);
        await db.collection("cards").updateOne({ _id: rawTarget._id }, { $set: approvalTransfer(rawTarget, user, now) }, { session });
        await db.collection("cards").updateOne({ _id: rawTarget._id, tenantId: user.tenantId }, { $set: { payload: encryptValue({ ...payload, verifiedData: updatedData }), duplicateKeys: duplicateKeys(updatedData), updatedAt: now, lastConfirmedAt: now, status: "approved", reviewedBy: new ObjectId(user.id), reviewedByName: user.name || "Reviewer", reviewedAt: now } }, { session });
        affectedIds.push(target.id);
      }
      const status = input.decision === "keep_both" ? "approved" : "rejected";
      if (status === "approved") await db.collection("cards").updateOne({ _id: id(record.id) }, { $set: approvalTransfer(record, user, now) }, { session });
      const comment = { retain_existing: "Duplicate review: retained the existing record; closed this submission.", update_existing: "Duplicate review: selected fields applied to the existing record; closed this submission.", keep_both: "Duplicate review: approved as a separate contact; existing records unchanged.", reject_new: "Duplicate review: rejected the new submission; existing records unchanged." }[input.decision];
      await db.collection("cards").updateOne({ _id: id(record.id), tenantId: user.tenantId }, { $set: { status, updatedAt: now, lastConfirmedAt: now, duplicateReview: resolution, reviewedBy: new ObjectId(user.id), reviewedByName: user.name || "Reviewer", reviewedAt: now, reviewerComment: comment } }, { session });
      await writeAudit(db, { tenantId: user.tenantId, actor: user, action: "review", recordRef: record.id, now, details: resolution, session });
    });
  } finally { await session.endSession(); }
  // External Sheets cannot participate in the MongoDB transaction. Flag sync failures.
  for (const affectedId of affectedIds) {
    await transferApproved(db, id(affectedId), user.tenantId);
    const raw = await db.collection("cards").findOne({ _id: id(affectedId), tenantId: user.tenantId });
    try {
      const result = await updateSheetRecord(db, toPublic(raw));
      await db.collection("cards").updateOne({ _id: raw._id }, { $set: { sheetStatus: result.skipped ? "not_configured" : raw.status } });
    } catch { await db.collection("cards").updateOne({ _id: raw._id }, { $set: { sheetStatus: "failed" } }); }
  }
  return toPublic(await db.collection("cards").findOne({ _id: id(recordId), tenantId: user.tenantId }));
}
