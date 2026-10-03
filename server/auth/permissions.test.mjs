import { pilot } from "../pilot.js";
// Legacy regression coverage: exercise preserved functionality in this isolated test process.
pilot.internalReviewEnabled = true;
pilot.constantContactEnabled = true;
import test from "node:test";
import assert from "node:assert/strict";
import { ACTIONS, can, requireAction, ROLES } from "./permissions.js";

const expected = {
  exhibition_assistant: ["capture_card", "use_ocr", "view_own_draft", "correct_own_draft", "submit_own_draft"],
  aventure_reviewer: ["view_review_queue", "correct_submitted_card", "approve_card", "reject_card", "request_correction"],
  vision71_administrator: ["manage_users", "manage_lists", "change_retention", "delete_record", "end_pilot_export", "view_review_queue", "correct_submitted_card", "approve_card", "reject_card", "request_correction"],
  vision71_support: ["view_aggregate_counts"],
};

for (const role of ROLES) {
  for (const action of ACTIONS) {
    test(`${role} ${expected[role].includes(action) ? "can" : "cannot"} ${action}`, () => {
      assert.equal(can(role, action), expected[role].includes(action));
    });
  }
}

test("assistant access is limited to a draft captured by that assistant", () => {
  const user = { id: "assistant_one", tenantId: "tenant_one", role: "exhibition_assistant" };
  assert.doesNotThrow(() => requireAction(user, "view_own_draft", { tenantId: "tenant_one", capturedBy: "assistant_one" }));
  assert.doesNotThrow(() => requireAction(user, "correct_own_draft", { tenantId: "tenant_one", capturedBy: { toString: () => "assistant_one" } }));
  assert.throws(() => requireAction(user, "view_own_draft", { tenantId: "tenant_one", capturedBy: "assistant_two" }), { code: "FORBIDDEN" });
});

test("reviewer cannot approve a record captured by that reviewer", () => {
  const user = { id: "reviewer_one", tenantId: "tenant_one", role: "aventure_reviewer" };
  assert.throws(() => requireAction(user, "approve_card", { tenantId: "tenant_one", capturedBy: "reviewer_one" }), { code: "SELF_APPROVAL_FORBIDDEN" });
});

test("record checks reject another tenant", () => {
  const user = { id: "reviewer_one", tenantId: "tenant_one", role: "aventure_reviewer" };
  assert.throws(() => requireAction(user, "reject_card", { tenantId: "tenant_two", capturedBy: "assistant_two" }), { code: "FORBIDDEN" });
});
