import { decryptValue } from "../security/encryption.js";
import { requireAction } from "../auth/permissions.js";
import { writeAudit } from "../audit/service.js";
import { refreshStatusesFromSheet, sheetRow, pilotColumns, pilotHeaders } from "../integrations/sheetService.js";
import { pilot } from "../pilot.js";
import mapping from "../../config/sheetMapping.json" with { type: "json" };

export function safeCsv(value) {
  const text = String(value ?? "").replace(/^[=+\-@]/, (prefix) => `'${prefix}`).replaceAll('"', '""');
  return `"${text}"`;
}

export async function exportApprovedCsv(db, actor, options = {}) {
  requireAction(actor, "end_pilot_export");
  try { await refreshStatusesFromSheet(db, actor.tenantId, options.sheet || {}); } catch {}
  const cards = await db.collection("cards").find({ tenantId: actor.tenantId, status: "approved" }).sort({ createdAt: 1 }).toArray();
  // PILOT: broad export mapping retained; export only current pilot fields.
  const headings = pilot.internalReviewEnabled ? mapping.columns.map(column => column.header) : pilotHeaders();
  const userIds = [...new Set(cards.map((card) => String(card.capturedBy)))];
  const users = userIds.length ? await db.collection("users").find({ tenantId: actor.tenantId }).toArray() : [];
  const names = new Map(users.map((user) => [String(user._id), user.name]));
  const rows = cards.map((card) => {
    const data = decryptValue(card.payload).verifiedData || {};
    const row = sheetRow({ ...card, id: String(card._id), verifiedData: data }, { capturedByName: names.get(String(card.capturedBy)) || card.capturedByName || "", reviewedByName: card.reviewedByName || "" });
    return (pilot.internalReviewEnabled ? row : pilotColumns.map(column => row[mapping.columns.findIndex(item => item.field === column.field)])).map(safeCsv).join(",");
  });
  await writeAudit(db, { tenantId: actor.tenantId, actor, action: "export", recordRef: `approved_count:${cards.length}`, outcome: "success" });
  return { csv: [headings.map(safeCsv).join(","), ...rows].join("\r\n"), count: cards.length };
}
