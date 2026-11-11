import personalStagingHandler from './personalStagingConstantContactHandler.js';
import { personalStagingEnabled } from '../integrations/personalStagingConstantContact.js';
import productionHandler from './productionConstantContactHandler.js';
import {productionEnabled} from '../integrations/productionConstantContact.js';
import { getDb, ensureDatabaseIndexes } from "../db.js";
import { authenticate, verifyCsrf } from "../auth/service.js";
import { requireAction } from "../auth/permissions.js";
import { parseCookies, SESSION_COOKIE } from "../auth/cookies.js";
import { beginConnection, finishConnection, connectionStatus, processTransfers } from "../integrations/constantContact.js";
import { pilot } from "../pilot.js";
import { stagingAction, withStagingLock } from '../integrations/stagingWorkflow.js';
import {stagingReviewHandler} from './stagingReviewHandler.js';

export default async function constantContactHandler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (personalStagingEnabled()) return personalStagingHandler(req, res);
  if(productionEnabled())return productionHandler(req,res);
  if(req.query?.action==='staging_review')return stagingReviewHandler(req,res,await getDb());
  if(String(req.query?.action||'').startsWith('staging_')) {
    try {
      const db=await getDb();await ensureDatabaseIndexes(db);
      const cookies=parseCookies(req.headers.cookie||'');
      const auth=await authenticate(db,cookies[SESSION_COOKIE]);
      const action=String(req.query.action).slice(8);
      requireAction(auth.user,action==='context'?'capture_card':'manage_users');
      if(req.method==='GET'&&action==='context')return res.json(await stagingAction(db,auth.user,action));
      if(req.method==='GET'&&action==='status')return res.json(await stagingAction(db,auth.user,action));
      if(req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});
      verifyCsrf(auth.session,req.headers['x-csrf-token']);
      return res.json(await withStagingLock(db,()=>stagingAction(db,auth.user,action,req.body||{})));
    }catch(error){return res.status(error.status||500).json({error:error.status?error.message:'Staging operation failed. Check the register before retrying.'});}
  }
  // PILOT: route and OAuth implementation retained but unavailable for this scope.
  if (!pilot.constantContactEnabled) return res.status(403).json({ code: "FEATURE_DISABLED", error: "Constant Contact is paused for this pilot." });
  try {
    const db = await getDb(); await ensureDatabaseIndexes(db);
    const cookies = parseCookies(req.headers.cookie || "");
    const action = req.path === "/auth/callback" ? "callback" : String(req.query?.action || "status");
    if (action === "callback" && req.method === "GET") {
      await finishConnection(db, req.query, cookies.cc_oauth);
      res.setHeader("Set-Cookie", "cc_oauth=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
      const redirect = new URL(process.env.CC_REDIRECT_URI);
      const destination = process.env.CC_APP_RETURN_URL || (["localhost", "127.0.0.1"].includes(redirect.hostname) ? "https://localhost:5173/users" : `${redirect.origin}/users`);
      return res.redirect(303, `${destination}?constantContact=connected`);
    }
    const auth = await authenticate(db, cookies[SESSION_COOKIE]);
    requireAction(auth.user, "manage_users");
    if (req.method === "GET" && action === "status") return res.json(await connectionStatus(db, auth.user.tenantId));
    verifyCsrf(auth.session, req.headers["x-csrf-token"]);
    if (req.method === "POST" && action === "connect") {
      const result = await beginConnection(db, auth.user, auth.session);
      res.setHeader("Set-Cookie", result.cookie); return res.json({ url: result.url });
    }
    if (req.method === "POST" && action === "retry") {
      const processed = await processTransfers(db, auth.user.tenantId);
      return res.json({ processed, ...(await connectionStatus(db, auth.user.tenantId)) });
    }
    return res.status(405).json({ error: "Method not allowed." });
  } catch (error) { return res.status(error.status || 400).json({ error: error.status ? error.message : "Constant Contact connection could not be completed. Check configuration or connect again." }); }
}
