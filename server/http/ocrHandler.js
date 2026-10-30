import { createHash } from "node:crypto";
import { getDb, ensureDatabaseIndexes } from "../db.js";
import { authenticate, verifyCsrf } from "../auth/service.js";
import { requireAction } from "../auth/permissions.js";
import { parseCookies, SESSION_COOKIE } from "../auth/cookies.js";
import { hasReadableContact } from "../../shared/contactValidation.mjs";
import { parseOCRText } from "../services/cardParser.js";
import { classifyWithGemini } from "../services/cardClassification.js";
import { OCR_FAILURE_MESSAGE, performOCR } from "../services/ocrService.js";

export const OCR_MAX_BYTES = 20 * 1024 * 1024;

// Only fixed messages are returned; upstream responses, OCR text and keys stay private.
export function classificationFailureMessage(caught) {
  if (caught?.code === "AI_KEY_MISSING") return "The server's Gemini API key is missing.";
  if (caught?.code === "AI_INPUT_INVALID") return "The card text is empty or too long for AI classification.";
  if (caught?.message === "Classification timeout" || caught?.name === "AbortError") return "AI classification exceeded the configured time limit.";
  if (caught?.upstreamStatus === 429) return "Gemini's rate limit or quota was reached. Try again later.";
  if ([401, 403].includes(caught?.upstreamStatus)) return "Gemini rejected the server's API credentials or permissions.";
  if ([400, 404].includes(caught?.upstreamStatus)) return "Gemini rejected the model or request configuration.";
  if (caught?.upstreamStatus >= 500) return "Gemini is temporarily unavailable. Try again later.";
  if (caught?.message === "fetch failed") return "The server could not connect to Gemini. Try again.";
  if (caught?.message === "Invalid model") return "The configured Gemini model is invalid.";
  return "AI returned an incomplete or invalid result that could not be safely used.";
}
// Rate limits — tuned for real exhibition Road Warrior volume.
// A single user scanning cards continuously at a live show can easily hit 30/hr.
// These are server-side guards against abuse, not workflow throttles.
// Override via OCR_USER_HOURLY_LIMIT / OCR_IP_HOURLY_LIMIT env vars.
const OCR_USER_LIMIT = Number(process.env.OCR_USER_HOURLY_LIMIT) || 120;
const OCR_IP_LIMIT  = Number(process.env.OCR_IP_HOURLY_LIMIT)   || 240;

function error(code, status, message = OCR_FAILURE_MESSAGE) {
  return Object.assign(new Error(message), { code, status });
}

function digest(value) {
  return createHash("sha256").update(String(value || "unknown")).digest("hex");
}

function allowedOrigins(env) {
  const configured = String(env.ALLOWED_ORIGINS || env.APP_BASE_URL || env.APP_ORIGIN || "")
    .split(",").map((value) => value.trim()).filter(Boolean);
  if (env.APP_ENV === "development" || env.NODE_ENV !== "production") {
    const extras = [
      // localhost on all common Vite ports
      "https://localhost:5173", "http://localhost:5173",
      "https://localhost:5174", "http://localhost:5174",
      "https://localhost:5175", "http://localhost:5175",
      "https://127.0.0.1:5173", "http://127.0.0.1:5173",
      "https://127.0.0.1:5174", "http://127.0.0.1:5174",
    ];
    // Explicit LAN origin override from .env (no VITE_ prefix so Express can read it)
    if (env.DEV_NETWORK_ORIGIN) extras.push(env.DEV_NETWORK_ORIGIN.trim());
    return [...new Set([...configured, ...extras])];
  }
  return configured;
}

/** Returns true when the origin looks like a private LAN address (dev only). */
function isLanOrigin(origin) {
  return /^https?:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/.test(origin);
}

function verifyOrigin(req, env) {
  const origin = String(req.headers.origin || "");
  if (!origin) throw error("ORIGIN_DENIED", 403);
  // In dev mode, also allow any private-network LAN origin (for phone testing).
  const isDev = env.APP_ENV === "development" || env.NODE_ENV !== "production";
  if (isDev && isLanOrigin(origin)) return;
  if (!allowedOrigins(env).includes(origin)) throw error("ORIGIN_DENIED", 403);
}

