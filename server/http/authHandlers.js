import { getDb, ensureDatabaseIndexes } from "../db.js";
import { authenticate, createPreauthSession, createUser, listUsers, removeUser, rotateCsrf, signIn, signOut, verifyCsrf } from "../auth/service.js";
import { clearSessionCookie, parseCookies, sessionCookie, SESSION_COOKIE } from "../auth/cookies.js";

function send(res, status, body, cookie) {
  if (cookie) res.setHeader("Set-Cookie", cookie);
  return res.status(status).json(body);
}

function errorResponse(res, error, context = {}) {
  if (!error.status || error.status >= 500) {
    // Log only diagnostic metadata; never request bodies, cookies, URIs or raw error messages.
    const safeValue = (value) => typeof value === "string" && /^[a-zA-Z0-9_.-]{1,80}$/.test(value) ? value : undefined;
    console.error("CardSnap authentication server error", {
      ...context,
      name: safeValue(error.name),
      code: safeValue(String(error.code || "SERVER_ERROR")),
      syscall: safeValue(error.syscall),
      causeCode: safeValue(String(error.cause?.code || "")),
      mongodbUriConfigured: Boolean(process.env.MONGODB_URI),
      customDnsConfigured: Boolean(process.env.MONGODB_DNS_SERVERS?.trim()),
      hostedOnVercel: Boolean(process.env.VERCEL),
    });
  }
  return send(res, error.status || 500, { code: error.code || "SERVER_ERROR", error: error.status ? error.message : "The request could not be completed." });
}

function requestToken(req) {
  return parseCookies(req.headers.cookie || "")[SESSION_COOKIE];
}

function csrf(req) {
  return req.headers["x-csrf-token"];
}

export async function authHandler(req, res) {
  let stage = "database_connection";
  try {
    const db = await getDb();
    stage = "database_indexes";
    await ensureDatabaseIndexes(db);
    stage = "session_authentication";
    const action = String(req.query?.action || "session");
    if (req.method === "GET" && action === "csrf") {
      stage = "preauth_session";
      const created = await createPreauthSession(db);
      return send(res, 200, { csrfToken: created.csrfToken }, sessionCookie(created.sessionToken, 600));
    }
    if (req.method === "POST" && action === "sign_in") {
      stage = "sign_in";
      const result = await signIn(db, { ...req.body, ip: req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown", sessionToken: requestToken(req), csrfToken: csrf(req) });
      return send(res, 200, { user: result.user, csrfToken: result.csrfToken }, sessionCookie(result.sessionToken));
    }
    if (req.method === "POST" && action === "sign_out") {
      stage = "sign_out";
      await signOut(db, requestToken(req), csrf(req));
      return send(res, 200, { ok: true }, clearSessionCookie());
    }
    if (req.method === "GET" && action === "session") {
      const result = await authenticate(db, requestToken(req));
      return send(res, 200, { user: result.user, csrfToken: await rotateCsrf(db, result.session) });
    }
    return send(res, 405, { error: "Method not allowed." });
  } catch (error) {
    return errorResponse(res, error, { route: "auth", stage });
  }
}
export async function usersHandler(req, res) {
  let stage = "database_connection";
  try {
    const db = await getDb();
    stage = "database_indexes";
    await ensureDatabaseIndexes(db);
    stage = "session_authentication";
    const auth = await authenticate(db, requestToken(req));
    if (req.method === "GET") return send(res, 200, { users: await listUsers(db, auth.user) });
    verifyCsrf(auth.session, csrf(req));
    if (req.method === "POST") return send(res, 201, { user: await createUser(db, auth.user, req.body) });
    if (req.method === "DELETE") {
      await removeUser(db, auth.user, req.query?.id);
      return send(res, 200, { ok: true });
    }
    return send(res, 405, { error: "Method not allowed." });
  } catch (error) {
    return errorResponse(res, error);
  }
}

