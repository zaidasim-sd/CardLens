import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createOcrHandler } from "./ocrHandler.js";

function response() {
  return {
    statusCode: 200,
    payload: null,
    status(value) { this.statusCode = value; return this; },
    json(value) { this.payload = value; return this; },
  };
}

function request(overrides = {}) {
  return {
    method: "POST",
    headers: { origin: "https://staging.example.test", cookie: "cardsnap_session=fake", "x-csrf-token": "fake-csrf", "content-type": "image/jpeg" },
    socket: { remoteAddress: "192.0.2.1" },
    body: Buffer.from([0xff, 0xd8, 0xff]),
    ...overrides,
  };
}

test("OCR refuses a request without a signed in session", async () => {
  const handler = createOcrHandler({
    env: { ALLOWED_ORIGINS: "https://staging.example.test" },
    getDb: async () => ({}),
    ensureDatabaseIndexes: async () => {},
    authenticate: async () => { throw Object.assign(new Error("Please sign in"), { code: "UNAUTHENTICATED", status: 401 }); },
  });
  const res = response();
  const req = request();
  const image = req.body;
  await handler(req, res);
  assert.equal(res.statusCode, 401);
  assert.ok(image.every(byte => byte === 0));
  assert.equal(req.body, undefined);
  assert.equal(res.payload.code, "UNAUTHENTICATED");
});

test("OCR refuses a request from another origin before database access", async () => {
  let databaseCalled = false;
  const handler = createOcrHandler({
    env: { ALLOWED_ORIGINS: "https://staging.example.test" },
    getDb: async () => { databaseCalled = true; return {}; },
  });
  const res = response();
  await handler(request({ headers: { origin: "https://other.example.test" } }), res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.payload.code, "ORIGIN_DENIED");
  assert.equal(databaseCalled, false);
});

test("authenticated capturer can use the single Google OCR handler", async () => {
  const csrf = "fake-csrf";
  const csrfHash = createHash("sha256").update(csrf).digest("hex");
  const limits = new Map();
  const db = { collection: () => ({
    findOneAndUpdate: async ({ key }) => {
      const next = (limits.get(key) || 0) + 1;
      limits.set(key, next);
      return { count: next };
    },
  }) };
  const handler = createOcrHandler({
    env: { ALLOWED_ORIGINS: "https://staging.example.test", OCR_MONTHLY_CAP: "900" },
    getDb: async () => db,
    ensureDatabaseIndexes: async () => {},
    authenticate: async () => ({ session: { csrfHash }, user: { id: "capturer-1", tenantId: "vision71", role: "exhibition_assistant" } }),
    performOCR: async () => ({ rawText: "Fake Person\nfake@example.test", provider: "google", success: true }),
  });
  const res = response();
  const req = request();
  const image = req.body;
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.ok(image.every(byte => byte === 0));
  assert.equal(req.body, undefined);
  assert.equal(res.payload.provider, "google");
});