async function readBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body);
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > OCR_MAX_BYTES * 2 + 64 * 1024) throw error("IMAGE_TOO_LARGE", 413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function multipartImages(body, contentType) {
  const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.slice(1).find(Boolean);
  if (!boundary) throw error("IMAGE_REQUIRED", 400);
  const marker = Buffer.from(`--${boundary}`);
  const images = [];
  let cursor = body.indexOf(marker);
  while (cursor >= 0) {
    const next = body.indexOf(marker, cursor + marker.length);
    if (next < 0) break;
    const part = body.subarray(cursor + marker.length, next);
    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd >= 0) {
      const headers = part.subarray(0, headerEnd).toString("utf8");
      const name = headers.match(/name="([^"]+)"/i)?.[1];
      const mimeType = headers.match(/Content-Type:\s*([^\r\n]+)/i)?.[1]?.trim().toLowerCase();
      if (["image", "imageBack"].includes(name)) {
        let data = part.subarray(headerEnd + 4);
        if (data.subarray(-2).equals(Buffer.from("\r\n"))) data = data.subarray(0, -2);
        images.push({ data, mimeType });
      }
    }
    cursor = next;
  }
  return images;
}

function requestImages(body, contentType) {
  const images = contentType.includes("multipart/form-data")
    ? multipartImages(body, contentType)
    : [{ data: body, mimeType: contentType.split(";")[0].toLowerCase() }];
  if (!images.length || images.some((image) => !image.data.length)) throw error("IMAGE_REQUIRED", 400);
  for (const image of images) {
    if (image.data.length > OCR_MAX_BYTES) throw error("IMAGE_TOO_LARGE", 413);
    if (!["image/jpeg", "image/png", "image/webp"].includes(image.mimeType)) throw error("IMAGE_TYPE_INVALID", 415);
  }
  return images;
}

async function consumeLimit(db, key, limit, now = new Date()) {
  const windowStartedAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours()));
  const expiresAt = new Date(windowStartedAt.getTime() + 60 * 60 * 1000);
  const result = await db.collection("rateLimits").findOneAndUpdate(
    { key },
    { $inc: { count: 1 }, $setOnInsert: { windowStartedAt, expiresAt } },
    { upsert: true, returnDocument: "after" },
  );
  if (result.count > limit) throw error("OCR_RATE_LIMITED", 429);
}

async function consumeMonthlyCap(db, tenantId, env, now = new Date()) {
  const cap = Math.max(1, Number.parseInt(env.OCR_MONTHLY_CAP || "900", 10) || 900);
  const month = now.toISOString().slice(0, 7);
  const key = `ocr:month:${tenantId}:${month}`;
  const expiresAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 2));
  const result = await db.collection("rateLimits").findOneAndUpdate(
    { key },
    { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
    { upsert: true, returnDocument: "after" },
  );
  if (result.count > cap) throw error("OCR_MONTHLY_CAP_REACHED", 429);
}

// ─── AI fallback monitoring ───────────────────────────────────────────────────
// Emits a structured log event when Gemini classification fails and the
// fallback rule-based parser is used. No OCR text, card data, keys or upstream
// response bodies are ever logged.
function logAiFallback(caught, tenantId, env) {
  const safeCode = (v) => typeof v === "string" && /^[A-Z0-9_]{1,40}$/.test(v) ? v : "UNKNOWN";
  const reason = caught?.code
    ? safeCode(caught.code)
    : caught?.message === "Classification timeout" || caught?.name === "AbortError"
      ? "TIMEOUT"
      : caught?.upstreamStatus === 429
        ? "RATE_LIMITED_UPSTREAM"
        : caught?.upstreamStatus >= 500
          ? "UPSTREAM_UNAVAILABLE"
          : caught?.upstreamStatus
            ? `HTTP_${caught.upstreamStatus}`
            : "VALIDATION_FAILED";
  // Structured log — safe for Vercel Function logs. Never includes card data.
  console.warn(JSON.stringify({
    event: "ai_classification_fallback",
    reason,
    tenantId: tenantId || "unknown",
    model: env.GEMINI_CLASSIFICATION_MODEL || "gemini-3.5-flash-lite",
    ts: new Date().toISOString(),
  }));
  return reason;
}
// ─────────────────────────────────────────────────────────────────────────────

