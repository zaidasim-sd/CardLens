import { apiFetch } from "./client";
import type { OCRData } from "@/types";
import { hasReadableContact, NO_CONTACT_MESSAGE } from "../../../shared/contactValidation.mjs";

export interface ScanResult {
  rawText: string;
  parsed: OCRData;
  provider: string;
  success: boolean;
}

/**
 * Sends a business card image to the backend OCR endpoint.
 * Backend processes the card with Google Cloud Vision as the sole approved OCR provider.
 * If processing fails, this throws a friendly error instructing the user to retake or enter manually.
 */
export async function ocrCard(file: File): Promise<ScanResult> {
  const formData = new FormData();
  formData.append("image", file);

  const data = await apiFetch<ScanResult>("/api/ocr", {
    method: "POST",
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
