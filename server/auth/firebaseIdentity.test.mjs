import test from "node:test";
import assert from "node:assert/strict";
import { firebaseIdentity } from "./firebaseIdentity.js";
import { createUser, seedAdministrator, registerUser, signIn, authenticate } from "./service.js";
import { createHash } from "node:crypto";
import { ObjectId } from "mongodb";
const env = { FIREBASE_API_KEY: "dummy-test-project" };
test("Firebase supplies verified identity rather than browser email claims", async () => {
  const result = await firebaseIdentity("dummy-token", { env, fetcher: async (_url, options) => {
    assert.deepEqual(JSON.parse(options.body), { idToken: "dummy-token" });
    return { ok: true, json: async () => ({ users: [{ localId: "dummy-uid", email: "USER@AVENTUREAVIATION.COM", emailVerified: true }] }) };
  } });
  assert.deepEqual(result, { uid: "dummy-uid", email: "user@aventureaviation.com", name: "" });
});
test("unverified, invalid and disabled Firebase accounts cannot create an approval request", async () => {
  for (const account of [{ localId: "uid", email: "dummy@example.test", emailVerified: false }, { localId: "uid", email: "dummy@example.test", emailVerified: true, disabled: true }]) {
    await assert.rejects(firebaseIdentity("dummy", { env, fetcher: async () => ({ ok: true, json: async () => ({ users: [account] }) }) }));
  }
  await assert.rejects(firebaseIdentity("dummy", { env, fetcher: async () => ({ ok: false, json: async () => ({}) }) }), { code: "FIREBASE_TOKEN_INVALID" });
});
test("no Firebase config or token fails closed", async () => {
  await assert.rejects(firebaseIdentity("dummy", { env: {} }), { code: "FIREBASE_NOT_CONFIGURED" });
  await assert.rejects(firebaseIdentity(undefined, { env }), { code: "FIREBASE_TOKEN_REQUIRED" });
});
test("legacy provisioning cannot store password hashes", async () => {
  await assert.rejects(createUser(), { code: "FIREBASE_PROVISIONING_REQUIRED" });
  await assert.rejects(seedAdministrator(), { code: "FIREBASE_PROVISIONING_REQUIRED" });
});

test("verified registration notifies once; pending/rejected accounts and legacy sessions cannot access contacts", async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.FIREBASE_API_KEY;
  process.env.FIREBASE_API_KEY = "dummy-project";
  let verified = false;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ users: [{ localId: "dummy-uid", email: "dummy@aventureaviation.com", emailVerified: verified }] }) });
  let savedUser; let notifications = 0;
  const hash = value => createHash("sha256").update(value).digest("hex");
  const preauth = { _id: new ObjectId(), anonymous: true, csrfHash: hash("csrf"), absoluteExpiresAt: new Date(Date.now() + 60000) };
  const db = { collection(name) {
    if (name === "users") return { findOne: async () => savedUser, insertOne: async doc => { savedUser = { ...doc, _id: new ObjectId() }; }, updateOne: async () => {} };
    if (name === "sessions") return { findOne: async query => query.anonymous ? preauth : { userId: savedUser?._id, tenantId: savedUser?.tenantId, absoluteExpiresAt: new Date(Date.now() + 60000), lastSeenAt: new Date() }, deleteOne: async () => {} };
    if (name === "rateLimits") return { findOneAndUpdate: async () => ({ count: 1 }) };
    if (name === "auditLogs") return { insertOne: async () => {} };
    if (name === "settings") return { findOne: async () => null, updateOne: async () => {} };
    assert.fail(`unexpected collection ${name}`);
  } };
  const notify = async () => { notifications++; };
  try {
    await assert.rejects(registerUser(db, { idToken: "dummy" }, { notify }), { code: "PENDING_VERIFICATION" });
    assert.equal(savedUser, undefined); assert.equal(notifications, 0);
    verified = true;
    const registered = await registerUser(db, { idToken: "dummy", password: "must never persist" }, { notify });
    assert.equal(registered.status, "pending_approval"); assert.equal(notifications, 2);
    assert.equal(savedUser.password, undefined); assert.equal(savedUser.passwordHash, undefined);
    await registerUser(db, { idToken: "dummy" }, { notify }); assert.equal(notifications, 2);
    await assert.rejects(signIn(db, { idToken: "dummy", sessionToken: "session", csrfToken: "csrf" }), { code: "PENDING_APPROVAL" });
    await assert.rejects(authenticate(db, "session"), { code: "UNAUTHENTICATED" });
    savedUser.status = "rejected";
    await assert.rejects(signIn(db, { idToken: "dummy", sessionToken: "session", csrfToken: "csrf" }), { code: "ACCOUNT_REJECTED" });
    savedUser.status = "active"; delete savedUser.firebaseUid;
    await assert.rejects(authenticate(db, "session"), { code: "UNAUTHENTICATED" });
    assert.equal(notifications, 2);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.FIREBASE_API_KEY; else process.env.FIREBASE_API_KEY = previousKey;
  }
});
