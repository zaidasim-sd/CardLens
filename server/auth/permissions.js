import { pilot } from "../pilot.js";
export const ROLES = [
  "exhibition_assistant",
  "aventure_reviewer",
  "vision71_administrator",
  "vision71_support",
];

export const ACTIONS = [
  "capture_card",
  "use_ocr",
  "view_own_draft",
  "correct_own_draft",
  "submit_own_draft",
  "view_review_queue",
  "correct_submitted_card",
  "approve_card",
  "reject_card",
  "request_correction",
  "transfer_approved_card",
  "manage_users",
  "manage_lists",
  "change_retention",
  "delete_record",
  "end_pilot_export",
  "view_aggregate_counts",
];

const permissions = {
  exhibition_assistant: new Set(["capture_card", "use_ocr", "view_own_draft", "correct_own_draft", "submit_own_draft"]),
  aventure_reviewer: new Set(["view_review_queue", "correct_submitted_card", "approve_card", "reject_card", "request_correction"]),
  vision71_administrator: new Set(["manage_users", "manage_lists", "change_retention", "delete_record", "end_pilot_export", "view_review_queue", "correct_submitted_card", "approve_card", "reject_card", "request_correction"]),
  vision71_support: new Set(["view_aggregate_counts"]),
};

export function can(role, action) {
  // PILOT: preserve the old role matrix, but disable internal review authority.
  if (!pilot.internalReviewEnabled && (role === "aventure_reviewer" || ["correct_submitted_card", "approve_card", "reject_card", "request_correction", "transfer_approved_card"].includes(action))) return false;
  return Boolean(permissions[role]?.has(action));
}

export function requireAction(user, action, record) {
  if (!user || !can(user.role, action)) throw Object.assign(new Error("Access denied."), { code: "FORBIDDEN", status: 403 });
  if (record && record.tenantId !== user.tenantId) throw Object.assign(new Error("Access denied."), { code: "FORBIDDEN", status: 403 });
  const userId = String(user.id || user._id || "");
  const cardCapturerId = record?.capturedBy ? String(record.capturedBy) : null;
  if (record && ["view_own_draft", "correct_own_draft", "submit_own_draft"].includes(action) && cardCapturerId !== userId) {
    throw Object.assign(new Error("Access denied."), { code: "FORBIDDEN", status: 403 });
  }
  if (action === "approve_card" && cardCapturerId === userId) {
    throw Object.assign(new Error("A reviewer cannot approve a record they captured."), { code: "SELF_APPROVAL_FORBIDDEN", status: 403 });
  }
}
