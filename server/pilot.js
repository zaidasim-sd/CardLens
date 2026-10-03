import pilot from "../config/pilot.json" with { type: "json" };

// PILOT: old implementations stay in place behind these switches. Restore the
// corresponding config/pilot.json switch to re-enable a future broader scope.
export { pilot };
export function requirePilotRole(role) {
  if (!pilot.internalReviewEnabled && role === "aventure_reviewer") {
    throw Object.assign(new Error("Review takes place in Google Sheets for this pilot. Reviewer sign-in is paused."), { code: "ROLE_DISABLED", status: 403 });
  }
}
