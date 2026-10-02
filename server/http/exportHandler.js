import { getDb, ensureDatabaseIndexes } from "../db.js";
import { authenticate } from "../auth/service.js";
import { parseCookies, SESSION_COOKIE } from "../auth/cookies.js";
import { exportApprovedCsv } from "../export/service.js";

export default async function exportHandler(req, res) {
  try {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });
    const db = await getDb();
    await ensureDatabaseIndexes(db);
    const token = parseCookies(req.headers.cookie || "")[SESSION_COOKIE];
    const auth = await authenticate(db, token);
    const result = await exportApprovedCsv(db, auth.user);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=lead71-approved-contacts.csv");
    return res.status(200).send(result.csv);
  } catch (error) {
    return res.status(error.status || 500).json({ code: error.code || "SERVER_ERROR", error: error.status ? error.message : "The request could not be completed." });
  }
}
