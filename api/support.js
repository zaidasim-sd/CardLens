import { getDb, ensureDatabaseIndexes } from "../server/db.js";
import { authenticate } from "../server/auth/service.js";
import { parseCookies, SESSION_COOKIE } from "../server/auth/cookies.js";
import { aggregateCounts } from "../server/support/service.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });
    const db = await getDb();
    await ensureDatabaseIndexes(db);
    const token = parseCookies(req.headers.cookie || "")[SESSION_COOKIE];
    const auth = await authenticate(db, token);
    return res.status(200).json(await aggregateCounts(db, auth.user));
  } catch (error) {
    return res.status(error.status || 500).json({ code: error.code || "SERVER_ERROR", error: error.status ? error.message : "The request could not be completed." });
  }
}
