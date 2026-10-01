import type { ContactRecord, OCRData } from "@/types";
import {
  submitContact,
  getReviewQueue,
  updateContact,
  checkDuplicate,
  getContactImage,
  deleteContact,
  type CreateContactInput,
} from "./api/contacts";

export const cardApi = {
  create: (input: CreateContactInput) => submitContact(input),
  list: () => getReviewQueue(),
  update: (
    id: string,
    verifiedData?: OCRData,
    status?: ContactRecord["status"],
    reviewerComment?: string
  ) => updateContact(id, verifiedData, status, reviewerComment),
  duplicate: (verifiedData: OCRData) => checkDuplicate(verifiedData),
  image: (id: string) => getContactImage(id),
  delete: (id: string) => deleteContact(id),
};

export * from "./api/contacts";
