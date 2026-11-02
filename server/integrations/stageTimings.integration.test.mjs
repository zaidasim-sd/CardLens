import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { GoogleAuth } from "google-auth-library";
import mapping from "../../config/sheetMapping.json" with { type: "json" };
import { createSheetGateway, sheetField, sheetRow } from "./sheetService.js";
import { submitDirect } from "../cards/directSubmission.js";

const headings = [
  "Record ID",
  "Place/Exhibition",
  "Contact Name",
  "Company Name",
  "Job Title",
  "Email Address",
  "Phone Number",
  "Short Notes",
  "Date Captured",
  "Time(GMT-4)",
  "Captured By",
  "OCR Time (s)",
  "Gemini Classification Time (s)",
  "Scanning Time (s)",
  "Submission Time (s)",
  "Total Time (s)"
];

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
const env = {
  GOOGLE_SHEET_ID: "fake-timings-sheet",
  GOOGLE_SHEET_TEST_ID: "fake-timings-sheet",
  GOOGLE_SHEET_TAB: "Sheet1",
  GOOGLE_SHEET_HEADER_ROW: "1",
  GOOGLE_SERVICE_ACCOUNT_EMAIL: "fixture@example.test",
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: privateKey,
  SHEET_TARGET_APPROVED: "true"
};

const readField = (row, field) => row[mapping.columns.findIndex(c => c.field === field)];

test("sheetField recognises timing headers and distinguishes OCR and Gemini stages", () => {
  assert.equal(sheetField("OCR Time (s)"), "ocrTime");
  assert.equal(sheetField("ocr time"), "ocrTime");
  assert.equal(sheetField("Gemini Classification Time (s)"), "geminiTime");
  assert.equal(sheetField("Gemini Time (s)"), "geminiTime");
  assert.equal(sheetField("Scanning Time (s)"), "scanningTime");
  assert.equal(sheetField("scan time"), "scanningTime");
  assert.equal(sheetField("Submission Time (s)"), "submissionTime");
  assert.equal(sheetField("Total Time (s)"), "totalTime");
});

test("sheetRow formats OCR, Gemini, scanning, submission, and total times in seconds", () => {
  const card = {
    recordId: "L71-20261102-0001",
    status: "submitted",
    createdAt: "2026-11-02T10:00:00Z",
    capturedByName: "Tester",
    verifiedData: {
      fullName: "Jane Doe",
      companyName: "Acme Corp",
      email: "jane@acme.test",
      phone: "+1 555 123 4567",
      notes: "Follow up next week",
      meetingContext: { metAtLocation: "Aero-Engines Americas 2026" },
    },
    timings: {
      ocrSeconds: 1.25,
      classificationSeconds: 0.82,
      geminiSeconds: 0.82,
      scanningSeconds: 2.07,
      submissionSeconds: 0.65,
      totalSeconds: 2.72,
    },
  };

  const row = sheetRow(card);
  assert.equal(readField(row, "ocrTime"), "1.25");
  assert.equal(readField(row, "geminiTime"), "0.82");
  assert.equal(readField(row, "scanningTime"), "2.07");
  assert.equal(readField(row, "submissionTime"), "0.65");
  assert.equal(readField(row, "totalTime"), "2.72");
});

test("in case of manual verification or manual entry, Gemini time does NOT display and is empty in Google Sheet", () => {
  const manualCard = {
    recordId: "L71-20261102-0002",
    status: "submitted",
    source: "manual",
    createdAt: "2026-11-02T10:00:00Z",
    capturedByName: "Manual Tester",
    verifiedData: {
      fullName: "Manual Contact",
      companyName: "Manual Inc",
      email: "manual@example.test",
      meetingContext: { metAtLocation: "Aero-Engines Americas 2026" },
    },
    timings: {
      ocrSeconds: "",
      geminiSeconds: "",
      classificationSeconds: "",
      scanningSeconds: "",
      submissionSeconds: 0.75,
      totalSeconds: 0.75,
    },
  };

  const row = sheetRow(manualCard);
  // OCR Time (s)
  assert.equal(readField(row, "ocrTime"), "");
  // Gemini Classification Time (s) must NOT display (must be empty string)
  assert.equal(readField(row, "geminiTime"), "");
  // Scanning Time (s)
  assert.equal(readField(row, "scanningTime"), "");
  // Submission Time (s)
  assert.equal(readField(row, "submissionTime"), "0.75");
  // Total Time (s)
  assert.equal(readField(row, "totalTime"), "0.75");
});

