import { createHash } from "node:crypto";
import { GoogleAuth } from "google-auth-library";
import { isAllowedEmail } from "./service.js";
import { getAppPublicUrl, sendPasswordResetEmailTemplate } from "../notifications/emailService.js";

function problem(code, status, message) { return Object.assign(new Error(message), { code, status }); }
const unavailable = () => problem("RESET_UNAVAILABLE", 503, "We could not send the reset email. Please try again shortly.");

async function accessToken(env) {
  const auth = new GoogleAuth({
    credentials: { client_email: env.FIREBASE_SERVICE_ACCOUNT_EMAIL.trim(), private_key: env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, "\n") },
    scopes: ["https://www.googleapis.com/auth/identitytoolkit"],
  });
  return auth.getAccessToken();
}

async function limit(db, value, maximum, now) {
  const window = Math.floor(now.getTime() / (15 * 60 * 1000));
  const key = `password-reset:${createHash("sha256").update(value).digest("hex")}:${window}`;
  const result = await db.collection("rateLimits").findOneAndUpdate(
    { key }, { $inc: { count: 1 }, $set: { expiresAt: new Date((window + 2) * 15 * 60 * 1000) } },
    { upsert: true, returnDocument: "after" },
  );
  if (result.count > maximum) throw problem("RATE_LIMITED", 429, "Too many reset requests. Please try again in 15 minutes.");
}

export async function requestPasswordReset(db, { email, ip = "unknown" }, {
  env = process.env, fetcher = fetch, getToken = accessToken,
  sendEmail = sendPasswordResetEmailTemplate, now = new Date(), baseUrl = getAppPublicUrl(),
} = {}) {
  const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || !isAllowedEmail(normalized)) {
    throw problem("EMAIL_INVALID", 400, "Please enter an authorized work email address.");
  }
  const projectId = env.FIREBASE_PROJECT_ID || env.VITE_FIREBASE_PROJECT_ID;
  if (!projectId || !env.FIREBASE_SERVICE_ACCOUNT_EMAIL?.trim() || !env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim() || !env.SMTP_PASS?.trim()) {
    throw problem("FIREBASE_RESET_NOT_CONFIGURED", 503, "Branded password reset email is not configured.");
  }
  await limit(db, `ip:${ip}`, 10, now);
  await limit(db, `email:${normalized}`, 3, now);
  let response;
  try {
    const token = await getToken(env);
    if (!token) throw unavailable();
    response = await fetcher("https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ requestType: "PASSWORD_RESET", email: normalized, targetProjectId: projectId, returnOobLink: true }),
      signal: AbortSignal.timeout(10000), redirect: "error",
    });
  } catch { throw unavailable(); }
  const body = await response.json().catch(() => ({}));
  // The response must not reveal whether the account exists.
  if (!response.ok && body.error?.message === "EMAIL_NOT_FOUND") return { ok: true };
  if (!response.ok || !body.oobLink) throw unavailable();
  let resetUrl;
  try {
    const code = new URL(body.oobLink).searchParams.get("oobCode");
    if (!code) throw unavailable();
    const url = new URL("/reset-password", baseUrl);
    if (url.protocol !== "https:" && !(env.APP_ENV === "development" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw unavailable();
    url.searchParams.set("oobCode", code);
    resetUrl = url.href;
  } catch { throw unavailable(); }
  let delivery;
  try { delivery = await sendEmail({ toEmail: normalized, resetUrl }); }
  catch { throw unavailable(); }
  if (!delivery?.success) throw unavailable();
  return { ok: true };
}
