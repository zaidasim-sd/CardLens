import test from "node:test";
import assert from "node:assert/strict";
import { requestPasswordReset } from "./passwordReset.js";
import { renderPasswordResetEmail } from "../notifications/emailService.js";

const env = { FIREBASE_PROJECT_ID: "fixture-project", FIREBASE_SERVICE_ACCOUNT_EMAIL: "fixture@example.test", FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: "fixture", SMTP_PASS: "fixture" };
const db = { collection: () => ({ findOneAndUpdate: async () => ({ count: 1 }) }) };
function options(overrides = {}) {
  return { env, baseUrl: "https://lead71.com", getToken: async () => "fixture-token", fetcher: async () => ({ ok: true, json: async () => ({ oobLink: "https://fixture.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=fixture-code" }) }), sendEmail: async () => ({ success: true }), ...overrides };
}

test("Firebase generates the code; SMTP gets the branded app link; browser receives no code", async () => {
  let sent;
  const result = await requestPasswordReset(db, { email: " HALA@aventureaviation.com " }, options({
    fetcher: async (url, request) => {
      assert.equal(url, "https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode");
      assert.equal(request.headers.Authorization, "Bearer fixture-token");
      assert.deepEqual(JSON.parse(request.body), { requestType: "PASSWORD_RESET", email: "hala@aventureaviation.com", targetProjectId: "fixture-project", returnOobLink: true });
      return { ok: true, json: async () => ({ oobLink: "https://fixture.firebaseapp.com/__/auth/action?oobCode=fixture-code" }) };
    }, sendEmail: async message => { sent = message; return { success: true }; },
  }));
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(sent, { toEmail: "hala@aventureaviation.com", resetUrl: "https://lead71.com/reset-password?oobCode=fixture-code" });
});

test("unknown account returns generic success without sending email", async () => {
  const result = await requestPasswordReset(db, { email: "unknown@aventureaviation.com" }, options({
    fetcher: async () => ({ ok: false, json: async () => ({ error: { message: "EMAIL_NOT_FOUND" } }) }),
    sendEmail: async () => assert.fail("Should not send"),
  }));
  assert.deepEqual(result, { ok: true });
});

test("configuration, email restrictions and rate limits prevent sending", async () => {
  await assert.rejects(requestPasswordReset(db, { email: "hala@aventureaviation.com" }, options({ env: {} })), { code: "FIREBASE_RESET_NOT_CONFIGURED" });
  await assert.rejects(requestPasswordReset(db, { email: "someone@unauthorized.test" }, options()), { code: "EMAIL_INVALID" });
  const limitedDb = { collection: () => ({ findOneAndUpdate: async () => ({ count: 11 }) }) };
  await assert.rejects(requestPasswordReset(limitedDb, { email: "hala@aventureaviation.com" }, options({ getToken: async () => assert.fail("Must not generate a code") })), { code: "RATE_LIMITED" });
});

test("Firebase and SMTP failures are errors, never false success or exposed secrets", async () => {
  const input = { email: "hala@aventureaviation.com" };
  for (const override of [
    { getToken: async () => { throw new Error("private-key-fixture"); } },
    { fetcher: async () => ({ ok: false, json: async () => ({ error: { message: "PERMISSION_DENIED" } }) }) },
    { fetcher: async () => ({ ok: true, json: async () => ({ oobLink: "https://fixture.test/no-code" }) }) },
    { sendEmail: async () => ({ success: false }) },
    { sendEmail: async () => { throw new Error("smtp-secret-fixture"); } },
  ]) await assert.rejects(requestPasswordReset(db, input, options(override)), { code: "RESET_UNAVAILABLE", message: "We could not send the reset email. Please try again shortly." });
});

test("reset email matches shared branding and safely escapes dynamic values", () => {
  const message = renderPasswordResetEmail({ toEmail: "<unsafe>@aventureaviation.com", name: "<script>", resetUrl: "https://lead71.com/reset-password?oobCode=fixture&lang=en", baseUrl: "https://lead71.com" });
  assert.match(message.html, /Lead71 by Vision71/);
  assert.match(message.html, /Reset my password/);
  assert.match(message.html, /&lt;unsafe&gt;/);
  assert.match(message.html, /&lt;script&gt;/);
  assert.match(message.html, /oobCode=fixture&amp;lang=en/);
  assert.match(message.html, /max-width: 600px/);
  assert.match(message.text, /oobCode=fixture&lang=en/);
  assert.doesNotMatch(message.html, /<script>/);
});
