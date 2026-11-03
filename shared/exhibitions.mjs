/**
 * Confirmed exhibitions master catalog for Lead71.
 * Source: Official tradeshow master schedule.
 * Cancelled / Not Attending events (F-16 TCG, MRO Asia-Pacific, IDEAS) are excluded.
 */
export const EXHIBITIONS_CATALOG = [
  {
    name: "Black Sea Defense, Aerospace Security International Exhibition (BSDA)",
    venue: "Romaero Complex",
    location: "Bucharest, Romania",
    startDate: "2026-05-13",
    endDate: "2026-05-15",
  },
  {
    name: "ASA AFRA 2026",
    venue: "Four Seasons Resort & Spa",
    location: "Las Vegas, Nevada",
    startDate: "2026-06-14",
    endDate: "2026-06-16",
  },
  {
    name: "MRO Beer (Baltics & Eastern European Region)",
    venue: "Hilton Istanbul Bosphorus",
    location: "Istanbul, Turkey",
    startDate: "2026-06-17",
    endDate: "2026-06-18",
  },
  {
    name: "SEUS-CP (Southeast United States-Canadian Provinces Conference)",
    venue: "Hyatt Regency",
    location: "Greenville, South Carolina",
    startDate: "2026-06-21",
    endDate: "2026-06-23",
  },
  {
    name: "Farnborough Airshow",
    venue: "Farnborough International Exhibition & Conference Centre",
    location: "Farnborough, UK",
    startDate: "2026-07-20",
    endDate: "2026-07-24",
  },
  {
    name: "Air Carriers Purchasing Conference (ACPC)",
    venue: "Grande Lakes Orlando",
    location: "Orlando, FL",
    startDate: "2026-08-29",
    endDate: "2026-09-01",
  },
  {
    name: "El Alamein International Airshow",
    venue: "El Alamein International Airport",
    location: "El Alamein, Egypt",
    startDate: "2026-09-08",
    endDate: "2026-09-10",
  },
  {
    name: "Airline Economics Growth Frontiers London 2026",
    venue: "The Tower of London / The Royal HorseGuards Hotel",
    location: "London, England",
    startDate: "2026-09-08",
    endDate: "2026-09-10",
  },
  {
    name: "Airline Economics Dubai",
    venue: "Ritz Carlton Dubai Beach Hotel",
    location: "Dubai, UAE",
    startDate: "2026-10-05",
    endDate: "2026-10-07",
  },
  {
    name: "MRO Brazil",
    venue: "Centro de Convenções Frei Caneca",
    location: "Sao Paulo, Brazil",
    startDate: "2026-10-07",
    endDate: "2026-10-08",
  },
  {
    name: "Marrakech Airshow",
    venue: "Royal Moroccan Air Force Base",
    location: "Marrakech, Morocco",
    startDate: "2026-10-07",
    endDate: "2026-10-10",
    aliases: ["Morocco Airshow 2026", "Morocco Airshow"],
  },
  {
    name: "AUSA",
    venue: "Walter E. Washington Convention Center",
    location: "Washington, DC",
    startDate: "2026-10-12",
    endDate: "2026-10-14",
  },
  {
    name: "C-130 TCG",
    venue: "Caribe Royale Resort",
    location: "Orlando, FL",
    startDate: "2026-10-19",
    endDate: "2026-10-23",
  },
  {
    name: "NBAA Business Aviation Convention & Exhibition (NBAA-BACE)",
    venue: "Las Vegas Convention Center",
    location: "Las Vegas, Nevada",
    startDate: "2026-10-20",
    endDate: "2026-10-22",
  },
  {
    name: "Global Defense Aviation",
    venue: "Hilton Warsaw",
    location: "Warsaw, Poland",
    startDate: "2026-10-20",
    endDate: "2026-10-22",
  },
  {
    name: "Africa International Defence Exhibition (AFRIDEX)",
    venue: "Eko Atlantic",
    location: "Lagos, Nigeria",
    startDate: "2026-10-26",
    endDate: "2026-10-29",
  },
  {
    name: "MRO Europe",
    venue: "RAI",
    location: "Amsterdam, Netherlands",
    startDate: "2026-10-27",
    endDate: "2026-10-29",
  },
  {
    name: "Airshow China",
    venue: "Zhuhai International Airshow Center",
    location: "Zhuhai, China",
    startDate: "2026-11-10",
    endDate: "2026-11-15",
  },
  {
    name: "F-15 TCP",
    venue: "Rosen Centre",
    location: "Orlando, FL",
    startDate: "2026-11-16",
    endDate: "2026-11-19",
  },
  {
    name: "Bahrain Airshow",
    venue: "Sakhir Air Base",
    location: "Manama, Bahrain",
    startDate: "2026-11-18",
    endDate: "2026-11-20",
  },
  {
    name: "Asian Defense & Security (ADAS)",
    venue: "World Trade Center",
    location: "Manila, Philippines",
    startDate: "2027-06-28",
    endDate: "2027-06-30",
  },
];

/** Flat list of all official exhibition names + aliases */
export const ALL_EXHIBITION_NAMES = EXHIBITIONS_CATALOG.map((e) => e.name);

