import test from "node:test";
import assert from "node:assert/strict";
import { authenticate, authenticateGoogleUser, getAdministratorEmails, isAdministrator, signIn } from "./service.js";

const admins = ["hala@aventureaviation.com", "osman@aventureaviation.com"];

test("Hala and Osman are admins alongside existing and configured administrators", () => {
  const previous = process.env.ADMIN_EMAILS;
  process.env.ADMIN_EMAILS = "existing.admin@aventureaviation.com";
  try {
    for (const email of [...admins, "hmirza.sd@vision71tech.com", "iamalik2005@gmail.com", "zaid.sd@vision71tech.com", "existing.admin@aventureaviation.com"]) {
      assert.ok(getAdministratorEmails().includes(email));
      assert.equal(isAdministrator(email.toUpperCase()), true);
    }
    assert.equal(isAdministrator("not-hala@aventureaviation.com"), false);
    assert.equal(isAdministrator("hala@aventureaviation.com.evil.test"), false);
    assert.equal(isAdministrator("ibrahim@vision71tech.com"), false);
  } finally {
    if (previous === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = previous;
  }
});

test("verified Firebase sign-in and Google sign-in give designated emails admin access", async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.FIREBASE_API_KEY;
  process.env.FIREBASE_API_KEY = "test-only";
  let email;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ users: [{ localId: "fixture-admin", email, emailVerified: true }] }) });
  const db = { collection(name) {
    if (name === "sessions") return { findOne: async () => null, insertOne: async () => {} };
    if (name === "rateLimits") return { findOneAndUpdate: async () => ({ count: 1 }) };
    if (name === "auditLogs") return { insertOne: async () => {} };
    assert.fail(`Unexpected collection ${name}`);
  } };
  try {
    for (email of admins) {
      const passwordFlow = await signIn(db, { idToken: "verified-fixture" });
      assert.equal(passwordFlow.user.role, "vision71_administrator");
      assert.equal(passwordFlow.user.email, email);
      const googleFlow = await authenticateGoogleUser(db, { idToken: "verified-fixture" });
      assert.equal(googleFlow.status, "active");
      assert.equal(googleFlow.user.role, "vision71_administrator");
    }
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.FIREBASE_API_KEY;
    else process.env.FIREBASE_API_KEY = previousKey;
  }
});

test("older capturer sessions for new admins are upgraded while existing roles are retained", async () => {
  const now = new Date();
  for (const [email, storedRole, expectedRole] of [
    ...admins.map(email => [email, "exhibition_assistant", "vision71_administrator"]),
    ["hmirza.sd@vision71tech.com", "vision71_administrator", "vision71_administrator"],
    ["previous.admin@aventureaviation.com", "vision71_administrator", "vision71_administrator"],
    ["capturer@aventureaviation.com", "exhibition_assistant", "exhibition_assistant"],
    ["ibrahim@vision71tech.com", "exhibition_assistant", "exhibition_assistant"],
  ]) {
    const updates = [];
    const session = { _id: "fixture", absoluteExpiresAt: new Date(now.getTime() + 60000), lastSeenAt: now, user: { id: "fixture-user", email, status: "active", role: storedRole } };
    const db = { collection: () => ({ findOne: async () => session, updateOne: async (_filter, update) => updates.push(update) }) };
    const result = await authenticate(db, "fixture-token", now, false);
    assert.equal(result.user.role, expectedRole);
    assert.equal(result.session.user.role, expectedRole);
    if (storedRole !== expectedRole) assert.equal(updates[0].$set["user.role"], expectedRole);
    else assert.equal(updates.length, 0);
  }
});
