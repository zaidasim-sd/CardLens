import { equalSecret } from "./retentionHandlers.js";
import { getDb } from "../db.js";
import { processTransfers } from "../integrations/constantContact.js";
import { pilot } from "../pilot.js";
export default async function constantContactCron(req, res) {
  if(process.env.CC_STAGING_TEST_MODE==='true'||process.env.CC_PERSONAL_STAGING_ENABLED==='true')return res.status(403).json({code:'STAGING_CRON_DISABLED',error:'Background Constant Contact transfers are disabled for the controlled staging test.'});
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  if (!equalSecret(req.headers["x-cron-secret"], process.env.CRON_SECRET)) return res.status(401).json({ error: "Unauthorized." });
  // PILOT: cron endpoint preserved; no database/provider work while disabled.
  if (!pilot.constantContactEnabled) return res.json({ processed: 0, disabled: true });
  try { return res.json({ processed: await processTransfers(await getDb()) }); }
  catch { return res.status(500).json({ error: "Transfer processing failed." }); }
}
