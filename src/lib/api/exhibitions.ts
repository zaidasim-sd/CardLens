import { apiFetch } from "./client";

export interface ExhibitionOption {
  label: string;
  value: string;
}

/**
 * Returns available exhibition options.
 * Defaults to "Select exhibition" placeholder until Ali Bhai and Aventure provide
 * the confirmed exhibition names for the upcoming event.
 * If backend endpoint /api/config/exhibitions becomes available, it connects automatically.
 */
export async function getExhibitions(): Promise<ExhibitionOption[]> {
  try {
    const data = await apiFetch<{ exhibitions: ExhibitionOption[] }>("/api/config/exhibitions");
    if (Array.isArray(data?.exhibitions) && data.exhibitions.length > 0) {
      return data.exhibitions;
    }
  } catch {
    // Backend endpoint not yet implemented by Haroon — fallback to clean default
  }

  return [
    { label: "Select exhibition", value: "" },
  ];
}
