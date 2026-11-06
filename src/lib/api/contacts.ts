import type { ContactRecord, OCRData, ProcessTimings } from "@/types";
import { apiFetch } from "./client";


export interface CreateContactInput {
  submissionId: string;
  integrationSessionId?: string;
  originalImage?: Blob;
  originalFileName?: string;
  rawOCRText: string;
  ocrData: OCRData;
  verifiedData: OCRData;
  isDemo?: boolean;
  source?: "ocr" | "manual";
  allowDuplicate?: boolean;
  timings?: ProcessTimings;
}

/**
 * Submits a contact for review into the backend workflow.
 * Date/time captured and captured-by user are recorded automatically on the backend.
 *
 * Measures client-side submission time from the API call start to when the browser
 * receives the response, then fires a fire-and-forget timing patch to update the Sheet
 * with the true user-perceived duration (click → success message visible).
 */
export async function submitContact(input: CreateContactInput): Promise<ContactRecord> {
  const submissionStart = performance.now();
  const body = {
    submissionId: input.submissionId,
    integrationSessionId: input.integrationSessionId || (window.location.hostname==='lead71-cc-staging.vercel.app'?sessionStorage.getItem('l71_staging_session')||undefined:undefined),
    verifiedData: input.verifiedData,
    isDemo: input.isDemo,
    source: input.source || "ocr",
    status: "submitted",
    timings: input.timings,
  };

  const response = await apiFetch("/api/cards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const clientSubmissionMs = Math.max(0, performance.now() - submissionStart);
  const submissionSeconds = Number((clientSubmissionMs / 1000).toFixed(2));

  const record = response.record as ContactRecord;

  // Override in-memory timings with true client-perceived submission duration
  if (record) {
    if(record.integrationSessionId&&window.location.hostname==='lead71-cc-staging.vercel.app'){
      sessionStorage.setItem('l71_staging_session',record.integrationSessionId);
      sessionStorage.setItem('l71_staging_exhibition_name',record.verifiedData.meetingContext?.metAtLocation||'');
      window.dispatchEvent(new Event('lead71-staging-session'));
    }
    const scanningSeconds = Number(record.timings?.scanningSeconds || 0);
    const totalSeconds = Number((scanningSeconds + submissionSeconds).toFixed(2));
    record.timings = {
      ...(record.timings || {}),
      submissionSeconds,
      totalSeconds,
    };

    // Fire-and-forget: patch the Sheet row with the true user-perceived timings.
    // The server wrote its own server-side estimate; this corrects it asynchronously.
    const rowNumber = record._sheetRowNumber;
    if (rowNumber) {
      void apiFetch("/api/cards?action=timing_patch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowNumber, submissionSeconds, totalSeconds }),
      }).catch(() => {
        // Timing patch is best-effort; never block or surface errors to the user.
      });
    }
  }

  return record;
}

/**
 * Retrieves the contact submissions / review queue from the backend.
 */
export async function getReviewQueue(): Promise<ContactRecord[]> {
  const response = await apiFetch("/api/cards");
  return response.records as ContactRecord[];
}

export async function getReviewQueueSnapshot(): Promise<{ records: ContactRecord[]; sheetSync?: { lastSuccessAt: string | null; error: { message: string } | null } }> {
  return apiFetch("/api/cards");
}

/**
 * Updates verified contact fields (used when correcting details).
 */
export async function updateContact(
  id: string,
  verifiedData?: OCRData,
  status?: ContactRecord["status"],
  reviewerComment?: string
): Promise<ContactRecord> {
  const body: Record<string, any> = {};
  if (verifiedData) body.verifiedData = verifiedData;
  if (status) body.status = status;
  if (reviewerComment !== undefined) body.reviewerComment = reviewerComment;

  const response = await apiFetch(`/api/cards?id=${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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

export interface DuplicateReviewContext {
  record: ContactRecord;
  matches: ContactRecord[];
}

export function getDuplicateReview(id: string): Promise<DuplicateReviewContext> {
  return apiFetch(`/api/cards?action=duplicate_review&id=${encodeURIComponent(id)}`);
}

export async function resolveDuplicateReview(context: DuplicateReviewContext, decision: string, existingId?: string, fields?: string[]): Promise<ContactRecord> {
  const response = await apiFetch<{ record: ContactRecord }>(`/api/cards?action=resolve_duplicate&id=${encodeURIComponent(context.record.id)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision, existingId, fields, expectedUpdatedAt: context.record.updatedAt, expectedMatches: Object.fromEntries(context.matches.map(match => [match.id, match.updatedAt])) }),
  });
  return response.record;
}
