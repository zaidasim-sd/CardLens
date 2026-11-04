import test from "node:test";
import assert from "node:assert/strict";
import {
  EXHIBITIONS_CATALOG,
  getActiveExhibitions,
  getExhibitionOptions,
  getDefaultExhibition,
  searchExhibitionCatalog,
} from "./exhibitions.mjs";

test("exhibitions catalog contains all 24 client events", () => {
  // All 21 attended events + 3 tracked client events (F-16 TCG, MRO Asia-Pacific, IDEAS)
  assert.equal(EXHIBITIONS_CATALOG.length, 24);
});

test("client non-attending and cancelled events are retained in catalog but hidden from default active dropdown", () => {
  const options = getExhibitionOptions(new Date("2026-11-03")).map((o) => o.value);

  // Default active dropdown must NOT show them
  assert.ok(!options.includes("F-16 TCG"));
  assert.ok(!options.includes("MRO Asia-Pacific"));
  assert.ok(!options.includes("International Defense Exhibition & Seminar (IDEAS)"));

  // But predictive search MUST find them when user searches under 'Other / Source'
  const f16Matches = searchExhibitionCatalog("F-16");
  assert.ok(f16Matches.length > 0);
  assert.equal(f16Matches[0].name, "F-16 TCG");

  const mroAsiaMatches = searchExhibitionCatalog("MRO Asia");
  assert.ok(mroAsiaMatches.length > 0);
  assert.equal(mroAsiaMatches[0].name, "MRO Asia-Pacific");

  const ideasMatches = searchExhibitionCatalog("IDEAS");
  assert.ok(ideasMatches.length > 0);
  assert.equal(ideasMatches[0].name, "International Defense Exhibition & Seminar (IDEAS)");
});

test("time window filter reduces dropdown to current ~2-month time frame", () => {
  const activeEvents = getActiveExhibitions(new Date("2026-11-03"), 45, 45);

  // Active season (October & November active events)
  assert.ok(activeEvents.length > 5 && activeEvents.length <= 14);

  const activeNames = activeEvents.map((e) => e.name);
  assert.ok(activeNames.includes("MRO Europe"));
  assert.ok(activeNames.includes("Marrakech Airshow"));
  assert.ok(activeNames.includes("Airshow China"));

  // Events from May/June 2026 should not be in active window
  assert.ok(!activeNames.includes("Black Sea Defense, Aerospace Security International Exhibition (BSDA)"));
  assert.ok(!activeNames.includes("ASA AFRA 2026"));
});

test("predictive auto-suggest finds older events and locations from master list", () => {
  const bsdaMatch = searchExhibitionCatalog("BSDA");
  assert.ok(bsdaMatch.length > 0);
  assert.equal(bsdaMatch[0].name, "Black Sea Defense, Aerospace Security International Exhibition (BSDA)");

  const farnMatch = searchExhibitionCatalog("Farnborough");
  assert.ok(farnMatch.length > 0);
  assert.equal(farnMatch[0].name, "Farnborough Airshow");

  const egyptMatch = searchExhibitionCatalog("Egypt");
  assert.ok(egyptMatch.length > 0);
  assert.equal(egyptMatch[0].name, "El Alamein International Airshow");

  const moroccoMatch = searchExhibitionCatalog("Morocco");
  assert.ok(moroccoMatch.length > 0);
  assert.equal(moroccoMatch[0].name, "Marrakech Airshow");
});

test("getDefaultExhibition dynamically resolves ongoing or recent event by date", () => {
  assert.equal(
    getDefaultExhibition(new Date("2026-05-14T12:00:00Z")),
    "Black Sea Defense, Aerospace Security International Exhibition (BSDA)"
  );

  assert.equal(
    getDefaultExhibition(new Date("2026-10-08T12:00:00Z")),
    "Marrakech Airshow"
  );

  assert.equal(
    getDefaultExhibition(new Date("2026-10-28T12:00:00Z")),
    "MRO Europe"
  );

  assert.equal(
    getDefaultExhibition(new Date("2026-11-03T12:00:00Z")),
    "MRO Europe"
  );

  assert.equal(
    getDefaultExhibition(new Date("2026-11-12T12:00:00Z")),
    "Airshow China"
  );
});

test("getDefaultExhibition respects explicit environment override", () => {
  const orig = process.env.CONFIRMED_EXHIBITION;
  try {
    process.env.CONFIRMED_EXHIBITION = "Airshow China";
    assert.equal(getDefaultExhibition(new Date("2026-05-01")), "Airshow China");
  } finally {
    if (orig !== undefined) {
      process.env.CONFIRMED_EXHIBITION = orig;
    } else {
      delete process.env.CONFIRMED_EXHIBITION;
    }
  }
});
