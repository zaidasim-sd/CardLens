import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createOcrHandler, classificationFailureMessage } from "./ocrHandler.js";
import { parseOCRText } from "../services/cardParser.js";

function response() {
  return {
    statusCode: 200,
    payload: null,
    status(value) { this.statusCode = value; return this; },
    json(value) { this.payload = value; return this; },
  };
}

test("classification failures report safe reasons without upstream details", () => {
  assert.match(classificationFailureMessage({ code: "AI_KEY_MISSING" }), /key is missing/);
  assert.match(classificationFailureMessage({ message: "Classification timeout" }), /time limit/);
  assert.match(classificationFailureMessage({ upstreamStatus: 429 }), /quota/);
  assert.match(classificationFailureMessage({ upstreamStatus: 403 }), /credentials/);
  assert.match(classificationFailureMessage({ upstreamStatus: 503 }), /temporarily unavailable/);
  assert.match(classificationFailureMessage({ upstreamStatus: 404 }), /configuration/);
  assert.match(classificationFailureMessage({ message: "fetch failed" }), /connect/);
  assert.equal(classificationFailureMessage({ message: "secret OCR and key details" }).includes("secret"), false);
});

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

for (const role of ["exhibition_assistant", "vision71_administrator"]) test(`authenticated ${role} can use the single Google OCR handler`, async () => {
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
    authenticate: async () => ({ session: { csrfHash }, user: { id: "capturer-1", tenantId: "vision71", role } }),
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

for (const scenario of ["manual", "ai", "fallback", "missing-key", "invalid-result"]) test(`classification mode: ${scenario}`, async () => {
  const rawText = "Fake Person\nfake@example.test";
  const env = { ALLOWED_ORIGINS: "https://staging.example.test" };
  let calls = 0;
  const aiFields = { ...parseOCRText(rawText), fullName: "AI result" };
  const handler = createOcrHandler({
    env,
    getDb: async () => ({ collection: () => ({ findOneAndUpdate: async () => ({ count: 1 }) }) }),
    ensureDatabaseIndexes: async () => {},
    authenticate: async () => ({
      session: { csrfHash: createHash("sha256").update("fake-csrf").digest("hex") },
      user: { id: "capturer-1", tenantId: "vision71", role: "exhibition_assistant" },
    }),
    performOCR: async () => ({ rawText }),
    ...(scenario === "missing-key" ? {} : { classifyWithGemini: async (text, options) => {
      calls++;
      assert.equal(text, rawText);
      assert.equal(options.env, env);
      if (scenario === "fallback") throw new Error("Upstream unavailable");
      if (scenario === "invalid-result") return {};
      return aiFields;
    } }),
  });
  const req = request();
  req.headers["x-classification-mode"] = scenario === "manual" ? "manual" : "ai";
  const res = response();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(calls, ["ai", "fallback", "invalid-result"].includes(scenario) ? 1 : 0);
  assert.equal(res.payload.classificationUsed, scenario === "ai" ? "ai" : "manual");
  assert.equal(res.payload.classificationFallback, ["fallback", "missing-key", "invalid-result"].includes(scenario));
  assert.deepEqual(res.payload.parsed, scenario === "ai" ? aiFields : parseOCRText(rawText));
});

test("invalid classification mode is rejected before OCR or database access", async () => {
  const handler = createOcrHandler({
    env: { ALLOWED_ORIGINS: "https://staging.example.test" },
    getDb: async () => assert.fail("database must not be called"),
    performOCR: async () => assert.fail("OCR must not be called"),
  });
  const req = request();
  req.headers["x-classification-mode"] = "unknown";
  const res = response();
  await handler(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.code, "CLASSIFICATION_MODE_INVALID");
});

for (const aiAvailable of [true, false]) test(`comparison shares OCR, reports independent timings, AI available: ${aiAvailable}`, async () => {
  let ocrCalls = 0;
  let aiCalls = 0;
  const rawText = "Fake Person\nfake@example.test";
  const aiFields = { ...parseOCRText(rawText), fullName: "AI result" };
  const handler = createOcrHandler({
    env: { ALLOWED_ORIGINS: "https://staging.example.test" },
    getDb: async () => ({ collection: () => ({ findOneAndUpdate: async () => ({ count: 1 }) }) }),
    ensureDatabaseIndexes: async () => {},
    authenticate: async () => ({
      session: { csrfHash: createHash("sha256").update("fake-csrf").digest("hex") },
      user: { id: "capturer-1", tenantId: "vision71", role: "exhibition_assistant" },
    }),
    performOCR: async () => { ocrCalls++; return { rawText }; },
    classifyWithGemini: async text => {
      aiCalls++;
      assert.equal(text, rawText);
      if (!aiAvailable) throw new Error("Unavailable");
      return aiFields;
    },
  });
  const req = request();
  req.headers["x-classification-mode"] = "compare";
  const res = response();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(ocrCalls, 1);
  assert.equal(aiCalls, 1);
  const comparison = res.payload.comparison;
  assert.deepEqual(comparison.manual, parseOCRText(rawText));
  assert.deepEqual(comparison.ai, aiAvailable ? aiFields : null);
  assert.equal(comparison.manualTotalMs, comparison.ocrMs + comparison.manualClassificationMs);
  assert.equal(comparison.aiTotalMs, comparison.ocrMs + comparison.aiClassificationMs);
  for (const key of ["ocrMs", "manualClassificationMs", "aiClassificationMs", "manualTotalMs", "aiTotalMs"]) {
    assert.ok(Number.isFinite(comparison[key]) && comparison[key] >= 0);
  }
});