export function createOcrHandler(dependencies = {}) {
  const database = dependencies.getDb || getDb;
  const runOcr = dependencies.performOCR || performOCR;
  const classify = dependencies.classifyWithGemini || classifyWithGemini;
  const auth = dependencies.authenticate || authenticate;
  const ensureIndexes = dependencies.ensureDatabaseIndexes || ensureDatabaseIndexes;
  const env = dependencies.env || process.env;
  return async function ocrHandler(req, res) {
    let imageBody;
    let stage = "request_validation";
    try {
      if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
      verifyOrigin(req, env);
      const classificationMode = req.headers["x-classification-mode"] || "manual";
      if (!["manual", "ai", "compare"].includes(classificationMode)) throw error("CLASSIFICATION_MODE_INVALID", 400, "Invalid classification mode.");
      stage = "database";
      const db = await database();
      await ensureIndexes(db);
      stage = "authentication";
      const sessionToken = parseCookies(req.headers.cookie || "")[SESSION_COOKIE];
      const signedIn = await auth(db, sessionToken);
      verifyCsrf(signedIn.session, req.headers["x-csrf-token"]);
      requireAction(signedIn.user, "use_ocr");
      stage = "request_limits";
      const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
      const hour = new Date().toISOString().slice(0, 13);
      await consumeLimit(db, `ocr:user:${signedIn.user.id}:${hour}`, OCR_USER_LIMIT);
      await consumeLimit(db, `ocr:ip:${digest(ip)}:${hour}`, OCR_IP_LIMIT);
      await consumeMonthlyCap(db, signedIn.user.tenantId, env);
      stage = "image_validation";
      const body = await readBody(req);
      imageBody = body;
      const images = requestImages(body, String(req.headers["content-type"] || ""));
      const results = [];
      const ocrStarted = performance.now();
      stage = "google_vision";
      for (const image of images) results.push(await runOcr(image.data));
      const ocrMs = performance.now() - ocrStarted;
      const rawText = results.map((result) => result.rawText || "").filter(Boolean).join("\n\n");
      stage = "classification";
      if (classificationMode === "compare") {
        const manualStarted = performance.now();
        const manual = parseOCRText(rawText);
        const manualClassificationMs = performance.now() - manualStarted;
        const aiStarted = performance.now();
        let ai = null;
        let aiError = null;
        try { ai = await classify(rawText, { env }); } catch (caught) { aiError = classificationFailureMessage(caught); logAiFallback(caught, signedIn.user.tenantId, env); }
        const aiClassificationMs = performance.now() - aiStarted;
        if (!hasReadableContact(rawText, manual) && (!ai || !hasReadableContact(rawText, ai))) throw error("NO_CONTACT_DETECTED", 422);
        return res.status(200).json({ rawText, parsed: ai || manual, provider: "google", success: true,
          classificationUsed: ai ? "ai" : "manual", classificationFallback: !ai,
          comparison: { manual, ai, aiError, ocrMs, manualClassificationMs, aiClassificationMs,
            manualTotalMs: ocrMs + manualClassificationMs, aiTotalMs: ocrMs + aiClassificationMs } });
      }
      let parsed;
      let classificationUsed = "manual";
      let classificationFallback = false;
      let classificationFallbackReason = null;
      if (classificationMode === "ai") {
        try {
          parsed = await classify(rawText, { env });
          if (!hasReadableContact(rawText, parsed)) throw Object.assign(new Error("AI classification returned no readable contact fields."), { code: "AI_RESULT_INVALID" });
          classificationUsed = "ai";
        } catch (caught) {
          classificationFallback = true;
          classificationFallbackReason = logAiFallback(caught, signedIn.user.tenantId, env);
          parsed = parseOCRText(rawText);
        }
      } else {
        parsed = parseOCRText(rawText);
      }
      if (!hasReadableContact(rawText, parsed)) throw error("NO_CONTACT_DETECTED", 422);
      return res.status(200).json({ rawText, parsed, provider: "google", success: true, classificationUsed, classificationFallback, classificationFallbackReason });
    } catch (caught) {
      const safeCode = typeof caught?.code === "string" && /^[A-Z0-9_]{1,40}$/.test(caught.code)
        ? caught.code
        : "OCR_FAILED";
      const status = caught.status || 500;
      if (status >= 500) {
        console.error(JSON.stringify({
          event: "ocr_request_failed",
          stage,
          code: safeCode,
          status,
          ts: new Date().toISOString(),
        }));
      }
      return res.status(status).json({ code: safeCode, error: OCR_FAILURE_MESSAGE });
    } finally {
      if (Buffer.isBuffer(imageBody)) imageBody.fill(0);
      if (Buffer.isBuffer(req.body)) req.body.fill(0);
      req.body = undefined;
    }
  };
}

export default createOcrHandler();
