import { scanWithGoogleVision } from "./providers/googleVisionProvider.js";

export const OCR_FAILURE_MESSAGE = "We could not read this card. Capture the card again or enter the details manually.";

export function validateOcrConfig() {
  return { ready: Boolean(process.env.GOOGLE_VISION_API_KEY?.trim()), provider: "google" };
}

export async function performOCR(imageBuffer, options = {}) {
  const googleProvider = options.googleVisionProvider || scanWithGoogleVision;
  const key = process.env.GOOGLE_VISION_API_KEY?.trim();
  if (!key) throw new Error(OCR_FAILURE_MESSAGE);
  try { return await googleProvider(imageBuffer, key); }
  catch { throw new Error(OCR_FAILURE_MESSAGE); }
}
