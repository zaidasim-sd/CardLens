export interface ExhibitionCatalogItem {
  name: string;
  venue?: string;
  location?: string;
  startDate: string;
  endDate: string;
  aliases?: string[];
  clientStatus?: "cancelled" | "not_attending";
}

export interface ExhibitionSearchSuggestion {
  name: string;
  location: string;
  dates: string;
}

export const EXHIBITIONS_CATALOG: ExhibitionCatalogItem[];
export const ALL_EXHIBITION_NAMES: string[];

export function getActiveExhibitions(
  refDate?: Date | string,
  pastDays?: number,
  futureDays?: number
): ExhibitionCatalogItem[];

export function getExhibitionOptions(
  refDate?: Date | string,
  cfg?: {
    pastDays?: number;
    futureDays?: number;
    currentEvent?: string;
    includeAll?: boolean;
  }
): Array<{ label: string; value: string }>;

export function getDefaultExhibition(refDate?: Date | string): string;

export function searchExhibitionCatalog(
  query: string,
  limit?: number
): ExhibitionSearchSuggestion[];
