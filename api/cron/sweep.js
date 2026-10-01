import { sweepHandler } from "../../server/http/retentionHandlers.js";
import constantContactCron from "../../server/http/constantContactCron.js";

export default function cronHandler(req, res) {
  if (req.query?.action === "constant_contact") return constantContactCron(req, res);
  return sweepHandler(req, res);
}
