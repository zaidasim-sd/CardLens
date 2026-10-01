export interface MeetingContext {
  metAtLocation?: string;
  whereMet?: string;
  contactType?: "Prospect" | "Customer" | "Supplier" | "Partner" | "Other" | string;
  productInterest?: string;
  relationshipOwner?: string;
  notes?: string;
  followUpDate?: string;
}

export interface OCRData {
  fullName: string;
  jobTitle: string;
  companyName: string;
  email: string;
  phone: string;
  alternatePhone: string;
  website: string;
  address: string;
  city: string;
  country: string;
  notes: string;
  meetingContext?: MeetingContext;
}

export type RecordStatus = "draft" | "submitted" | "correction_requested" | "approved" | "rejected" | "transferred";

export interface ContactRecord {
  id: string; // uuid
  originalImage?: Blob;
  originalFileName: string;
  createdAt: string; // ISO date
  updatedAt?: string;
  obtainedAt?: string;
  lastConfirmedAt?: string;
  matchReason?: string;
  duplicateReview?: {
    state: "pending" | "resolved";
    candidateIds: string[];
    reason?: string;
    decision?: "retain_existing" | "update_existing" | "keep_both" | "reject_new";
    existingId?: string | null;
    updatedFields?: string[];
  } | null;
  verifiedAt?: string;
  
  rawOCRText: string;
  ocrData: OCRData;
  verifiedData: OCRData;
  
  status: RecordStatus;
  isDemo?: boolean;
  source?: "ocr" | "manual";
  hasImage?: boolean;
  imageExpiresAt?: string | null;
  imageExpiredAt?: string | null;
  tenantId?: string;
  capturedBy?: string;
  capturedByName?: string;
  reviewedBy?: string | null;
  reviewedByName?: string | null;
  reviewedAt?: string | null;
  reviewerComment?: string;
  transferStatus?: "not_started" | "pending" | "failed" | "reconciliation_required" | "transferred" | "existing_contact";
  transferError?: string;
  sheetStatus?: string;
  restricted?: boolean;
}
