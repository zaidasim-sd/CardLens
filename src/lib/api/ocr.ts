import { apiFetch } from "./client";
import type { OCRData } from "@/types";
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
  comparison?: ClassificationComparison;
}

/**
 * Sends a business card image to the backend OCR endpoint.
 * Backend processes the card with Google Cloud Vision as the sole approved OCR provider.
 * If processing fails, this throws a friendly error instructing the user to retake or enter manually.
 */
export async function ocrCard(file: File, classificationMode: ClassificationMode = "compare", backFile?: File | null): Promise<ScanResult> {
  const formData = new FormData();
  formData.append("image", file);
  if (backFile) formData.append("imageBack", backFile);

  const data = await apiFetch<ScanResult>("/api/ocr", {
    method: "POST",
    headers: { "X-Classification-Mode": classificationMode },
    body: formData,
  });

  if (!hasReadableContact(data.rawText, data.parsed)) {
    throw Object.assign(new Error(NO_CONTACT_MESSAGE), {
      code: "NO_CONTACT_DETECTED",
      status: 422,
    });
  }

  return data;
}
