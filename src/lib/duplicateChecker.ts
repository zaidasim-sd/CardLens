import { cardApi } from "./cardApi";
import type { ContactRecord, OCRData } from "../types";

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  matchedRecord?: ContactRecord;
  matchReason?: string;
}

export async function checkDuplicateContact(
  newContact: OCRData
): Promise<DuplicateCheckResult> {
  const match = await cardApi.duplicate(newContact);
  return match ? { isDuplicate: true, matchedRecord: match, matchReason: match.matchReason || "Matching contact details were found." } : { isDuplicate: false };
}
