import { apiFetch } from "./client";
import type { ExhibitionSession } from '../../../shared/exhibitionSession.mjs';
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
export interface SharedExhibitionConfig {session:ExhibitionSession|null;defaultExhibition:string;exhibitions:ExhibitionOption[]}
export function getSharedExhibitionConfig():Promise<SharedExhibitionConfig> {
  return apiFetch('/api/config/exhibitions?action=session');
}
export function changeSharedExhibitionSession(input:{operation:'set'|'end';exhibition?:string;expectedVersion:string|null}):Promise<SharedExhibitionConfig> {
  return apiFetch('/api/config/exhibitions?action=session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
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
