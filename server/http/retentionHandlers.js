import { timingSafeEqual } from "node:crypto";
import { getDb, ensureDatabaseIndexes } from "../db.js";
import { authenticate, verifyCsrf } from "../auth/service.js";
import { parseCookies, SESSION_COOKIE } from "../auth/cookies.js";
import { requireAction } from "../auth/permissions.js";
import { getRetentionHours, setRetentionHours, sweepExpiredImages } from "../retention/service.js";

export function equalSecret(provided, expected) {
  if (!provided || !expected) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function sweepHandler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
    if (!equalSecret(req.headers["x-cron-secret"], process.env.CRON_SECRET)) return res.status(401).json({ code: "UNAUTHENTICATED", error: "The sweep request was refused." });
    const db = await getDb();
    await ensureDatabaseIndexes(db);
    return res.status(200).json(await sweepExpiredImages(db));
  } catch {
    return res.status(500).json({ code: "SERVER_ERROR", error: "The sweep could not be completed." });
  }
}

export async function retentionSettingsHandler(req, res) {
  try {
    const db = await getDb();
    await ensureDatabaseIndexes(db);
    const sessionToken = parseCookies(req.headers.cookie || "")[SESSION_COOKIE];
    const auth = await authenticate(db, sessionToken);
    requireAction(auth.user, "change_retention");
    if (req.method === "GET") return res.status(200).json({ retentionHours: await getRetentionHours(db, auth.user.tenantId) });
    if (req.method === "PUT") {
      verifyCsrf(auth.session, req.headers["x-csrf-token"]);
      return res.status(200).json({ retentionHours: await setRetentionHours(db, auth.user, req.body?.retentionHours) });
    }
    return res.status(405).json({ error: "Method not allowed." });
  } catch (error) {
    return res.status(error.status || 500).json({ code: error.code || "SERVER_ERROR", error: error.status ? error.message : "The request could not be completed." });
  }
}
