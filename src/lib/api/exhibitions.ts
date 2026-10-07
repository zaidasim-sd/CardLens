import { apiFetch } from "./client";
import { getExhibitionOptions } from "../../../shared/exhibitions.mjs";

export interface ExhibitionOption {
  label: string;
  value: string;
}

/** Uses the same code-based exhibition list as the API when it is offline. */
export async function getExhibitions(): Promise<ExhibitionOption[]> {
  try {
    const data = await apiFetch<{ exhibitions: ExhibitionOption[] }>("/api/config/exhibitions");
    if (Array.isArray(data?.exhibitions) && data.exhibitions.length > 0) {
      return data.exhibitions;
    }
  } catch {
    // Keep fallback available if endpoint is offline
  }

  return getExhibitionOptions();
}
