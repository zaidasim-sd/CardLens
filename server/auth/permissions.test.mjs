import test from "node:test";
import assert from "node:assert/strict";
import { ACTIONS, can, requireAction, ROLES } from "./permissions.js";

const expected = {
  exhibition_assistant: ["capture_card", "use_ocr", "view_own_draft", "correct_own_draft", "submit_own_draft"],
  aventure_reviewer: [],
  vision71_administrator: ["manage_users", "manage_lists", "change_retention", "delete_record", "end_pilot_export"],
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
  assert.throws(() => requireAction(user, "view_own_draft", { tenantId: "tenant_one", capturedBy: "assistant_two" }), { code: "FORBIDDEN" });
});

test("reviewer cannot approve a record in CardSnap because review happens in the Sheet", () => {
  const user = { id: "reviewer_one", tenantId: "tenant_one", role: "aventure_reviewer" };
  assert.throws(() => requireAction(user, "approve_card", { tenantId: "tenant_one", capturedBy: "reviewer_one" }), { code: "FORBIDDEN" });
});

test("record checks reject another tenant", () => {
  const user = { id: "reviewer_one", tenantId: "tenant_one", role: "aventure_reviewer" };
  assert.throws(() => requireAction(user, "reject_card", { tenantId: "tenant_two", capturedBy: "assistant_two" }), { code: "FORBIDDEN" });
});
