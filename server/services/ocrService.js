import { scanWithGoogleVision } from "./providers/googleVisionProvider.js";

export const OCR_FAILURE_MESSAGE = "We could not read this card. Capture the card again or enter the details manually.";
const OCR_PROVIDER_FAILURE_STATUS = 503;
const OCR_MAX_ATTEMPTS = 2;
const OCR_RETRY_DELAY_MS = 250;

function safeProviderReason(caught) {
  if (caught?.code === "OCR_CONFIG_MISSING") return "CONFIG_MISSING";
  if (caught?.name === "AbortError" || caught?.name === "TimeoutError") return "TIMEOUT";
  if (caught?.code === "GOOGLE_VISION_RESPONSE_ERROR") return "UPSTREAM_RESPONSE_ERROR";
  if (Number.isInteger(caught?.upstreamStatus)) return `UPSTREAM_HTTP_${caught.upstreamStatus}`;
  if (caught?.code === "GOOGLE_VISION_UPSTREAM_ERROR") return "UPSTREAM_ERROR";
  return "NETWORK_OR_PROVIDER_ERROR";
}

function providerFailure(caught, attempts) {
  const reason = safeProviderReason(caught);
  console.warn(JSON.stringify({
    event: "ocr_provider_failure",
    provider: "google_vision",
    reason,
    attempts,
    ...(Number.isInteger(caught?.upstreamStatus) ? { upstreamStatus: caught.upstreamStatus } : {}),
    ts: new Date().toISOString(),
  }));
  return Object.assign(new Error(OCR_FAILURE_MESSAGE), {
    code: "OCR_PROVIDER_UNAVAILABLE",
    status: OCR_PROVIDER_FAILURE_STATUS,
  });
}

export function validateOcrConfig() {
  return { ready: Boolean(process.env.GOOGLE_VISION_API_KEY?.trim()), provider: "google" };
}

export async function performOCR(imageBuffer, options = {}) {
  const googleProvider = options.googleVisionProvider || scanWithGoogleVision;
  const wait = options.wait || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const key = process.env.GOOGLE_VISION_API_KEY?.trim();
  if (!key) throw providerFailure({ code: "OCR_CONFIG_MISSING" }, 0);
  let lastError;
  let attempts = 0;
  for (let attempt = 0; attempt < OCR_MAX_ATTEMPTS; attempt += 1) {
    attempts += 1;
    try { return await googleProvider(imageBuffer, key); }
    catch (caught) {
      lastError = caught;
      const retryable = caught?.retryable !== false && (
        !Number.isInteger(caught?.upstreamStatus)
        || caught.upstreamStatus === 429
        || caught.upstreamStatus >= 500
      );
      if (!retryable || attempt === OCR_MAX_ATTEMPTS - 1) break;
      await wait(OCR_RETRY_DELAY_MS);
    }
  }
  throw providerFailure(lastError, attempts);
}
