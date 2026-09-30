import { ObjectId } from "mongodb";
import { requireAction } from "../auth/permissions.js";
import { writeAudit } from "../audit/service.js";

export async function getRetentionHours(db, tenantId) {
  const setting = await db.collection("settings").findOne({ tenantId, key: "retentionHours" });
  return setting?.value ?? 24;
}

export async function setRetentionHours(db, user, value, now = new Date()) {
  requireAction(user, "change_retention");
  if (!Number.isInteger(value) || value < 0 || value > 168) throw Object.assign(new Error("Retention must be a whole number from 0 to 168 hours."), { code: "RETENTION_INVALID", status: 400 });
  await db.collection("settings").updateOne({ tenantId: user.tenantId, key: "retentionHours" }, { $set: { tenantId: user.tenantId, key: "retentionHours", value, updatedAt: now, updatedBy: new ObjectId(user.id) } }, { upsert: true });
  await writeAudit(db, { tenantId: user.tenantId, actor: user, action: "retention_change", recordRef: "retentionHours", outcome: "success", now });
  return value;
}

export async function sweepExpiredImages(db, { tenantId, now = new Date(), actor = { id: "system", role: "system" } } = {}) {
  const query = { expiresAt: { $lte: now } };
  if (tenantId) query.tenantId = tenantId;
  const expired = await db.collection("cardImages").find(query, { projection: { _id: 1, tenantId: 1, cardId: 1, expiresAt: 1 } }).toArray();
  let deleted = 0;
  for (const image of expired) {
    const result = await db.collection("cardImages").deleteOne({ _id: image._id, expiresAt: { $lte: now } });
    if (!result.deletedCount) continue;
    deleted += 1;
    await db.collection("cards").updateOne({ _id: image.cardId, tenantId: image.tenantId }, { $set: { hasImage: false, imageExpiredAt: now }, $unset: { imageExpiresAt: "" } });
    await writeAudit(db, { tenantId: image.tenantId, actor, action: "image_deleted", recordRef: image.cardId, outcome: "success", now });
  }
  return { scanned: expired.length, deleted };
}
