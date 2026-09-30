export interface MeetingContext {
  metAtLocation?: string;
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
  verifiedAt?: string;
  
  rawOCRText: string;
  ocrData: OCRData;
  verifiedData: OCRData;
  
  status: RecordStatus;
  isDemo?: boolean;
  source?: "ocr" | "manual";
  hasImage?: boolean;
  imageExpiresAt?: string | null;
  tenantId?: string;
  capturedBy?: string;
  restricted?: boolean;
}

