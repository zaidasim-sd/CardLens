import test from "node:test";
import assert from "node:assert/strict";
import {
  EXHIBITIONS_CATALOG,
  getActiveExhibitions,
  getExhibitionOptions,
  getDefaultExhibition,
  searchExhibitionCatalog,
} from "./exhibitions.mjs";

test("exhibitions catalog contains all 21 confirmed events", () => {
  assert.equal(EXHIBITIONS_CATALOG.length, 21);
});

test("cancelled and not-attending events are excluded", () => {
  const allNames = EXHIBITIONS_CATALOG.map((e) => e.name);
  const options = getExhibitionOptions(new Date("2026-11-03"), { includeAll: true }).map((o) => o.value);

  // F-16 TCG was marked NOT ATTENDING
  assert.ok(!allNames.includes("F-16 TCG"));
  assert.ok(!options.includes("F-16 TCG"));

  // MRO Asia-Pacific was marked NOT ATTENDING
  assert.ok(!allNames.includes("MRO Asia-Pacific"));
  assert.ok(!options.includes("MRO Asia-Pacific"));

  // IDEAS was marked CANCELLED
  assert.ok(!allNames.some((n) => n.includes("IDEAS") || n.includes("International Defense Exhibition")));
  assert.ok(!options.some((v) => v.includes("IDEAS") || v.includes("International Defense Exhibition")));
});

test("time window filter reduces dropdown to current ~2-month time frame", () => {
  // On Nov 3, 2026, events within past 45 days and next 45 days
  const activeEvents = getActiveExhibitions(new Date("2026-11-03"), 45, 45);

  // Should have around 12 events (October & November), not all 21
  assert.ok(activeEvents.length > 5 && activeEvents.length <= 14);

  const activeNames = activeEvents.map((e) => e.name);
  assert.ok(activeNames.includes("MRO Europe"));
  assert.ok(activeNames.includes("Marrakech Airshow"));
  assert.ok(activeNames.includes("Airshow China"));

  // Events from May/June 2026 (e.g. BSDA, ASA AFRA) should NOT be in the active 45-day window
  assert.ok(!activeNames.includes("Black Sea Defense, Aerospace Security International Exhibition (BSDA)"));
  assert.ok(!activeNames.includes("ASA AFRA 2026"));
});

test("all dropdown options contain only clean event name (no dates, venue, or attendees)", () => {
  const options = getExhibitionOptions(new Date("2026-11-03"));
  assert.equal(options[0].value, "");
  assert.equal(options[0].label, "Select exhibition / source");

  for (const opt of options) {
    if (!opt.value) continue;
    assert.ok(!opt.value.includes("2026-"), `Option value '${opt.value}' contains ISO date`);
    assert.ok(!opt.value.includes("Complex"), `Option value '${opt.value}' contains venue`);
    assert.ok(!opt.value.includes("Airport"), `Option value '${opt.value}' contains venue`);
    assert.ok(!opt.value.includes("Hotel"), `Option value '${opt.value}' contains venue`);
  }
});

test("predictive auto-suggest finds older events and locations from master list", () => {
  // Searching older event from May
  const bsdaMatch = searchExhibitionCatalog("BSDA");
  assert.ok(bsdaMatch.length > 0);
  assert.equal(bsdaMatch[0].name, "Black Sea Defense, Aerospace Security International Exhibition (BSDA)");

  // Searching by venue/location
  const farnMatch = searchExhibitionCatalog("Farnborough");
  assert.ok(farnMatch.length > 0);
  assert.equal(farnMatch[0].name, "Farnborough Airshow");

  // Searching by city
  const egyptMatch = searchExhibitionCatalog("Egypt");
  assert.ok(egyptMatch.length > 0);
  assert.equal(egyptMatch[0].name, "El Alamein International Airshow");

  // Alias search
  const moroccoMatch = searchExhibitionCatalog("Morocco");
  assert.ok(moroccoMatch.length > 0);
  assert.equal(moroccoMatch[0].name, "Marrakech Airshow");
});

test("getDefaultExhibition dynamically resolves ongoing or recent event by date", () => {
  // During BSDA (May 13-15, 2026)
  assert.equal(
    getDefaultExhibition(new Date("2026-05-14T12:00:00Z")),
    "Black Sea Defense, Aerospace Security International Exhibition (BSDA)"
  );

  // During Marrakech Airshow (Oct 7-10, 2026)
  assert.equal(
    getDefaultExhibition(new Date("2026-10-08T12:00:00Z")),
    "Marrakech Airshow"
  );

  // During MRO Europe (Oct 27-29, 2026)
  assert.equal(
    getDefaultExhibition(new Date("2026-10-28T12:00:00Z")),
    "MRO Europe"
  );

  // On Nov 3, 2026 (recent past event within 5 days is MRO Europe)
  assert.equal(
    getDefaultExhibition(new Date("2026-11-03T12:00:00Z")),
    "MRO Europe"
  );

  // During Airshow China (Nov 10-15, 2026)
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
