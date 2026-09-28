import axios from "axios";
import FormData from "form-data";

/**
 * OCR.space API OCR Provider
 *
 * Performs text detection using OCR.space API.
 * Uses OCR_SPACE_API_KEY environment variable.
 *
 * @param {Buffer} imageBuffer - Raw image buffer
 * @param {string} apiKey - OCR.space API key
 * @returns {Promise<{ rawText: string, provider: 'ocrspace', success: boolean }>}
 */
export async function scanWithOcrSpace(imageBuffer, apiKey) {
  if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
    throw new Error("OCR_SPACE_API_KEY is missing or invalid.");
  }

  const form = new FormData();
  form.append("file", imageBuffer, { filename: "business-card.jpg" });
  form.append("apikey", apiKey.trim());
  form.append("OCREngine", "2");

  const response = await axios.post("https://api.ocr.space/parse/image", form, {
    headers: form.getHeaders(),
    timeout: 25000, // 25s timeout
  });

  const data = response.data;

  // Handle OCR.space specific API processing errors
  if (data.IsErroredOnProcessing) {
    const errMsg = Array.isArray(data.ErrorMessage)
      ? data.ErrorMessage.join(" ")
      : String(data.ErrorMessage || "OCR.space processing error");
    throw new Error(errMsg);
  }

  if (!data.ParsedResults || data.ParsedResults.length === 0) {
    return {
      rawText: "",
      provider: "ocrspace",
      success: true,
    };
  }

  const rawText = data.ParsedResults[0]?.ParsedText || "";

  return {
    rawText: rawText.trim(),
    provider: "ocrspace",
    success: true,
  };
}
