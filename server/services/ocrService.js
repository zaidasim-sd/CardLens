import { scanWithGoogleVision } from "./providers/googleVisionProvider.js";

export const OCR_FAILURE_MESSAGE = "We could not read this card. Capture the card again or enter the details manually.";

export function validateOcrConfig() {
  return { ready: Boolean(process.env.GOOGLE_VISION_API_KEY?.trim()), provider: "google" };
}

export async function performOCR(imageBuffer, options = {}) {
  const googleProvider = options.googleVisionProvider || scanWithGoogleVision;
  const wait = options.wait || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const key = process.env.GOOGLE_VISION_API_KEY?.trim();
  if (!key) throw new Error(OCR_FAILURE_MESSAGE);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return await googleProvider(imageBuffer, key); }
    catch {
      if (attempt < 2) await wait(attempt === 0 ? 250 : 750);
    }
  }
  throw new Error(OCR_FAILURE_MESSAGE);
}
