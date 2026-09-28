import axios from "axios";

/**
 * Google Cloud Vision API OCR Provider
 *
 * Performs text detection using Google Cloud Vision REST API.
 * Uses GOOGLE_VISION_API_KEY environment variable.
 *
 * @param {Buffer} imageBuffer - Raw image buffer
 * @param {string} apiKey - Google Cloud Vision API key
 * @returns {Promise<{ rawText: string, provider: 'google', success: boolean }>}
 */
export async function scanWithGoogleVision(imageBuffer, apiKey) {
  if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
    throw new Error("GOOGLE_VISION_API_KEY is missing or invalid.");
  }

  const base64Image = Buffer.isBuffer(imageBuffer)
    ? imageBuffer.toString("base64")
    : Buffer.from(imageBuffer).toString("base64");

  const requestBody = {
    requests: [
      {
        image: {
          content: base64Image,
        },
        features: [
          {
            type: "TEXT_DETECTION",
          },
        ],
      },
    ],
  };

  const response = await axios.post(
    `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey.trim())}`,
    requestBody,
    {
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 20000, // 20s timeout
    }
  );

  const data = response.data;
  const firstResponse = data?.responses?.[0];

  if (!firstResponse) {
    throw new Error("Invalid or empty response from Google Cloud Vision API.");
  }

  if (firstResponse.error) {
    const errorMsg = firstResponse.error.message || "Google Cloud Vision processing error.";
    throw new Error(errorMsg);
  }

  const rawText =
    firstResponse.fullTextAnnotation?.text ||
    firstResponse.textAnnotations?.[0]?.description ||
    "";

  return {
    rawText: rawText.trim(),
    provider: "google",
    success: true,
  };
}