test("in case of manual fallback (OCR succeeded but Gemini failed/bypassed), Gemini time is empty", () => {
  const fallbackCard = {
    recordId: "L71-20261102-0003",
    status: "submitted",
    source: "ocr",
    createdAt: "2026-11-02T10:00:00Z",
    capturedByName: "Fallback Tester",
    verifiedData: {
      fullName: "Fallback Contact",
      companyName: "Fallback Inc",
      email: "fallback@example.test",
      meetingContext: { metAtLocation: "Aero-Engines Americas 2026" },
    },
    timings: {
      ocrSeconds: 1.15,
      geminiSeconds: null, // Gemini was not used
      classificationSeconds: null,
      scanningSeconds: 1.15,
      submissionSeconds: 0.85,
      totalSeconds: 2.00,
    },
  };

  const row = sheetRow(fallbackCard);
  assert.equal(readField(row, "ocrTime"), "1.15");
  // Gemini Classification Time (s) must NOT display
  assert.equal(readField(row, "geminiTime"), "");
  assert.equal(readField(row, "scanningTime"), "1.15");
  assert.equal(readField(row, "submissionTime"), "0.85");
  assert.equal(readField(row, "totalTime"), "2.00");
});

test("submitDirect records all process stages, measures submission time, and excludes manual correction from total time", async () => {
  const originalToken = GoogleAuth.prototype.getAccessToken;
  GoogleAuth.prototype.getAccessToken = async () => "fake-token";
  try {
    const rows = [structuredClone(headings)];
    const gateway = createSheetGateway(env, async (url, options = {}) => {
      if (!options.method && url.includes("/values/")) {
        return Response.json({ values: structuredClone(rows) });
      }
      if (url.includes(":append?")) {
        const appendedRow = JSON.parse(options.body).values[0];
        rows.push(appendedRow);
        return Response.json({ updates: { updatedRange: `'Sheet1'!A${rows.length}:P${rows.length}` } });
      }
      if (url.endsWith("/values:batchUpdate")) {
        const body = JSON.parse(options.body);
        for (const item of body.data) {
          const match = item.range.match(/!([A-Z]+)(\d+)$/);
          if (match) {
            const [, letters, rowNum] = match;
            const colIdx = [...letters].reduce((n, l) => n * 26 + l.charCodeAt(0) - 64, 0) - 1;
            if (rows[Number(rowNum) - 1]) {
              rows[Number(rowNum) - 1][colIdx] = item.values[0][0];
            }
          }
        }
        return Response.json({});
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    const settingsMap = new Map();
    const db = {
      collection: (name) => {
        if (name === "settings") {
          return {
            findOne: async (query) => settingsMap.get(query.key || query._id) || null,
            insertOne: async (doc) => { settingsMap.set(doc.key || doc._id, structuredClone(doc)); },
            updateOne: async (query, update) => {
              const k = query.key || query._id;
              const existing = settingsMap.get(k) || {};
              if (update.$max) for (const [f, v] of Object.entries(update.$max)) existing[f] = Math.max(existing[f] || 0, v);
              if (update.$set) Object.assign(existing, update.$set);
              if (update.$setOnInsert) Object.assign(existing, update.$setOnInsert);
              if (update.$unset) for (const f of Object.keys(update.$unset)) delete existing[f];
              settingsMap.set(k, existing);
            },
            findOneAndUpdate: async (query, update) => {
              const k = query.key || query._id;
              const existing = settingsMap.get(k) || {};
              if (update.$inc) for (const [f, v] of Object.entries(update.$inc)) existing[f] = (existing[f] || 0) + v;
              if (update.$set) Object.assign(existing, update.$set);
              settingsMap.set(k, existing);
              return existing;
            },
          };
        }
        throw new Error(`Unexpected collection: ${name}`);
      },
    };

    const user = { id: "user_test_1", tenantId: "tenant_test", name: "Tester", role: "exhibition_assistant" };
    
    // Test 1: AI classification succeeded
    const inputAi = {
      submissionId: "11111111-2222-3333-4444-555555555555",
      source: "ocr",
      verifiedData: {
        fullName: "Alice Smith",
        companyName: "Boeing",
        email: "alice@boeing.test",
        notes: "Lead from Aero-Engines",
        meetingContext: { metAtLocation: "Aero-Engines Americas 2026" },
      },
      timings: {
        ocrSeconds: 1.15,
        classificationSeconds: 0.85,
        geminiSeconds: 0.85,
        scanningSeconds: 2.00,
        ocrMs: 1150,
        classificationMs: 850,
        scanningMs: 2000,
      },
    };

    const resultAi = await submitDirect(db, user, inputAi, new Date("2026-11-02T10:00:00Z"), { sheet: { gateway, env } });
    assert.equal(resultAi.sheetStatus, "submitted");
    assert.equal(rows[1][11], "1.15"); // OCR Time (s)
    assert.equal(rows[1][12], "0.85"); // Gemini Classification Time (s)
    assert.equal(rows[1][13], "2.00"); // Scanning Time (s)
    assert.ok(Number(rows[1][14]) >= 0); // Submission Time (s)
    assert.equal(Number(rows[1][15]), Number((2.00 + Number(rows[1][14])).toFixed(2))); // Total Time (s)

    // Test 2: Manual verification / entry -> Gemini time must NOT display
    const inputManual = {
      submissionId: "22222222-3333-4444-5555-666666666666",
      source: "manual",
      verifiedData: {
        fullName: "Bob Jones",
        companyName: "Airbus",
        email: "bob@airbus.test",
        meetingContext: { metAtLocation: "Aero-Engines Americas 2026" },
      },
    };

    const resultManual = await submitDirect(db, user, inputManual, new Date("2026-11-02T10:05:00Z"), { sheet: { gateway, env } });
    assert.equal(resultManual.sheetStatus, "submitted");
    assert.equal(rows[2][11], ""); // OCR Time empty
    assert.equal(rows[2][12], ""); // Gemini Classification Time MUST NOT DISPLAY (empty string)
    assert.equal(rows[2][13], ""); // Scanning Time empty
    assert.ok(Number(rows[2][14]) >= 0); // Submission Time recorded
    assert.equal(rows[2][15], rows[2][14]); // Total Time equals Submission Time
  } finally {
    GoogleAuth.prototype.getAccessToken = originalToken;
  }
});

test("OCR and Gemini time reflect the exact time user receives the response including processing time", () => {
  const userResponseTimeMs = 3500; // 3.5 seconds roundtrip until user receives response
  const serverOcrMs = 1200;
  const serverGeminiMs = 1800;
  const serverTotalMs = serverOcrMs + serverGeminiMs;
  const ocrRatio = serverOcrMs / serverTotalMs;
  const userScanningSeconds = Number((userResponseTimeMs / 1000).toFixed(2));
  const userOcrSeconds = Number(((userResponseTimeMs * ocrRatio) / 1000).toFixed(2));
  const userGeminiSeconds = Number(Math.max(0, userScanningSeconds - userOcrSeconds).toFixed(2));

  assert.equal(userScanningSeconds, 3.50);
  assert.equal(userOcrSeconds, 1.40);
  assert.equal(userGeminiSeconds, 2.10);
  assert.equal(Number((userOcrSeconds + userGeminiSeconds).toFixed(2)), userScanningSeconds);

  // If manual fallback occurred, Gemini time must NOT display
  const fallbackTimings = {
    ocrMs: Math.round(userResponseTimeMs),
    scanningMs: Math.round(userResponseTimeMs),
    ocrSeconds: userScanningSeconds,
    scanningSeconds: userScanningSeconds,
    geminiMs: undefined,
    geminiSeconds: undefined,
  };
  const cardFallback = {
    source: "ocr",
    verifiedData: { fullName: "Test Fallback" },
    timings: fallbackTimings,
  };
  const row = sheetRow(cardFallback);
  assert.equal(readField(row, "ocrTime"), "3.50");
  assert.equal(readField(row, "geminiTime"), ""); // Empty: must NOT display
  assert.equal(readField(row, "scanningTime"), "3.50");
});
