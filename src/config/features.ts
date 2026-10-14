export function isBatchCaptureEnabled(): boolean {
  if (import.meta.env.VITE_ENABLE_BATCH_CAPTURE === "false") return false;
  return true;
}

export function isStagingBatchOcrAllowed(): boolean {
  if (import.meta.env.VITE_BATCH_CAPTURE_ALLOW_STAGING_OCR === "false") return false;
  return true;
}

export function getBatchApiBaseLabel(): string {
  const baseUrl = (import.meta.env.VITE_API_BASE_URL || "").trim();
  return baseUrl || "same-origin / Vite proxy";
}
