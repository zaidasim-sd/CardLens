import { apiFetch } from "./client";

export interface ExhibitionOption {
  label: string;
  value: string;
}

/** Returns configured exhibitions with confirmed exhibition and Other / Source fallback. */
export async function getExhibitions(): Promise<ExhibitionOption[]> {
  try {
    const data = await apiFetch<{ exhibitions: ExhibitionOption[] }>("/api/config/exhibitions");
    if (Array.isArray(data?.exhibitions) && data.exhibitions.length > 0) {
      return data.exhibitions;
    }
  } catch {
    // Keep fallback available if endpoint is offline
  }

  const confirmed = (import.meta.env.VITE_CONFIRMED_EXHIBITION || "").trim();
  const options: ExhibitionOption[] = [
    { label: "Select exhibition / source", value: "" },
  ];
  if (confirmed) {
    options.push({ label: confirmed, value: confirmed });
  }
  options.push({ label: "Other / Source", value: "Other / Source" });
  return options;
}
