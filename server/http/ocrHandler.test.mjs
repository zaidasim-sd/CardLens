import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createOcrHandler, classificationFailureMessage } from "./ocrHandler.js";
import { parseOCRText } from "../services/cardParser.js";
import { submitDirect } from "../cards/directSubmission.js";

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
    env: { ALLOWED_ORIGINS: "https://staging.example.test" },
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

function aiFallbackFixture({ env = {}, classifier, countForKey } = {}) {
  const rawText = "Synthetic Name\nsynthetic@example.test";
  const counters = new Map();
  const db = { collection: () => ({ findOneAndUpdate: async ({ key }) => {
    if (countForKey) return { count: countForKey(key, counters) };
    const count = (counters.get(key) || 0) + 1;
    counters.set(key, count);
    return { count };
  } }) };
  const handler = createOcrHandler({
    env: { ALLOWED_ORIGINS: "https://staging.example.test", ...env },
    getDb: async () => db,
    ensureDatabaseIndexes: async () => {},
    authenticate: async () => ({
      session: { csrfHash: createHash("sha256").update("fake-csrf").digest("hex") },
      user: { id: "synthetic-capturer", tenantId: "synthetic-tenant", role: "exhibition_assistant" },
    }),
    performOCR: async () => ({ rawText }),
    ...(classifier ? { classifyWithGemini: classifier } : {}),
  });
  return { handler, rawText, counters };
}

test("ENABLE_AI_MAPPING=false bypasses Gemini and returns the saveable manual mapping", async () => {
  let geminiCalls = 0;
  const { handler, rawText } = aiFallbackFixture({
    env: { ENABLE_AI_MAPPING: "false", AI_MAPPING_MONTHLY_CAP: "1" },
    classifier: async () => { geminiCalls++; assert.fail("Gemini must not be called while disabled"); },
  });
  const req = request(); req.headers["x-classification-mode"] = "ai";
  const res = response();
  const started = performance.now();
  await handler(req, res);
  const elapsedMs = performance.now() - started;
  assert.equal(res.statusCode, 200);
  assert.equal(geminiCalls, 0);
  assert.equal(res.payload.classificationUsed, "manual");
  assert.equal(res.payload.classificationFallback, true);
  assert.equal(res.payload.classificationFallbackReason, "AI_MAPPING_DISABLED");
  assert.deepEqual(res.payload.parsed, parseOCRText(rawText));
  assert.ok(Number.isFinite(elapsedMs) && elapsedMs >= 0);
});

for (const [scenario, classifier] of [
  ["failed API response", async () => { throw Object.assign(new Error("failed"), { upstreamStatus: 503 }); }],
  ["timeout", async () => { throw new Error("Classification timeout"); }],
  ["invalid AI response", async () => ({})],
  ["quota or rate limit", async () => { throw Object.assign(new Error("limited"), { upstreamStatus: 429 }); }],
  ["no credit or rejected request", async () => { throw Object.assign(new Error("payment required"), { upstreamStatus: 402 }); }],
]) test(`AI ${scenario} falls back to a saveable manual mapping`, async () => {
  const { handler, rawText } = aiFallbackFixture({ env: { ENABLE_AI_MAPPING: "true" }, classifier });
  const req = request(); req.headers["x-classification-mode"] = "ai";
  const res = response();
  const started = performance.now();
  await handler(req, res);
  const elapsedMs = performance.now() - started;
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.classificationUsed, "manual");
  assert.equal(res.payload.classificationFallback, true);
  assert.deepEqual(res.payload.parsed, parseOCRText(rawText));
  assert.ok(Number.isFinite(elapsedMs) && elapsedMs >= 0);
});

test("AI monthly cap falls back to manual without gating the normal manual OCR path", async () => {
  let geminiCalls = 0;
  const { handler, rawText, counters } = aiFallbackFixture({
    env: { ENABLE_AI_MAPPING: "true", AI_MAPPING_MONTHLY_CAP: "1" },
    countForKey: (key, counts) => {
      const count = (counts.get(key) || 0) + 1;
      counts.set(key, count);
      return key.startsWith("ai:month:") ? 2 : 1;
    },
    classifier: async () => { geminiCalls++; return parseOCRText(rawText); },
  });
  const aiReq = request(); aiReq.headers["x-classification-mode"] = "ai";
  const aiRes = response();
  await handler(aiReq, aiRes);
  assert.equal(aiRes.statusCode, 200);
  assert.equal(aiRes.payload.classificationFallbackReason, "AI_MONTHLY_CAP_REACHED");
  assert.equal(aiRes.payload.classificationUsed, "manual");
  assert.equal(geminiCalls, 0);
  const aiBudgetCount = [...counters.entries()].find(([key]) => key.startsWith("ai:month:"))?.[1];

  const manualReq = request(); manualReq.headers["x-classification-mode"] = "manual";
  const manualRes = response();
  await handler(manualReq, manualRes);
  assert.equal(manualRes.statusCode, 200);
  assert.equal(manualRes.payload.classificationUsed, "manual");
  assert.equal(manualRes.payload.classificationFallback, false);
  assert.deepEqual(manualRes.payload.parsed, parseOCRText(rawText));
  assert.equal([...counters.entries()].find(([key]) => key.startsWith("ai:month:"))?.[1], aiBudgetCount, "manual mode does not consume AI budget");
});

