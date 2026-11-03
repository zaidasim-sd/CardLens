import { apiFetch } from "./client";
import {
  getExhibitionOptions,
  getDefaultExhibition,
  searchExhibitionCatalog,
  ALL_EXHIBITION_NAMES,
  type ExhibitionSearchSuggestion,
} from "../../../shared/exhibitions.mjs";

export interface ExhibitionOption {
  label: string;
  value: string;
}

export interface ExhibitionsConfigResponse {
  exhibitions: ExhibitionOption[];
  allExhibitions?: string[];
  defaultExhibition?: string;
}

/** Uses the time-windowed exhibition list (past 45 days / next 45 days) */
export async function getExhibitions(): Promise<ExhibitionOption[]> {
  try {
    const data = await apiFetch<ExhibitionsConfigResponse>("/api/config/exhibitions");
    if (Array.isArray(data?.exhibitions) && data.exhibitions.length > 0) {
      return data.exhibitions;
    }
  } catch {
    // Keep fallback available if endpoint is offline
  }

  return getExhibitionOptions();
}

/** Fetches or calculates the default (recent or active) exhibition. */
export async function fetchDefaultExhibition(): Promise<string> {
  try {
    const data = await apiFetch<ExhibitionsConfigResponse>("/api/config/exhibitions");
    if (data?.defaultExhibition) {
      return data.defaultExhibition;
    }
  } catch {
    // Fallback to local resolver
  }

  return getDefaultExhibition();
}

export {
  getDefaultExhibition,
  getExhibitionOptions,
  searchExhibitionCatalog,
  ALL_EXHIBITION_NAMES,
  type ExhibitionSearchSuggestion,
};
