import { scanWithGoogleVision } from "./providers/googleVisionProvider.js";
import { scanWithOcrSpace } from "./providers/ocrSpaceProvider.js";

/**
 * Validates and logs OCR configuration status on server startup or request.
 */
export function validateOcrConfig() {
  const mode = (process.env.OCR_PROVIDER_MODE || "both").toLowerCase().trim();
  const hasGoogleKey = Boolean(process.env.GOOGLE_VISION_API_KEY?.trim());
  const hasOcrSpaceKey = Boolean(process.env.OCR_SPACE_API_KEY?.trim());

  console.log(`[OCR Config] Strategy mode: "${mode}"`);

  if (mode === "google") {
    if (!hasGoogleKey) {
      console.error(
        "[OCR Config] Configuration Error: GOOGLE_VISION_API_KEY is missing while OCR_PROVIDER_MODE is set to 'google'."
      );
    } else {
      console.log("[OCR Config] Google Cloud Vision provider configured (PRIMARY only).");
    }
  } else if (mode === "ocrspace") {
    if (!hasOcrSpaceKey) {
      console.error(
        "[OCR Config] Configuration Error: OCR_SPACE_API_KEY is missing while OCR_PROVIDER_MODE is set to 'ocrspace'."
      );
    } else {
      console.log("[OCR Config] OCR.space provider configured (EXCLUSIVE).");
    }
  } else if (mode === "both") {
    if (!hasGoogleKey && !hasOcrSpaceKey) {
      console.error(
        "[OCR Config] Configuration Error: Neither GOOGLE_VISION_API_KEY nor OCR_SPACE_API_KEY is configured."
      );
    } else if (!hasGoogleKey) {
      console.warn(
        "[OCR Config] Configuration Notice: GOOGLE_VISION_API_KEY is missing. Google Vision primary calls will fail and fallback to OCR.space."
      );
    } else if (!hasOcrSpaceKey) {
      console.warn(
        "[OCR Config] Configuration Notice: OCR_SPACE_API_KEY is missing. Fallback to OCR.space will not be available if Google Vision fails."
      );
    } else {
      console.log(
        "[OCR Config] Both providers configured: Google Cloud Vision (PRIMARY) with OCR.space (FALLBACK)."
      );
    }
  } else {
    console.warn(
      `[OCR Config] Unknown OCR_PROVIDER_MODE="${mode}". Falling back to default mode 'both'.`
    );
  }
}

/**
 * Executes OCR on the provided image buffer according to OCR_PROVIDER_MODE.
 *
 * Supported modes:
 * - 'both' (default): Google Cloud Vision (Primary) -> OCR.space (Fallback)
 * - 'google': Google Cloud Vision only
 * - 'ocrspace': OCR.space only
 *
 * @param {Buffer} imageBuffer - Raw binary image buffer
 * @returns {Promise<{ rawText: string, provider: 'google' | 'ocrspace', success: boolean }>}
 */
export async function performOCR(imageBuffer, options = {}) {
  const {
    googleVisionProvider = scanWithGoogleVision,
    ocrSpaceProvider = scanWithOcrSpace,
  } = options;

  const mode = (process.env.OCR_PROVIDER_MODE || "both").toLowerCase().trim();
  const googleApiKey = process.env.GOOGLE_VISION_API_KEY?.trim() || "";
  const ocrSpaceApiKey = process.env.OCR_SPACE_API_KEY?.trim() || "";

  // 1. Google Vision Only Mode
  if (mode === "google") {
    if (!googleApiKey) {
      console.error("[OCR Service] Server configuration error: GOOGLE_VISION_API_KEY is missing while mode is 'google'.");
      throw new Error("Unable to scan this business card. Please try again.");
    }

    console.log("[OCR Service] OCR provider selected: Google Vision");
    try {
      const result = await googleVisionProvider(imageBuffer, googleApiKey);
      console.log("[OCR Service] Google Vision succeeded.");
      return result;
    } catch (err) {
      console.error("[OCR Service] Google Vision failed:", err.message);
      throw new Error("Unable to scan this business card. Please try again.");
    }
  }

  // 2. OCR.space Only Mode
  if (mode === "ocrspace") {
    if (!ocrSpaceApiKey) {
      console.error("[OCR Service] Server configuration error: OCR_SPACE_API_KEY is missing while mode is 'ocrspace'.");
      throw new Error("Unable to scan this business card. Please try again.");
    }

    console.log("[OCR Service] OCR provider selected: OCR.space");
    try {
      const result = await ocrSpaceProvider(imageBuffer, ocrSpaceApiKey);
      console.log("[OCR Service] OCR.space succeeded.");
      return result;
    } catch (err) {
      console.error("[OCR Service] OCR.space failed:", err.message);
      throw new Error("Unable to scan this business card. Please try again.");
    }
  }

  // 3. Both Mode (Default): Google Vision (Primary) -> OCR.space (Fallback)
  console.log("[OCR Service] OCR provider selected: Google Vision (Primary)");

  let googleError = null;

  if (googleApiKey) {
    try {
      const result = await googleVisionProvider(imageBuffer, googleApiKey);
      console.log("[OCR Service] Google Vision OCR succeeded.");
      return result;
    } catch (err) {
      googleError = err;
      console.warn(`[OCR Service] Google Vision failed, attempting OCR.space fallback. (Reason: ${err.message})`);
    }
  } else {
    googleError = new Error("GOOGLE_VISION_API_KEY is not configured.");
    console.warn("[OCR Service] Google Vision key missing, attempting OCR.space fallback.");
  }

  // Fallback to OCR.space
  if (!ocrSpaceApiKey) {
    console.error("[OCR Service] OCR.space fallback failed: OCR_SPACE_API_KEY is not configured.");
    console.error("[OCR Service] All configured OCR providers failed.");
    throw new Error("Unable to scan this business card. Please try again.");
  }

  try {
    const fallbackResult = await ocrSpaceProvider(imageBuffer, ocrSpaceApiKey);
    console.log("[OCR Service] OCR.space fallback succeeded.");
    return fallbackResult;
  } catch (ocrSpaceErr) {
    console.error(`[OCR Service] OCR.space fallback error: ${ocrSpaceErr.message}`);
    console.error("[OCR Service] All configured OCR providers failed.");
    throw new Error("Unable to scan this business card. Please try again.");
  }
}
