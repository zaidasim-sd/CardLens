import test from "node:test";
import assert from "node:assert/strict";
import { isVision71EmailAllowed, isAllowedEmail, isAllowedAventureEmail } from "./service.js";

test("domain restriction: @aventureaviation.com is always allowed", () => {
  assert.equal(isAllowedEmail("pilot@aventureaviation.com"), true);
  assert.equal(isAllowedEmail("Hala@AventureAviation.com"), true);
  assert.equal(isAllowedAventureEmail("osman@aventureaviation.com"), true);
});

test("domain restriction: @vision71tech.com is allowed when toggle is active", () => {
  const prevEnv = process.env.ALLOW_VISION71_EMAILS;
  try {
    process.env.ALLOW_VISION71_EMAILS = "true";
    assert.equal(isVision71EmailAllowed(), true);
    assert.equal(isAllowedEmail("zaid.sd@vision71tech.com"), true);
    assert.equal(isAllowedEmail("tester@example.test"), true);
  } finally {
    process.env.ALLOW_VISION71_EMAILS = prevEnv;
  }
});

test("domain restriction: @vision71tech.com is rejected when toggle is explicitly false in production", () => {
  const prevToggle = process.env.ALLOW_VISION71_EMAILS;
  const prevVite = process.env.VITE_ALLOW_VISION71_EMAILS;
  const prevAppEnv = process.env.APP_ENV;
  const prevNodeEnv = process.env.NODE_ENV;

  try {
    process.env.ALLOW_VISION71_EMAILS = "false";
    delete process.env.VITE_ALLOW_VISION71_EMAILS;
    process.env.APP_ENV = "production";
    process.env.NODE_ENV = "production";

    assert.equal(isVision71EmailAllowed(), false);
    assert.equal(isAllowedEmail("zaid.sd@vision71tech.com"), false);
    // Client domain should still pass
    assert.equal(isAllowedEmail("pilot@aventureaviation.com"), true);
  } finally {
    process.env.ALLOW_VISION71_EMAILS = prevToggle;
    process.env.VITE_ALLOW_VISION71_EMAILS = prevVite;
    process.env.APP_ENV = prevAppEnv;
    process.env.NODE_ENV = prevNodeEnv;
  }
});

test("domain restriction: arbitrary external domains are rejected", () => {
  assert.equal(isAllowedEmail("attacker@gmail.com"), false);
  assert.equal(isAllowedEmail("random@yahoo.com"), false);
  assert.equal(isAllowedEmail("hacker@malicious.org"), false);
  assert.equal(isAllowedEmail(""), false);
  assert.equal(isAllowedEmail(null), false);
});
