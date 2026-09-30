const GOOGLE_VISION_URL = "https://vision.googleapis.com/v1/images:annotate";

export async function scanWithGoogleVision(imageBuffer, apiKey, fetcher = fetch) {
  if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) throw new Error("Google Vision is not configured");
  const response = await fetcher(GOOGLE_VISION_URL, {
    method: "POST",
    signal: AbortSignal.timeout(20000),
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey.trim() },
    body: JSON.stringify({ requests: [{ image: { content: Buffer.from(imageBuffer).toString("base64") }, features: [{ type: "TEXT_DETECTION" }] }] }),
  });
  if (!response.ok) throw new Error("Google Vision request failed");
  const data = await response.json();
  const firstResponse = data?.responses?.[0];
  if (!firstResponse || firstResponse.error) throw new Error("Google Vision processing failed");
  const rawText = firstResponse.fullTextAnnotation?.text || firstResponse.textAnnotations?.[0]?.description || "";
  return { rawText: rawText.trim(), provider: "google", success: true };
}
