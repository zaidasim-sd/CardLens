const ACTIONS = new Set([
  "sign_in", "failed_sign_in", "sign_out", "user_created", "user_removed", "upload", "review", "correction",
  "approval", "rejection", "transfer", "deletion", "retention_change", "support_access", "export", "image_deleted", "password_changed", "user_approved", "sign_in_google",
]);
const OUTCOMES = new Set(["success", "failed", "refused"]);

export async function writeAudit(db, { tenantId, actor, action, recordRef, outcome = "success", now = new Date(), session }) {
  if (!tenantId || !ACTIONS.has(action) || !OUTCOMES.has(outcome)) throw new Error("Audit entry is invalid");
  const entry = {
    tenantId,
    time: now,
    actorId: String(actor?.id || actor?._id || "unknown"),
    actorRole: String(actor?.role || "unknown"),
    action,
    recordRef: recordRef ? String(recordRef).slice(0, 128) : null,
    outcome,
    // Free-form details are excluded from minimal audit records.
  };
  await db.collection("auditLogs").insertOne(entry, session ? { session } : {});
  return entry;
}