function toDateString(date) {
  if (date instanceof Date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof date === "string" && date.length >= 10) {
    return date.slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

/**
 * Filters the catalog to events occurring in the current relevant window
 * (e.g., past 45 days to next 45 days, approximately ~2 months around today).
 */
export function getActiveExhibitions(refDate = new Date(), pastDays = 45, futureDays = 45) {
  const dateStr = toDateString(refDate);
  const refTime = new Date(dateStr).getTime();
  const msDay = 86400000;
  const minTime = refTime - pastDays * msDay;
  const maxTime = refTime + futureDays * msDay;

  return EXHIBITIONS_CATALOG.filter((item) => {
    const startTime = new Date(item.startDate).getTime();
    const endTime = new Date(item.endDate).getTime();
    // Overlaps the window
    return endTime >= minTime && startTime <= maxTime;
  });
}

/**
 * Returns formatted dropdown options for the exhibition selector.
 * Focuses on active/recent tradeshows within the current time frame (~2 months)
 * to keep mobile navigation fast and uncluttered.
 *
 * @param {Date|string} [refDate] Reference date (default: now)
 * @param {Object} [cfg]
 * @param {number} [cfg.pastDays=45] Days in past to include
 * @param {number} [cfg.futureDays=45] Days in future to include
 * @param {string} [cfg.currentEvent] If an existing card has an older event, include it in dropdown
 * @param {boolean} [cfg.includeAll=false] If true, includes all 21 catalog items
 */
export function getExhibitionOptions(refDate = new Date(), cfg = {}) {
  const {
    pastDays = 45,
    futureDays = 45,
    currentEvent = "",
    includeAll = false,
  } = cfg;

  const items = includeAll
    ? EXHIBITIONS_CATALOG
    : getActiveExhibitions(refDate, pastDays, futureDays);

  const options = [{ label: "Select exhibition / source", value: "" }];
  const added = new Set();

  for (const item of items) {
    options.push({ label: item.name, value: item.name });
    added.add(item.name);
  }

  // If a card already has an older event selected, make sure it is in the options
  if (currentEvent && !added.has(currentEvent) && currentEvent !== "Other / Source") {
    options.push({ label: currentEvent, value: currentEvent });
    added.add(currentEvent);
  }

  // Backward compatibility alias for "Morocco Airshow 2026"
  if (!added.has("Morocco Airshow 2026")) {
    options.push({ label: "Morocco Airshow 2026", value: "Morocco Airshow 2026" });
  }

  options.push({ label: "Other / Source", value: "Other / Source" });
  return options;
}

/**
 * Dynamically resolves the active or most recent exhibition based on reference date,
 * respecting any explicit environment override.
 */
export function getDefaultExhibition(refDate = new Date()) {
  // 1. Explicit environment override
  const envVal =
    (typeof process !== "undefined" && (process.env?.CONFIRMED_EXHIBITION || process.env?.DEFAULT_EXHIBITION || process.env?.VITE_CONFIRMED_EXHIBITION)) ||
    (typeof import.meta !== "undefined" && (import.meta.env?.VITE_CONFIRMED_EXHIBITION || import.meta.env?.CONFIRMED_EXHIBITION));

  const trimmedEnv = typeof envVal === "string" ? envVal.trim() : "";
  if (trimmedEnv && trimmedEnv !== "Aero-Engines Americas 2026") {
    return trimmedEnv;
  }

  const dateStr = toDateString(refDate);

  // 2. Currently ongoing event (startDate <= today <= endDate)
  const ongoing = EXHIBITIONS_CATALOG
    .filter((e) => e.startDate <= dateStr && dateStr <= e.endDate)
    .sort((a, b) => b.endDate.localeCompare(a.endDate) || b.startDate.localeCompare(a.startDate));
  if (ongoing.length > 0) return ongoing[0].name;

  // 3. Past events (ended before today), latest first
  const past = EXHIBITIONS_CATALOG
    .filter((e) => e.endDate < dateStr)
    .sort((a, b) => b.endDate.localeCompare(a.endDate) || b.startDate.localeCompare(a.startDate));

  // 4. Upcoming events (starts after today), earliest first
  const upcoming = EXHIBITIONS_CATALOG
    .filter((e) => e.startDate > dateStr)
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate));

  if (past.length > 0) {
    const recentPast = past[0];
    const msPerDay = 86400000;
    const daysSincePast = (new Date(dateStr).getTime() - new Date(recentPast.endDate).getTime()) / msPerDay;

    if (upcoming.length > 0) {
      const nextUpcoming = upcoming[0];
      const daysUntilNext = (new Date(nextUpcoming.startDate).getTime() - new Date(dateStr).getTime()) / msPerDay;

      if (daysUntilNext <= 3 && daysUntilNext < daysSincePast) {
        return nextUpcoming.name;
      }
    }
    return recentPast.name;
  }

  if (upcoming.length > 0) {
    return upcoming[0].name;
  }

  return EXHIBITIONS_CATALOG[0].name;
}

/**
 * Predictive search across the entire master catalog.
 * Matches against event name, venue, city, and aliases.
 * Returns up to `limit` clean event names.
 */
export function searchExhibitionCatalog(query = "", limit = 5) {
  const q = String(query).trim().toLowerCase();
  if (!q) return [];

  const results = [];
  const seen = new Set();

  for (const item of EXHIBITIONS_CATALOG) {
    const nameMatch = item.name.toLowerCase().includes(q);
    const venueMatch = item.venue && item.venue.toLowerCase().includes(q);
    const locationMatch = item.location && item.location.toLowerCase().includes(q);
    const aliasMatch = item.aliases && item.aliases.some((a) => a.toLowerCase().includes(q));

    if (nameMatch || venueMatch || locationMatch || aliasMatch) {
      if (!seen.has(item.name)) {
        seen.add(item.name);
        results.push({
          name: item.name,
          location: item.location || "",
          dates: `${item.startDate.slice(5)} to ${item.endDate.slice(5)}`,
        });
        if (results.length >= limit) break;
      }
    }
  }

  return results;
}
