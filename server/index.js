import express from "express";
import dotenv from "dotenv";
import { validateOcrConfig } from "./services/ocrService.js";
import { authHandler, usersHandler } from "./http/authHandlers.js";
import { cardsHandler, storageHealthHandler } from "./http/cardHandlers.js";
import supportHandler from "../api/support.js";
import exhibitionsHandler from "../api/config/exhibitions.js";
import { retentionSettingsHandler, sweepHandler } from "./http/retentionHandlers.js";
import ocrHandler from "./http/ocrHandler.js";
import detectCardsHandler from "./http/detectCardsHandler.js";
import exportHandler from "./http/exportHandler.js";
import constantContactHandler from "./http/constantContactHandler.js";
import constantContactCron from "./http/constantContactCron.js";
import { getDb } from "./db.js";
import { processTransfers } from "./integrations/constantContact.js";
import { pilot } from "./pilot.js";

// Load environment variables
dotenv.config();
console.log(`[Lead71 Server] Approvers: HALA=${process.env.HALA_APPROVAL_EMAIL || "hmirza.sd@vision71tech.com"}, OSMAN=${process.env.OSMAN_APPROVAL_EMAIL || "iamalik2005@gmail.com"}`);
console.log(`[Lead71 Server] Gemini key configured: ${Boolean(process.env.GEMINI_API_KEY)}`);

// ─── Startup config check ─────────────────────────────────────────────────────
// Logs a clear pass/fail checklist on every cold start so misconfigured staging
// or production deployments are immediately visible in Vercel Function logs.
// Values are never logged — only whether each variable is present.
(function validateStartupConfig() {
  const env = process.env;
  const vercelEnv = env.VERCEL_ENV || env.APP_ENV || "development";
  const isStaging = vercelEnv === "preview" || vercelEnv === "staging";
  const isProduction = vercelEnv === "production";

  const checks = [
    { name: "MONGODB_URI",            ok: Boolean(env.MONGODB_URI) },
    { name: "MONGODB_DB",             ok: Boolean(env.MONGODB_DB) },
    // FIREBASE_API_KEY must be set as a plain (non-VITE_) server env var on Vercel.
    // VITE_ vars are build-time only and are NOT available in serverless functions.
    { name: "FIREBASE_API_KEY (server-side, non-VITE)", ok: Boolean(env.FIREBASE_API_KEY) },
    { name: "VITE_FIREBASE_API_KEY (build-time)",       ok: Boolean(env.VITE_FIREBASE_API_KEY) },
    { name: "VITE_FIREBASE_AUTH_DOMAIN",  ok: Boolean(env.VITE_FIREBASE_AUTH_DOMAIN) },
    { name: "VITE_FIREBASE_PROJECT_ID",   ok: Boolean(env.VITE_FIREBASE_PROJECT_ID) },
    { name: "SMTP_USER",              ok: Boolean(env.SMTP_USER) },
    { name: "SMTP_PASS",              ok: Boolean(env.SMTP_PASS) },
    { name: "HALA_APPROVAL_EMAIL",    ok: Boolean(env.HALA_APPROVAL_EMAIL) },
    { name: "OSMAN_APPROVAL_EMAIL",   ok: Boolean(env.OSMAN_APPROVAL_EMAIL) },
  ];

  if (isStaging) {
    checks.push(
      { name: "STAGING_EMAIL_ALLOWLIST (staging-only)", ok: Boolean(env.STAGING_EMAIL_ALLOWLIST) },
      { name: "STAGING_ALLOWED_DOMAINS (staging-only)", ok: Boolean(env.STAGING_ALLOWED_DOMAINS) },
    );
  }  const missing = checks.filter((c) => !c.ok);
  const present = checks.filter((c) => c.ok);

  console.log(`[Lead71 Server] Environment: ${vercelEnv} | Config check: ${present.length}/${checks.length} vars present`);
  if (missing.length) {
    console.warn(
      `[Lead71 Server] MISSING ENV VARS (${missing.length}) — these will cause 500 errors:\n` +
      missing.map((c) => `  ✗ ${c.name}`).join("\n")
    );
    if (!env.FIREBASE_API_KEY && env.VITE_FIREBASE_API_KEY) {
      console.warn(
        "[Lead71 Server] FIREBASE_API_KEY is not set as a server-side env var.\n" +
        "  Vercel strips VITE_ prefix vars from the serverless runtime.\n" +
        "  Add FIREBASE_API_KEY (without VITE_) to the Vercel Environment Variables\n" +
        "  panel, scoped to the Preview environment, with the same value as VITE_FIREBASE_API_KEY."
      );
    }
    if (isProduction && !env.MONGODB_URI) {
      console.error("[Lead71 Server] CRITICAL: MONGODB_URI is missing in production. All auth endpoints will return 500.");
    }
  } else {
    console.log("[Lead71 Server] All required env vars are present.");
  }
})();
// ─────────────────────────────────────────────────────────────────────────────

// Validate OCR configuration
validateOcrConfig();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ limit: "25mb", extended: true }));

app.all("/api/auth", authHandler);
app.all("/api/users", usersHandler);
app.all("/api/cards", cardsHandler);
app.all("/api/storage-health", storageHealthHandler);
app.all("/api/support", supportHandler);
app.all("/api/retention", retentionSettingsHandler);
app.all("/api/cron/sweep", sweepHandler);
app.all("/api/export", exportHandler);
app.all("/api/constant-contact", constantContactHandler);
app.get("/auth/callback", constantContactHandler);
app.all("/api/cron/constant-contact", constantContactCron);

// Routes
app.all("/api/ocr", ocrHandler);
app.post("/api/detect-cards", detectCardsHandler);

app.get("/api/config/exhibitions", exhibitionsHandler);

app.get("/api/health", (req, res) => {
  const env = process.env;
  res.json({
    status: "ok",
    env: env.VERCEL_ENV || env.APP_ENV || "development",
    config: {
      mongodb: Boolean(env.MONGODB_URI),
      mongodbDb: Boolean(env.MONGODB_DB),
      // Server-side Firebase key (non-VITE_) — required for all auth actions on Vercel
      firebaseApiKey: Boolean(env.FIREBASE_API_KEY),
      smtp: Boolean(env.SMTP_USER && env.SMTP_PASS),
      stagingEmailAllowlist: Boolean(env.STAGING_EMAIL_ALLOWLIST),
    },
  });
});

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`Backend server running on http://127.0.0.1:${port}`);
});

server.on("error", (error) => {
  console.error("Backend server error:", error);
});
let processingTransfers = false;
// PILOT: old scheduled transfer loop retained, paused by the shared feature switch.
setInterval(async () => {
  if (!pilot.constantContactEnabled || processingTransfers || !process.env.CC_CLIENT_ID) return;
  processingTransfers = true;
  try { await processTransfers(await getDb()); }
  catch { console.error("Constant Contact pending transfers could not be processed."); }
  finally { processingTransfers = false; }
}, 60000).unref();
