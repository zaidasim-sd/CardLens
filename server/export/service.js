import { decryptValue } from "../security/encryption.js";
import { requireAction } from "../auth/permissions.js";
import { writeAudit } from "../audit/service.js";
import { refreshStatusesFromSheet } from "../integrations/sheetService.js";

export function safeCsv(value) {
  const text = String(value ?? "").replace(/^[=+\-@]/, (prefix) => `'${prefix}`).replaceAll('"', '""');
  return `"${text}"`;
}

export async function exportApprovedCsv(db, actor, options = {}) {
  requireAction(actor, "end_pilot_export");
  try { await refreshStatusesFromSheet(db, actor.tenantId, options.sheet || {}); } catch {}
  const cards = await db.collection("cards").find({ tenantId: actor.tenantId, status: "approved" }).sort({ createdAt: 1 }).toArray();
  const headings = ["Exhibition name", "Contact name", "Company name", "Job title", "Email", "Phone number", "Short notes", "Date and time captured", "Captured by", "Record status", "Reviewed by", "Review date", "Reviewer comment", "CardSnap record ID"];
  const userIds = [...new Set(cards.map((card) => String(card.capturedBy)))];
  const users = userIds.length ? await db.collection("users").find({ tenantId: actor.tenantId }).toArray() : [];
  const names = new Map(users.map((user) => [String(user._id), user.name]));
  const rows = cards.map((card) => {
    const data = decryptValue(card.payload).verifiedData || {};
    return [data.meetingContext?.metAtLocation, data.fullName, data.companyName, data.jobTitle, data.email, data.phone, data.notes, card.createdAt.toISOString(), names.get(String(card.capturedBy)) || "", "Approved", card.reviewedByName || "Hala", card.reviewedAt?.toISOString() || "", card.reviewerComment || "", String(card._id)].map(safeCsv).join(",");
  });
  await writeAudit(db, { tenantId: actor.tenantId, actor, action: "export", recordRef: `approved_count:${cards.length}`, outcome: "success" });
  return { csv: [headings.map(safeCsv).join(","), ...rows].join("\r\n"), count: cards.length };
}
