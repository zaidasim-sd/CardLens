import { createHash } from "node:crypto";
import { getDb, ensureDatabaseIndexes } from "../db.js";
import { authenticate, verifyCsrf } from "../auth/service.js";
import { requireAction } from "../auth/permissions.js";
import { parseCookies, SESSION_COOKIE } from "../auth/cookies.js";
import { hasReadableContact } from "../../shared/contactValidation.mjs";
import { parseOCRText } from "../services/cardParser.js";
import { OCR_FAILURE_MESSAGE, performOCR } from "../services/ocrService.js";

export const OCR_MAX_BYTES = 2 * 1024 * 1024;
const OCR_USER_LIMIT = 30;
const OCR_IP_LIMIT = 60;

function error(code, status, message = OCR_FAILURE_MESSAGE) {
  return Object.assign(new Error(message), { code, status });
}

function digest(value) {
  return createHash("sha256").update(String(value || "unknown")).digest("hex");
}

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || env.APP_BASE_URL || env.APP_ORIGIN || "")
    .split(",").map((value) => value.trim()).filter(Boolean);
}

function verifyOrigin(req, env) {
  const origin = String(req.headers.origin || "");
  if (!origin || !allowedOrigins(env).includes(origin)) throw error("ORIGIN_DENIED", 403);
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

export function createOcrHandler(dependencies = {}) {
  const database = dependencies.getDb || getDb;
  const runOcr = dependencies.performOCR || performOCR;
  const auth = dependencies.authenticate || authenticate;
  const ensureIndexes = dependencies.ensureDatabaseIndexes || ensureDatabaseIndexes;
  const env = dependencies.env || process.env;
  return async function ocrHandler(req, res) {
    try {
      if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
      verifyOrigin(req, env);
      const db = await database();
      await ensureIndexes(db);
      const sessionToken = parseCookies(req.headers.cookie || "")[SESSION_COOKIE];
      const signedIn = await auth(db, sessionToken);
      verifyCsrf(signedIn.session, req.headers["x-csrf-token"]);
      requireAction(signedIn.user, "use_ocr");
      const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
      const hour = new Date().toISOString().slice(0, 13);
      await consumeLimit(db, `ocr:user:${signedIn.user.id}:${hour}`, OCR_USER_LIMIT);
      await consumeLimit(db, `ocr:ip:${digest(ip)}:${hour}`, OCR_IP_LIMIT);
      await consumeMonthlyCap(db, signedIn.user.tenantId, env);
      const body = await readBody(req);
      const images = requestImages(body, String(req.headers["content-type"] || ""));
      const results = [];
      for (const image of images) results.push(await runOcr(image.data));
      const rawText = results.map((result) => result.rawText || "").filter(Boolean).join("\n\n");
      const parsed = parseOCRText(rawText);
      if (!hasReadableContact(rawText, parsed)) throw error("NO_CONTACT_DETECTED", 422);
      return res.status(200).json({ rawText, parsed, provider: "google", success: true });
    } catch (caught) {
      return res.status(caught.status || 500).json({ code: caught.code || "OCR_FAILED", error: OCR_FAILURE_MESSAGE });
    }
  };
}

export default createOcrHandler();
