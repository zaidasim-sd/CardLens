import { requireAction } from "../auth/permissions.js";
import { allocateRecordId } from "./recordId.js";
import { createSheetGateway, sheetField, sheetRow } from "../integrations/sheetService.js";

const failure = (code, status, message) => Object.assign(new Error(message), { code, status });

// Only counters and submission leases are persisted; the contact exists in this
// request's memory and the Google Sheet. The browser keeps fields for a retry.
export async function submitDirect(db, user, input, now = new Date(), options = {}) {
  const submissionStarted = performance.now();
  requireAction(user, "capture_card");
  requireAction(user, "submit_own_draft", { tenantId: user.tenantId, capturedBy: user.id });
  const data = input.verifiedData || {};
  if (input.status && input.status !== "submitted") throw failure("STATE_INVALID", 400, "Contacts must be submitted to Google Sheets.");
  if (!String(data.meetingContext?.metAtLocation || "").trim() ||
      (!String(data.fullName || "").trim() && !String(data.companyName || "").trim()) ||
      (!String(data.email || "").trim() && !String(data.phone || "").trim())) throw failure("CONTACT_INVALID", 400, "Enter an exhibition, a name or company, and an email or phone.");
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.email).trim())) throw failure("CONTACT_INVALID", 400, "Enter a valid email address.");
  if (data.meetingContext?.followUpRequired === "Yes" && (!String(data.meetingContext?.nextAction || "").trim() || !String(data.meetingContext?.followUpDate || "").trim())) {
    throw failure("CONTACT_INVALID", 400, "Enter a next action and due date when follow-up is required.");
  }
  const submissionId = input.submissionId || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : null);
  if (!/^[a-f0-9-]{36}$/i.test(submissionId || "")) throw failure("SUBMISSION_ID_REQUIRED", 400, "A submission reference is required. Please retry.");
  const env = options.sheet?.env || process.env;
  const gateway = options.sheet?.gateway === undefined ? createSheetGateway(env) : options.sheet.gateway;
  if (!gateway) throw failure("SHEET_NOT_CONFIGURED", 503, "Google Sheets is not configured. Your contact has not been submitted. Please retry later.");
  const key = `submission:${user.tenantId}:${user.id}:${submissionId}`;
  const settings = db.collection("settings");
  let receipt = await settings.findOne({ key });
  if (!receipt) {
    const identity = await allocateRecordId(db, now, env);
    try { await settings.insertOne({ tenantId: user.tenantId, key, ...identity, createdAt: now }); }
    catch (error) { if (error.code !== 11000) throw error; }
    receipt = await settings.findOne({ key });
  }

  const clientTimings = input.timings || {};
  const isManual = input.source === "manual";

  const ocrSeconds = !isManual && clientTimings.ocrSeconds != null && clientTimings.ocrSeconds !== ""
    ? Number(clientTimings.ocrSeconds)
    : (!isManual && clientTimings.ocrMs != null ? Number((clientTimings.ocrMs / 1000).toFixed(2)) : null);

  // Gemini time MUST NOT be recorded or displayed for manual verification / entry / fallback
  const rawGeminiSec = !isManual ? (clientTimings.geminiSeconds != null && clientTimings.geminiSeconds !== ""
    ? clientTimings.geminiSeconds
    : (clientTimings.geminiMs != null ? clientTimings.geminiMs / 1000 : null)) : null;
  const geminiSeconds = rawGeminiSec != null && !Number.isNaN(Number(rawGeminiSec))
    ? Number(Number(rawGeminiSec).toFixed(2))
    : null;

  const scanningSeconds = !isManual
    ? (clientTimings.scanningSeconds != null && clientTimings.scanningSeconds !== ""
      ? Number(clientTimings.scanningSeconds)
      : clientTimings.scanningMs != null
        ? Number((clientTimings.scanningMs / 1000).toFixed(2))
        : (ocrSeconds != null ? Number(((ocrSeconds || 0) + (geminiSeconds || 0)).toFixed(2)) : null))
    : null;

  const initialTimings = {
    ocrSeconds: ocrSeconds ?? "",
    geminiSeconds: geminiSeconds ?? "",
    classificationSeconds: geminiSeconds ?? "",
    scanningSeconds: scanningSeconds ?? "",
    submissionSeconds: "",
    totalSeconds: scanningSeconds ?? "",
  };

  const card = {
    id: submissionId, recordId: receipt.recordId, tenantId: user.tenantId,
    capturedBy: user.id, capturedByName: user.name || user.email, status: "submitted",
    createdAt: receipt.createdAt.toISOString(), updatedAt: now.toISOString(), verifiedAt: now.toISOString(),
    verifiedData: data, ocrData: {}, rawOCRText: "", hasImage: false,
    source: input.source === "manual" ? "manual" : "ocr", isDemo: Boolean(input.isDemo),
    timings: initialTimings,
  };
  if (receipt.completedAt) return { ...card, sheetStatus: "submitted" };
  const lease = new Date(Date.now() + 120000);
  const claimed = await settings.findOneAndUpdate({ key, completedAt: { $exists: false },
    $or: [{ lease: { $exists: false } }, { lease: { $lte: new Date() } }],
  }, { $set: { lease } }, { returnDocument: "after" });
  if (!claimed) throw failure("SHEET_SYNC_BUSY", 409, "This submission is processing. Keep these details and retry shortly.");
  try {
    const rows = await gateway.readAll();
    const column = rows[0]?.findIndex(header => sheetField(header) === "recordId");
    if (column === undefined || column < 0) throw failure("SHEET_COLUMNS_INVALID", 502, "The Sheet is missing the Contact ID column.");
    // Recover an uncertain successful append without overwriting reviewer edits.
    const existingIndex = rows.slice(1).findIndex(row => String(row[column] || "") === card.recordId);
    if (existingIndex < 0) {
      const rowNumber = await gateway.append(sheetRow(card));
      // Server-side timing: from function entry to sheet append completion.
      // The client will send a timing_patch with the true user-perceived duration after
      // it receives this response (click → success message), which will update the Sheet.
      const serverSubmissionMs = performance.now() - submissionStarted;
      const submissionSeconds = Number((serverSubmissionMs / 1000).toFixed(2));
      const totalSeconds = Number(((scanningSeconds || 0) + submissionSeconds).toFixed(2));
      card.timings = {
        ocrSeconds: ocrSeconds ?? "",
        geminiSeconds: geminiSeconds ?? "",
        classificationSeconds: geminiSeconds ?? "",
        scanningSeconds: scanningSeconds ?? "",
        submissionSeconds,
        totalSeconds,
      };
      card._sheetRowNumber = rowNumber;
      if (typeof gateway.update === "function") {
        try {
          await gateway.update(rowNumber, sheetRow(card));
        } catch (updateErr) {
          console.warn("[submitDirect Google Sheet timings update warning]", updateErr);
        }
      }
    }
    await settings.updateOne({ key }, { $set: { completedAt: new Date() } });
    return { ...card, sheetStatus: "submitted", _sheetRowNumber: card._sheetRowNumber };
  } catch (err) {
    console.error("[submitDirect Google Sheet error]", err);
    throw failure("SHEET_SUBMISSION_FAILED", 502, "Delivery to Google Sheets could not be confirmed. Keep these details and retry with the same reference. No contact is saved in MongoDB.");
  } finally {
    await settings.updateOne({ key }, { $unset: { lease: "" } });
  }
}
