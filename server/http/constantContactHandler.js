import { createHash, randomBytes } from "node:crypto";
import { getDb, ensureDatabaseIndexes } from "../db.js";
import { authenticate, verifyCsrf } from "../auth/service.js";
import { requireAction } from "../auth/permissions.js";
import { parseCookies, SESSION_COOKIE } from "../auth/cookies.js";
import { createConstantContactClient, storeConstantContactToken, transferApprovedCard } from "../integrations/constantContactService.js";

const digest = (value) => createHash("sha256").update(value).digest("hex");

export default async function constantContactHandler(req, res) {
  try {
    const db = await getDb();
    await ensureDatabaseIndexes(db);
    const token = parseCookies(req.headers.cookie || "")[SESSION_COOKIE];
    const auth = await authenticate(db, token);
    const action = String(req.query?.action || "");
    if (req.method === "GET" && action === "authorize") {
      requireAction(auth.user, "manage_users");
      const state = randomBytes(32).toString("base64url");
      await db.collection("sessions").updateOne({ _id: auth.session._id }, { $set: { ccStateHash: digest(state), ccStateExpiresAt: new Date(Date.now() + 5 * 60 * 1000) } });
      return res.status(200).json({ url: createConstantContactClient().authorizationUrl(state) });
    }
    if (req.method === "GET" && action === "callback") {
      requireAction(auth.user, "manage_users");
      if (!req.query?.state || auth.session.ccStateHash !== digest(String(req.query.state)) || auth.session.ccStateExpiresAt < new Date()) throw Object.assign(new Error("Connection expired"), { code: "CC_STATE_INVALID", status: 403 });
      const client = createConstantContactClient();
      await storeConstantContactToken(db, auth.user, await client.exchange(String(req.query.code || "")));
      await db.collection("sessions").updateOne({ _id: auth.session._id }, { $unset: { ccStateHash: "", ccStateExpiresAt: "" } });
      return res.redirect("/users?constant_contact=connected");
    }
    verifyCsrf(auth.session, req.headers["x-csrf-token"]);
    if (req.method === "POST" && action === "settings") {
      requireAction(auth.user, "manage_users");
      const listId = String(req.body?.listId || "").trim();
      if (!listId) throw Object.assign(new Error("List required"), { code: "CC_LIST_REQUIRED", status: 400 });
      await db.collection("settings").updateOne({ tenantId: auth.user.tenantId, key: "constant_contact" }, { $set: { tenantId: auth.user.tenantId, key: "constant_contact", listId, eventFieldId: String(req.body?.eventFieldId || "").trim(), proposal: true, updatedAt: new Date() } }, { upsert: true });
      return res.status(200).json({ ok: true });
    }
    if (req.method === "POST" && action === "transfer") return res.status(200).json(await transferApprovedCard(db, auth.user, req.body?.id));
    return res.status(405).json({ error: "Method not allowed." });
  } catch (error) {
    return res.status(error.status || 500).json({ code: error.code || "SERVER_ERROR", error: error.status ? error.message : "The request could not be completed." });
  }
}
