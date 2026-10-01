import { equalSecret } from "./retentionHandlers.js";
import { getDb } from "../db.js";
import { processTransfers } from "../integrations/constantContact.js";
export default async function constantContactCron(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  if (!equalSecret(req.headers["x-cron-secret"], process.env.CRON_SECRET)) return res.status(401).json({ error: "Unauthorized." });
  try { return res.json({ processed: await processTransfers(await getDb()) }); }
  catch { return res.status(500).json({ error: "Transfer processing failed." }); }
}
