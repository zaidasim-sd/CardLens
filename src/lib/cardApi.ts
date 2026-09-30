import type { ContactRecord, OCRData } from "@/types";
import { apiFetch } from "./api";
import { compressCardImage } from "./imageCompression";

async function toBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}

export const cardApi = {
  async create(input: { originalImage?: Blob; originalFileName?: string; rawOCRText: string; ocrData: OCRData; verifiedData: OCRData; isDemo?: boolean; source?: "ocr" | "manual"; allowDuplicate?: boolean }) {
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
    const response = await apiFetch("/api/cards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ...response.record, originalImage: image || undefined } as ContactRecord;
  },

  async list() {
    const response = await apiFetch("/api/cards");
    return response.records as ContactRecord[];
  },

  async update(id: string, verifiedData: OCRData, status?: ContactRecord["status"]) {
    const response = await apiFetch(`/api/cards?id=${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ verifiedData, status }) });
    return response.record as ContactRecord;
  },

  async duplicate(verifiedData: OCRData) {
    const response = await apiFetch("/api/cards?action=duplicate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ verifiedData }) });
    return response.duplicate as ContactRecord | null;
  },

  async image(id: string) {
    const response = await apiFetch(`/api/cards?action=image&id=${encodeURIComponent(id)}`);
    const binary = atob(response.imageBase64);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new Blob([bytes], { type: response.mimeType });
  },
};