test("concurrent scans cannot exceed the shared AI monthly request cap, and both cards remain usable", async () => {
  let geminiCalls = 0;
  const { handler, rawText } = aiFallbackFixture({
    env: { ENABLE_AI_MAPPING: "true", AI_MAPPING_MONTHLY_CAP: "1" },
    classifier: async () => { geminiCalls++; await new Promise(resolve => setTimeout(resolve, 5)); return parseOCRText(rawText); },
  });
  const requests = [request(), request()];
  for (const req of requests) req.headers["x-classification-mode"] = "ai";
  const responses = [response(), response()];
  await Promise.all(requests.map((req, index) => handler(req, responses[index])));
  assert.deepEqual(responses.map(res => res.statusCode), [200, 200]);
  assert.equal(geminiCalls, 1);
  assert.deepEqual(responses.map(res => res.payload.classificationUsed).sort(), ["ai", "manual"]);
  assert.ok(responses.every(res => JSON.stringify(res.payload.parsed) === JSON.stringify(parseOCRText(rawText))));
});

test("synthetic OCR AI failure still submits the manual result to an isolated mock register", async () => {
  const rawText = "Synthetic Name\nsynthetic@example.test";
  const counters = new Map();
  const settingsDocs = new Map();
  const rateLimits = { findOneAndUpdate: async ({ key }) => {
    const count = (counters.get(key) || 0) + 1; counters.set(key, count); return { count };
  } };
  const settings = {
    async findOne(query) { return settingsDocs.get(query.key || query._id); },
    async insertOne(doc) { settingsDocs.set(doc.key || doc._id, structuredClone(doc)); },
    async updateOne(query, update) {
      const key = query.key || query._id;
      const doc = settingsDocs.get(key) || {};
      if (update.$max) for (const [field, value] of Object.entries(update.$max)) doc[field] = Math.max(doc[field] || 0, value);
      Object.assign(doc, update.$setOnInsert || {}, update.$set || {});
      for (const field of Object.keys(update.$unset || {})) delete doc[field];
      settingsDocs.set(key, doc);
    },
    async findOneAndUpdate(query, update) {
      const key = query.key || query._id;
      const doc = settingsDocs.get(key);
      if (!doc) return null;
      if (update.$inc) for (const [field, value] of Object.entries(update.$inc)) doc[field] = (doc[field] || 0) + value;
      Object.assign(doc, update.$set || {});
      settingsDocs.set(key, doc);
      return structuredClone(doc);
    },
  };
  const db = { collection(name) { return name === "rateLimits" ? rateLimits : settings; } };
  const handler = createOcrHandler({
    env: { ALLOWED_ORIGINS: "https://staging.example.test", ENABLE_AI_MAPPING: "true", AI_MAPPING_MONTHLY_CAP: "10" },
    getDb: async () => db,
    ensureDatabaseIndexes: async () => {},
    authenticate: async () => ({
      session: { csrfHash: createHash("sha256").update("fake-csrf").digest("hex") },
      user: { id: "synthetic-capturer", tenantId: "synthetic-tenant", name: "Synthetic Tester", role: "exhibition_assistant" },
    }),
    performOCR: async () => ({ rawText }),
    classifyWithGemini: async () => { throw Object.assign(new Error("Synthetic quota exhaustion"), { upstreamStatus: 429 }); },
  });
  const req = request(); req.headers["x-classification-mode"] = "ai";
  const res = response();
  const started = performance.now();
  await handler(req, res);
  const processingMs = performance.now() - started;
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.classificationFallback, true);
  assert.equal(res.payload.classificationUsed, "manual");

  const appendedRows = [];
  const saved = await submitDirect(db, {
    id: "synthetic-capturer", tenantId: "synthetic-tenant", name: "Synthetic Tester", role: "exhibition_assistant",
  }, {
    submissionId: "00000000-0000-4000-8000-000000000010",
    verifiedData: { ...res.payload.parsed, meetingContext: { metAtLocation: "Synthetic Staging Drill", followUpRequired: "No" } },
    source: "ocr",
  }, new Date(), { sheet: { gateway: {
    readAll: async () => [["Contact ID"]],
    append: async row => { appendedRows.push(row); return appendedRows.length + 1; },
  } } });
  assert.equal(saved.sheetStatus, "submitted");
  assert.equal(appendedRows.length, 1);
  assert.ok(appendedRows[0].includes("Synthetic Name"));
  assert.ok(Number.isFinite(processingMs) && processingMs >= 0);
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
