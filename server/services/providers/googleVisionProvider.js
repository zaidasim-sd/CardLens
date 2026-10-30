const GOOGLE_VISION_URL = "https://vision.googleapis.com/v1/images:annotate";
const GOOGLE_VISION_TIMEOUT_MS = 7000;

function visionError(message, upstreamStatus, code = "GOOGLE_VISION_UPSTREAM_ERROR") {
  return Object.assign(new Error(message), {
    code,
    ...(Number.isInteger(upstreamStatus) ? { upstreamStatus } : {}),
  });
}

export async function scanWithGoogleVision(imageBuffer, apiKey, fetcher = fetch) {
  if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
    throw visionError("Google Vision is not configured", undefined, "OCR_CONFIG_MISSING");
  }
  const response = await fetcher(GOOGLE_VISION_URL, {
    method: "POST",
    signal: AbortSignal.timeout(GOOGLE_VISION_TIMEOUT_MS),
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey.trim() },
    body: JSON.stringify({ requests: [{ image: { content: Buffer.from(imageBuffer).toString("base64") }, features: [{ type: "TEXT_DETECTION" }] }] }),
  });
  if (!response.ok) throw visionError("Google Vision request failed", response.status);
  const data = await response.json();
  const firstResponse = data?.responses?.[0];
  if (!firstResponse || firstResponse.error) {
    throw Object.assign(visionError("Google Vision processing failed", undefined, "GOOGLE_VISION_RESPONSE_ERROR"), { retryable: false });
  }
  const rawText = firstResponse.fullTextAnnotation?.text || firstResponse.textAnnotations?.[0]?.description || "";
  return { rawText: rawText.trim(), provider: "google", success: true };
}
