export const SESSION_COOKIE = "cardsnap_session";

export function parseCookies(header = "") {
  return Object.fromEntries(header.split(";").map((value) => value.trim()).filter(Boolean).map((value) => {
    const at = value.indexOf("=");
    return at < 0 ? [value, ""] : [value.slice(0, at), decodeURIComponent(value.slice(at + 1))];
  }));
}

export function sessionCookie(token, maxAgeSeconds = 8 * 60 * 60) {
  const isProd = process.env.NODE_ENV === "production" || process.env.APP_ENV === "production";
  const secure = isProd ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function clearSessionCookie() {
  const isProd = process.env.NODE_ENV === "production" || process.env.APP_ENV === "production";
  const secure = isProd ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=0`;
}
