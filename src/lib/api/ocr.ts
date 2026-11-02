import { apiFetch } from "./client";
import type { OCRData, ProcessTimings } from "@/types";
import { hasReadableContact, NO_CONTACT_MESSAGE } from "../../../shared/contactValidation.mjs";

export type ClassificationMode = "manual" | "ai" | "compare";

export interface ClassificationComparison {
  manual: OCRData;
  ai: OCRData | null;
  aiError?: string | null;
  ocrMs: number;
  manualClassificationMs: number;
  aiClassificationMs: number;
  manualTotalMs: number;
  aiTotalMs: number;
}

export interface ScanResult {
  rawText: string;
  parsed: OCRData;
  provider: string;
  success: boolean;
  classificationUsed: ClassificationMode;
  classificationFallback: boolean;
  /** Safe sanitised error code — no OCR text or upstream data. e.g. TIMEOUT, RATE_LIMITED_UPSTREAM */
  classificationFallbackReason?: string | null;
  comparison?: ClassificationComparison;
  timings?: ProcessTimings;
}

/**
 * Sends a business card image to the backend OCR endpoint.
 * Backend processes the card with Google Cloud Vision as the sole approved OCR provider.
 * If processing fails, this throws a friendly error instructing the user to retake or enter manually.
 */
export async function ocrCard(file: File, classificationMode: ClassificationMode = "ai", backFile?: File | null): Promise<ScanResult> {
  const formData = new FormData();
  formData.append("image", file);
  if (backFile) formData.append("imageBack", backFile);

  const requestStart = performance.now();
  const data = await apiFetch<ScanResult>("/api/ocr", {
    method: "POST",
    headers: { "X-Classification-Mode": classificationMode },
    body: formData,
  });
  const requestEnd = performance.now();
  const userResponseTimeMs = Math.max(0, requestEnd - requestStart);

  if (!hasReadableContact(data.rawText, data.parsed)) {
    throw Object.assign(new Error(NO_CONTACT_MESSAGE), {
      code: "NO_CONTACT_DETECTED",
      status: 422,
    });
  }

  // Ensure OCR and Gemini times reflect the exact time user receives the response (including all processing time)
  const isGeminiActive = !data.classificationFallback && data.classificationUsed === "ai" && data.timings?.geminiSeconds != null;
  const userScanningSeconds = Number((userResponseTimeMs / 1000).toFixed(2));

  if (isGeminiActive) {
    const serverOcrMs = data.timings?.ocrMs || 0;
    const serverGeminiMs = data.timings?.geminiMs || 0;
    const serverTotalMs = serverOcrMs + serverGeminiMs;
    const ocrRatio = serverTotalMs > 0 ? serverOcrMs / serverTotalMs : 0.5;
    const userOcrSeconds = Number(((userResponseTimeMs * ocrRatio) / 1000).toFixed(2));
    const userGeminiSeconds = Number(Math.max(0, userScanningSeconds - userOcrSeconds).toFixed(2));

    data.timings = {
      ocrMs: Math.round(userResponseTimeMs * ocrRatio),
      geminiMs: Math.round(userResponseTimeMs * (1 - ocrRatio)),
      classificationMs: Math.round(userResponseTimeMs * (1 - ocrRatio)),
      scanningMs: Math.round(userResponseTimeMs),
      ocrSeconds: userOcrSeconds,
      geminiSeconds: userGeminiSeconds,
      classificationSeconds: userGeminiSeconds,
      scanningSeconds: userScanningSeconds,
    };
  } else {
    // In case of manual verification or AI fallback, Gemini time does NOT display
    data.timings = {
      ocrMs: Math.round(userResponseTimeMs),
      scanningMs: Math.round(userResponseTimeMs),
      ocrSeconds: userScanningSeconds,
      scanningSeconds: userScanningSeconds,
      geminiMs: undefined,
      geminiSeconds: undefined,
      classificationMs: undefined,
      classificationSeconds: undefined,
    };
  }

  return data;
}
