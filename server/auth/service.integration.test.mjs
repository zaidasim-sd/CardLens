import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";
import { authenticate, createPreauthSession, createUser, removeUser, seedAdministrator, signIn, verifyCsrf } from "./service.js";
import { ensureDatabaseIndexes } from "../db.js";

const databaseName = process.env.MONGODB_TEST_DB || "cardsnap_step1_test";
const tenantId = `fake_tenant_${Date.now()}`;
const password = "FakePassword123!";
let client;
let db;
let administrator;

before(async () => {
  assert.ok(process.env.MONGODB_URI, "MONGODB_URI is required for integration tests");
  client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  db = client.db(databaseName);
  await ensureDatabaseIndexes(db);
  administrator = await seedAdministrator(db, { tenantId, email: "admin@example.test", name: "Fake Administrator", password });
});

after(async () => {
  for (const name of ["sessions", "loginAttempts", "rateLimits", "users"]) await db.collection(name).deleteMany({ $or: [{ tenantId }, { key: { $regex: "^signin:" } }] });
  await client.close();
});

async function login(email, passwordValue = password, now = new Date(), ip = `192.0.2.${Math.floor(Math.random() * 200) + 1}`) {
  const preauth = await createPreauthSession(db, now);
  return signIn(db, { tenantId, email, password: passwordValue, ip, sessionToken: preauth.sessionToken, csrfToken: preauth.csrfToken, now });
}

test("removed account cannot sign in and its open session stops working", async () => {
  const user = await createUser(db, administrator, { email: "removed@example.test", name: "Fake Removed User", role: "exhibition_assistant", password });
  const signedIn = await login(user.email);
  await removeUser(db, administrator, user.id);
  await assert.rejects(authenticate(db, signedIn.sessionToken), { code: "UNAUTHENTICATED" });
  await assert.rejects(login(user.email), { code: "INVALID_CREDENTIALS" });
});

test("locked account cannot sign in with the correct password", async () => {
  const user = await createUser(db, administrator, { email: "locked@example.test", name: "Fake Locked User", role: "exhibition_assistant", password });
  const ip = "192.0.2.240";
  for (let attempt = 0; attempt < 5; attempt += 1) await assert.rejects(login(user.email, "WrongPassword123!", new Date(), ip), { code: "INVALID_CREDENTIALS" });
  await assert.rejects(login(user.email, password, new Date(), ip), { code: "ACCOUNT_LOCKED" });
});

test("Vision71 Support account stops working after 24 hours", async () => {
  const createdAt = new Date("2026-09-30T00:00:00.000Z");
  const user = await createUser(db, administrator, { email: "support@example.test", name: "Fake Support User", role: "vision71_support", password }, createdAt);
  assert.equal(user.expiresAt.toISOString(), "2026-10-01T00:00:00.000Z");
  const signedIn = await login(user.email, password, new Date("2026-09-30T01:00:00.000Z"));
  await assert.rejects(authenticate(db, signedIn.sessionToken, new Date("2026-10-01T00:00:00.001Z")), { code: "UNAUTHENTICATED" });
});

test("CSRF token is tied to its server session", async () => {
  const user = await createUser(db, administrator, { email: "csrf@example.test", name: "Fake CSRF User", role: "exhibition_assistant", password });
  const first = await createPreauthSession(db);
  const second = await createPreauthSession(db);
  await assert.rejects(signIn(db, { tenantId, email: user.email, password, ip: "192.0.2.111", sessionToken: first.sessionToken, csrfToken: second.csrfToken }), { code: "CSRF_INVALID" });
  const signedIn = await signIn(db, { tenantId, email: user.email, password, ip: "192.0.2.112", sessionToken: second.sessionToken, csrfToken: second.csrfToken });
  const authenticated = await authenticate(db, signedIn.sessionToken, new Date(), false);
  verifyCsrf(authenticated.session, signedIn.csrfToken);
  assert.notEqual(first.sessionToken, second.sessionToken);
});

test("session absolute and idle limits are enforced", async () => {
  const user = await createUser(db, administrator, { email: "session@example.test", name: "Fake Session User", role: "aventure_reviewer", password });
  const signedIn = await login(user.email, password, new Date("2026-09-30T08:00:00.000Z"));
  await assert.rejects(authenticate(db, signedIn.sessionToken, new Date("2026-09-30T08:30:00.001Z")), { code: "UNAUTHENTICATED" });
});
