import { apiFetch } from "./client";

export interface ExhibitionOption {
  label: string;
  value: string;
}

/** Returns configured exhibitions, with Event A–D available by default. */
export async function getExhibitions(): Promise<ExhibitionOption[]> {
  try {
    const data = await apiFetch<{ exhibitions: ExhibitionOption[] }>("/api/config/exhibitions");
    if (Array.isArray(data?.exhibitions) && data.exhibitions.some(option => option.value)) {
      return data.exhibitions;
    }
  } catch {
    // Keep the default events available if the endpoint is unavailable.
  }

  return [
    { label: "Select exhibition / source", value: "" },
    ...["Event A", "Event B", "Event C", "Event D"].map(value => ({ label: value, value })),
  ];
}
