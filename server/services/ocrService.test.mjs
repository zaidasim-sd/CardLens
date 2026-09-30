import assert from "node:assert/strict";
import test from "node:test";
import { OCR_FAILURE_MESSAGE, performOCR, validateOcrConfig } from "./ocrService.js";
import { scanWithGoogleVision } from "./providers/googleVisionProvider.js";

test("Google Cloud Vision is the only OCR provider", async () => {
  const previousKey = process.env.GOOGLE_VISION_API_KEY;
  process.env.GOOGLE_VISION_API_KEY = "fake-test-key";
  let calls = 0;
  try {
    const result = await performOCR(Buffer.from("fake-image"), {
      googleVisionProvider: async (_image, key) => {
        calls += 1;
        assert.equal(key, "fake-test-key");
        return { rawText: "Fake Person", provider: "google", success: true };
      },
    });
    assert.equal(result.provider, "google");
    assert.equal(calls, 1);
    assert.deepEqual(validateOcrConfig(), { ready: true, provider: "google" });
  } finally {
    if (previousKey === undefined) delete process.env.GOOGLE_VISION_API_KEY;
    else process.env.GOOGLE_VISION_API_KEY = previousKey;
  }
});

test("Google failure returns the approved message without provider details", async () => {
  const previousKey = process.env.GOOGLE_VISION_API_KEY;
  process.env.GOOGLE_VISION_API_KEY = "fake-test-key";
  try {
    await assert.rejects(
      performOCR(Buffer.from("fake-image"), { googleVisionProvider: async () => { throw new Error("secret upstream details"); }, wait: async () => {} }),
      { message: OCR_FAILURE_MESSAGE },
    );
  } finally {
    if (previousKey === undefined) delete process.env.GOOGLE_VISION_API_KEY;
    else process.env.GOOGLE_VISION_API_KEY = previousKey;
  }
});

test("temporary Google failure is retried securely before succeeding", async () => {
  const previousKey = process.env.GOOGLE_VISION_API_KEY;
  process.env.GOOGLE_VISION_API_KEY = "fake-test-key";
  let attempts = 0;
  const waits = [];
  try {
    const result = await performOCR(Buffer.from("fake-image"), {
      googleVisionProvider: async () => {
        attempts += 1;
        if (attempts < 3) throw new Error("temporary failure");
        return { rawText: "Fake Person", provider: "google", success: true };
      },
      wait: async (milliseconds) => waits.push(milliseconds),
    });
    assert.equal(result.provider, "google");
    assert.equal(attempts, 3);
    assert.deepEqual(waits, [250, 750]);
  } finally {
    if (previousKey === undefined) delete process.env.GOOGLE_VISION_API_KEY;
    else process.env.GOOGLE_VISION_API_KEY = previousKey;
  }
});

test("Google API key is sent in a header and never in the request URL", async () => {
  let capturedUrl = "";
  let capturedOptions;
  const result = await scanWithGoogleVision(Buffer.from("fake-image"), "fake-test-key", async (url, options) => {
    capturedUrl = url;
    capturedOptions = options;
    return { ok: true, json: async () => ({ responses: [{ fullTextAnnotation: { text: "Fake Person" } }] }) };
  });
  assert.equal(result.provider, "google");
  assert.equal(capturedUrl.includes("fake-test-key"), false);
  assert.equal(capturedUrl.includes("?key="), false);
  assert.equal(capturedOptions.headers["X-Goog-Api-Key"], "fake-test-key");
});
