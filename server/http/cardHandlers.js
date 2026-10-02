import { getDb, ensureDatabaseIndexes } from "../db.js";
import { authenticate, verifyCsrf } from "../auth/service.js";
import { parseCookies, SESSION_COOKIE } from "../auth/cookies.js";
import { createCard, deleteCard, findDuplicate, getCard, getCardImage, listCards, storageHealth, updateCard, toPublic } from "../cards/service.js";
import { duplicateReviewContext, resolveDuplicate } from "../cards/duplicateReview.js";
import { requireAction } from "../auth/permissions.js";
import { diagnoseSheet, updateSheetRecord, sheetFailure } from "../integrations/sheetService.js";

function send(res, status, body) {
  return res.status(status).json(body);
}

function requestToken(req) {
  return parseCookies(req.headers.cookie || "")[SESSION_COOKIE];
}

async function context(req) {
  const db = await getDb();
  await ensureDatabaseIndexes(db);
  const auth = await authenticate(db, requestToken(req));
  return { db, auth };
}

function handleError(res, error) {
  if (!error.status || error.status >= 500) console.error("[cardsHandler error]", error);
  const body = { code: error.code || "SERVER_ERROR", error: error.status ? error.message : "The request could not be completed." };
  if (error.code === "DUPLICATE_FOUND") body.duplicate = error.duplicate;
  return send(res, error.status || 500, body);
}

export async function cardsHandler(req, res) {
  try {
    const { db, auth } = await context(req);
    const action = String(req.query?.action || "records");
    if (req.method === "GET" && action === "duplicate_review") return send(res, 200, await duplicateReviewContext(db, auth.user, req.query?.id));
    if (req.method === "GET" && action === "records") {
      if (req.query?.id) return send(res, 200, { record: await getCard(db, auth.user, req.query.id) });
      return send(res, 200, { records: await listCards(db, auth.user) });
    }
    if (req.method === "GET" && action === "image") {
      const image = await getCardImage(db, auth.user, req.query?.id);
      if (!image) return send(res, 404, { code: "IMAGE_NOT_FOUND", error: "Card image is unavailable." });
      return send(res, 200, { imageBase64: image.data.toString("base64"), mimeType: image.mimeType, expiresAt: image.expiresAt.toISOString() });
    }
    verifyCsrf(auth.session, req.headers["x-csrf-token"]);
    if (req.method === "POST" && action === "resolve_duplicate") return send(res, 200, { record: await resolveDuplicate(db, auth.user, req.query?.id, req.body) });
    if (req.method === "POST" && action === "duplicate") return send(res, 200, { duplicate: await findDuplicate(db, auth.user, req.body?.verifiedData, req.body?.excludingId) });
    if (req.method === "POST" && action === "records") return send(res, 201, { record: await createCard(db, auth.user, req.body) });
    if (req.method === "PATCH" && action === "records") return send(res, 200, { record: await updateCard(db, auth.user, req.query?.id, req.body) });
    if (req.method === "DELETE" && action === "records") {
      await deleteCard(db, auth.user, req.query?.id);
      return send(res, 200, { ok: true });
    }
    return send(res, 405, { error: "Method not allowed." });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function storageHealthHandler(req, res) {
  try {
    if (req.method !== "GET" && !(req.method === "POST" && req.query?.action === "sheet_retry")) return send(res, 405, { error: "Method not allowed." });
    const { db, auth } = await context(req);
    if (req.method === "POST" && req.query?.action === "sheet_retry") {
      requireAction(auth.user, "manage_users");
      verifyCsrf(auth.session, req.headers["x-csrf-token"]);
      const records = await db.collection("cards").find({ tenantId: auth.user.tenantId, sheetStatus: "failed", status: { $in: ["submitted", "approved", "rejected", "correction_requested", "transferred"] } }).limit(5).toArray();
      let synced = 0;
      for (const record of records) {
        try {
          const result = await updateSheetRecord(db, toPublic(record));
          if (result.skipped) throw { code: "SHEET_NOT_CONFIGURED" };
          await db.collection("cards").updateOne({ _id: record._id, tenantId: auth.user.tenantId }, { $set: { sheetStatus: record.status }, $unset: { sheetError: "" } });
          synced++;
        } catch (error) { await db.collection("cards").updateOne({ _id: record._id, tenantId: auth.user.tenantId }, { $set: { sheetError: sheetFailure(error) } }); }
      }
      return send(res, 200, { checked: records.length, synced, failed: records.length - synced });
    }
    if (req.query?.action === "sheet_health") {
      requireAction(auth.user, "manage_users");
      res.setHeader("Cache-Control", "no-store");
      return send(res, 200, await diagnoseSheet());
    }
    return send(res, 200, await storageHealth(db, auth.user));
  } catch (error) {
    return handleError(res, error);
  }
}
