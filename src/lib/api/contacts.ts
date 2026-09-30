import type { ContactRecord, OCRData } from "@/types";
import { apiFetch } from "./client";
import { compressCardImage } from "../imageCompression";

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}

export interface CreateContactInput {
  originalImage?: Blob;
  originalFileName?: string;
  rawOCRText: string;
  ocrData: OCRData;
  verifiedData: OCRData;
  isDemo?: boolean;
  source?: "ocr" | "manual";
  allowDuplicate?: boolean;
}

/**
 * Submits a contact for review into the backend workflow.
 * Date/time captured and captured-by user are recorded automatically on the backend.
 */
export async function submitContact(input: CreateContactInput): Promise<ContactRecord> {
  const image = input.originalImage ? await compressCardImage(input.originalImage) : null;
  const body = {
    rawOCRText: input.rawOCRText,
    ocrData: input.ocrData,
    verifiedData: input.verifiedData,
    originalFileName: input.originalFileName,
    isDemo: input.isDemo,
    source: input.source || "ocr",
    status: "submitted",
    allowDuplicate: input.allowDuplicate,
    imageBase64: image ? await toBase64(image) : undefined,
    imageMimeType: image?.type,
  };

  const response = await apiFetch("/api/cards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return { ...response.record, originalImage: image || undefined } as ContactRecord;
}

/**
 * Retrieves the contact submissions / review queue from the backend.
 */
export async function getReviewQueue(): Promise<ContactRecord[]> {
  const response = await apiFetch("/api/cards");
  return response.records as ContactRecord[];
}

/**
 * Updates verified contact fields (used when correcting details).
 */
export async function updateContact(
  id: string,
  verifiedData: OCRData,
  status?: ContactRecord["status"]
): Promise<ContactRecord> {
  const response = await apiFetch(`/api/cards?id=${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ verifiedData, status }),
  });
  return response.record as ContactRecord;
}

/**
 * Checks if a contact with matching email, phone, or name+company already exists in the backend.
 */
export async function checkDuplicate(verifiedData: OCRData): Promise<ContactRecord | null> {
  const response = await apiFetch("/api/cards?action=duplicate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ verifiedData }),
  });
  return (response.duplicate as ContactRecord) || null;
}

/**
 * Retrieves the card image for a given contact record.
 */
export async function getContactImage(id: string): Promise<Blob> {
  const response = await apiFetch(`/api/cards?action=image&id=${encodeURIComponent(id)}`);
  const binary = atob(response.imageBase64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: response.mimeType });
}

/**
 * Deletes a contact record (if authorized).
 */
export async function deleteContact(id: string): Promise<void> {
  await apiFetch(`/api/cards?id=${encodeURIComponent(id)}`, { method: "DELETE" });
}
