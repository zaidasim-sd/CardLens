import type { OCRData } from "@/types";

export interface DemoCardConfig {
  id: string;
  title: string;
  personName: string;
  companyName: string;
  imagePath: string;
  preparedData: OCRData;
  rawOCRText: string;
}

export const SINGLE_DEMO_CARD: DemoCardConfig = {
  id: "anonymous-demo-card",
  title: "Demonstration card",
  personName: "Demo contact",
  companyName: "Demo company",
  imagePath: "/demo-card.svg",
  rawOCRText: "DEMONSTRATION ONLY\nDemo contact\nDemo company\nDemo role\ndemo@example.com",
  preparedData: {
    fullName: "Demo contact",
    jobTitle: "Demo role",
    companyName: "Demo company",
    email: "demo@example.com",
    phone: "",
    alternatePhone: "",
    website: "",
    address: "",
    city: "",
    country: "",
    notes: "",
    meetingContext: { metAtLocation: "", notes: "" },
  },
};
export const DEMO_CARDS: DemoCardConfig[] = [SINGLE_DEMO_CARD];
