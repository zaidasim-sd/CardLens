import test from "node:test";
import assert from "node:assert/strict";
import { followUpIssues } from "./reviewValidation.mjs";

test("follow-up fields are optional and ignored while follow-up is No", () => {
  assert.deepEqual(followUpIssues({ followUpRequired: "No", nextAction: "", followUpDate: "" }), []);
});

test("follow-up Yes requires both next action and due date", () => {
  assert.deepEqual(followUpIssues({ followUpRequired: "Yes", nextAction: "", followUpDate: "" }).map(issue => issue.field), ["nextAction", "followUpDate"]);
  assert.deepEqual(followUpIssues({ followUpRequired: "Yes", nextAction: "Call", followUpDate: "2026-11-05" }), []);
});
