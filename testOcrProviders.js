import assert from "node:assert";
import { performOCR, validateOcrConfig } from "./server/services/ocrService.js";

async function runTests() {
  console.log("=========================================");
  console.log("RUNNING OCR PROVIDER ARCHITECTURE TESTS");
  console.log("=========================================\n");

  const sampleBuffer = Buffer.from("dummy-image-content");

  // --------------------------------------------------
  // TEST 1: OCR_PROVIDER_MODE=both (Google Vision Success)
  // Expected: Google Vision called first, succeeds, OCR.space NOT called.
  // --------------------------------------------------
  console.log("--- TEST 1: Mode 'both' -> Google Vision Primary Success ---");
  process.env.OCR_PROVIDER_MODE = "both";
  process.env.GOOGLE_VISION_API_KEY = "test-google-key";
  process.env.OCR_SPACE_API_KEY = "test-ocr-key";

  let googleCalled = false;
  let ocrSpaceCalled = false;

  const mockGoogleVisionSuccess = async (buf, key) => {
    googleCalled = true;
    assert.strictEqual(key, "test-google-key");
    return { rawText: "Jane Doe\nVP Sales\nAventure Aviation", provider: "google", success: true };
  };

  const mockOcrSpaceSuccess = async (buf, key) => {
    ocrSpaceCalled = true;
    return { rawText: "Fallback Text", provider: "ocrspace", success: true };
  };

  const res1 = await performOCR(sampleBuffer, {
    googleVisionProvider: mockGoogleVisionSuccess,
    ocrSpaceProvider: mockOcrSpaceSuccess,
  });

  assert.strictEqual(res1.provider, "google");
  assert.strictEqual(googleCalled, true, "Google Vision should be called");
  assert.strictEqual(ocrSpaceCalled, false, "OCR.space should NOT be called when Google Vision succeeds");
  console.log("✓ TEST 1 PASSED: Google Vision used as primary, OCR.space not called.\n");

  // --------------------------------------------------
  // TEST 2: OCR_PROVIDER_MODE=both (Google Vision Fails -> Fallback to OCR.space)
  // Expected: Google Vision fails, OCR.space called automatically and succeeds.
  // --------------------------------------------------
  console.log("--- TEST 2: Mode 'both' -> Google Vision Fails -> OCR.space Fallback ---");
  process.env.OCR_PROVIDER_MODE = "both";
  process.env.GOOGLE_VISION_API_KEY = "test-google-key";
  process.env.OCR_SPACE_API_KEY = "test-ocr-key";

  googleCalled = false;
  ocrSpaceCalled = false;

  const mockGoogleVisionFail = async () => {
    googleCalled = true;
    throw new Error("Google Vision API rate limit / 403 Forbidden");
  };

  const res2 = await performOCR(sampleBuffer, {
    googleVisionProvider: mockGoogleVisionFail,
    ocrSpaceProvider: mockOcrSpaceSuccess,
  });

  assert.strictEqual(res2.provider, "ocrspace");
  assert.strictEqual(googleCalled, true, "Google Vision should be attempted first");
  assert.strictEqual(ocrSpaceCalled, true, "OCR.space should be called as fallback");
  console.log("✓ TEST 2 PASSED: Automatic seamless fallback to OCR.space when Google Vision fails.\n");

  // --------------------------------------------------
  // TEST 3: OCR_PROVIDER_MODE=google (Google Vision Only)
  // Expected: Only Google Vision called. OCR.space is NEVER called even if Google fails.
  // --------------------------------------------------
  console.log("--- TEST 3: Mode 'google' -> Only Google Vision Called ---");
  process.env.OCR_PROVIDER_MODE = "google";
  process.env.GOOGLE_VISION_API_KEY = "test-google-key";
  process.env.OCR_SPACE_API_KEY = "test-ocr-key";

  googleCalled = false;
  ocrSpaceCalled = false;

  const res3 = await performOCR(sampleBuffer, {
    googleVisionProvider: mockGoogleVisionSuccess,
    ocrSpaceProvider: mockOcrSpaceSuccess,
  });

  assert.strictEqual(res3.provider, "google");
  assert.strictEqual(googleCalled, true);
  assert.strictEqual(ocrSpaceCalled, false);

  // Now test failure in google-only mode
  googleCalled = false;
  ocrSpaceCalled = false;
  let caughtError = null;
  try {
    await performOCR(sampleBuffer, {
      googleVisionProvider: mockGoogleVisionFail,
      ocrSpaceProvider: mockOcrSpaceSuccess,
    });
  } catch (e) {
    caughtError = e;
  }
  assert.ok(caughtError, "Should throw error if Google Vision fails in 'google' mode");
  assert.strictEqual(ocrSpaceCalled, false, "OCR.space must NEVER be called in 'google' mode");
  assert.strictEqual(caughtError.message, "Unable to scan this business card. Please try again.");
  console.log("✓ TEST 3 PASSED: 'google' mode operates exclusively on Google Vision.\n");

  // --------------------------------------------------
  // TEST 4: OCR_PROVIDER_MODE=ocrspace (OCR.space Only)
  // Expected: Only OCR.space called. Google Vision is NEVER called.
  // --------------------------------------------------
  console.log("--- TEST 4: Mode 'ocrspace' -> Only OCR.space Called ---");
  process.env.OCR_PROVIDER_MODE = "ocrspace";
  process.env.GOOGLE_VISION_API_KEY = "test-google-key";
  process.env.OCR_SPACE_API_KEY = "test-ocr-key";

  googleCalled = false;
  ocrSpaceCalled = false;

  const res4 = await performOCR(sampleBuffer, {
    googleVisionProvider: mockGoogleVisionSuccess,
    ocrSpaceProvider: mockOcrSpaceSuccess,
  });

  assert.strictEqual(res4.provider, "ocrspace");
  assert.strictEqual(googleCalled, false, "Google Vision must NEVER be called in 'ocrspace' mode");
  assert.strictEqual(ocrSpaceCalled, true);
  console.log("✓ TEST 4 PASSED: 'ocrspace' mode operates exclusively on OCR.space.\n");

  // --------------------------------------------------
  // TEST 5: Mode 'both' -> Both Providers Fail
  // Expected: Returns friendly OCR error state.
  // --------------------------------------------------
  console.log("--- TEST 5: Mode 'both' -> Both Providers Fail ---");
  process.env.OCR_PROVIDER_MODE = "both";
  process.env.GOOGLE_VISION_API_KEY = "test-google-key";
  process.env.OCR_SPACE_API_KEY = "test-ocr-key";

  const mockOcrSpaceFail = async () => {
    throw new Error("OCR.space parse failed");
  };

  let bothFailError = null;
  try {
    await performOCR(sampleBuffer, {
      googleVisionProvider: mockGoogleVisionFail,
      ocrSpaceProvider: mockOcrSpaceFail,
    });
  } catch (e) {
    bothFailError = e;
  }
  assert.ok(bothFailError);
  assert.strictEqual(bothFailError.message, "Unable to scan this business card. Please try again.");
  console.log("✓ TEST 5 PASSED: Returns friendly error when both providers fail.\n");

  // --------------------------------------------------
  // TEST 6: Startup Configuration Validation
  // --------------------------------------------------
  console.log("--- TEST 6: Configuration Validation ---");
  process.env.OCR_PROVIDER_MODE = "both";
  delete process.env.GOOGLE_VISION_API_KEY;
  validateOcrConfig();

  process.env.OCR_PROVIDER_MODE = "google";
  validateOcrConfig();

  process.env.OCR_PROVIDER_MODE = "ocrspace";
  validateOcrConfig();

  console.log("✓ TEST 6 PASSED: Configuration validation handles missing keys gracefully.\n");

  console.log("=========================================");
  console.log("ALL OCR ARCHITECTURE TESTS PASSED (6/6)");
  console.log("=========================================");
}

runTests().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
