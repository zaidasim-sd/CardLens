export const STAGING_CLIENT_BLOCK_MESSAGE = "Client email domains are blocked in staging. No email was sent.";

export function isStagingDeployment(env = {}, hostname = "") {
  const normalized = value => String(value || "").trim().toLowerCase();
  return normalized(env.APP_ENV) === "staging"
    || normalized(env.VERCEL_ENV) === "preview"
    || ["true", "1"].includes(normalized(env.VITE_IS_STAGING))
    || /^cardsnap-vision71-staging(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(hostname);
}

export function isBlockedClientEmail(email) {
  const domain = String(email || "").trim().toLowerCase().split("@").pop();
  return domain === "aventureaviation.com" || domain.endsWith(".aventureaviation.com");
}

export function assertStagingClientEmailAllowed(email, env = {}, hostname = "") {
  if (isStagingDeployment(env, hostname) && isBlockedClientEmail(email)) {
    throw Object.assign(new Error(STAGING_CLIENT_BLOCK_MESSAGE), { code: "STAGING_RESTRICTED", status: 403 });
  }
}
