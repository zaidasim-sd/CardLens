export function isBatchCaptureEnabled(): boolean {
  const envEnabled = import.meta.env.VITE_ENABLE_BATCH_CAPTURE === "true";
  if (envEnabled) return true;

  try {
    return window.localStorage.getItem("lead71.batchCapture") === "enabled";
  } catch {
    return false;
  }
}

export function isStagingBatchOcrAllowed(): boolean {
  return import.meta.env.VITE_BATCH_CAPTURE_ALLOW_STAGING_OCR === "true";
}

export function getBatchApiBaseLabel(): string {
  const baseUrl = (import.meta.env.VITE_API_BASE_URL || "").trim();
  return baseUrl || "same-origin / Vite proxy";
}
