import { getDb, ensureDatabaseIndexes } from '../db.js';
import { authenticate, verifyCsrf } from '../auth/service.js';
import { requireAction } from '../auth/permissions.js';
import { parseCookies, SESSION_COOKIE } from '../auth/cookies.js';
import { beginPersonalStagingConnection, finishPersonalStagingConnection, personalStagingStatus, personalStagingConfig } from '../integrations/personalStagingConstantContact.js';
import { deliverVerifiedPersonalStagingContact } from '../integrations/personalStagingSubmission.js';
import { createCard } from '../cards/service.js';

export function createPersonalStagingHandler(deps = {}) {
  return async function handler(req, res) {
    const env = deps.env || process.env;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      const action = String(req.query?.action || 'status');
      // The registered URL is OAuth only. Unsolicited webhook POSTs are refused.
      if (action === 'callback' && req.method !== 'GET') return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', error: 'This endpoint accepts OAuth authorization callbacks only.' });
      if (action === 'callback') personalStagingConfig(env);
      if (action === 'callback' && req.query?.error) {
        // A provider refusal contains no authorization code. Never exchange tokens
        // or reflect arbitrary provider query text into the response.
        const assignmentDenied = req.query.error === 'access_denied' && /user is not assigned to the client application/i.test(String(req.query.error_description || ''));
        res.setHeader('Set-Cookie', 'cc_personal_staging_oauth=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
        return res.status(403).json({code:'CC_AUTHORIZATION_DENIED',error:assignmentDenied
          ? 'Constant Contact refused authorization: the signed-in user is not assigned to this application. Ask the account owner to verify the personal staging application and authorize with the intended Constant Contact account. If this persists, contact Constant Contact support. No connection was created.'
          : 'Constant Contact did not grant authorization. Return to the staging administrator connection screen and ask the account owner to authorize the personal staging application. No connection was created.'});
      }
      if (action === 'callback' && (!/^[a-f0-9]{64}$/.test(String(req.query?.state || '')) || typeof req.query?.code !== 'string' || !req.query.code))
        return res.status(400).json({code:'CC_OAUTH_INVALID',error:'Authorization parameters are missing or invalid. Start from the staging administrator connection screen.'});
      const db = await (deps.getDb || getDb)();
      await (deps.ensureIndexes || ensureDatabaseIndexes)(db);
      const cookies = parseCookies(req.headers.cookie || '');
      if (action === 'callback') {
        await (deps.finish || finishPersonalStagingConnection)(db, req.query, cookies.cc_personal_staging_oauth, env, deps.fetcher || fetch);
        const config=personalStagingConfig(env);
        res.setHeader('Set-Cookie', 'cc_personal_staging_oauth=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
        return res.redirect(303, `${new URL(config.callback).origin}/users?constantContact=connected`);
      }
      const auth = await (deps.authenticate || authenticate)(db, cookies[SESSION_COOKIE]);
      if (req.method === 'POST' && action === 'retry_submission') {
        personalStagingConfig(env);
        requireAction(auth.user, 'capture_card');
        verifyCsrf(auth.session, req.headers['x-csrf-token']);
        const id = req.body?.submissionId;
        if (!/^[a-f0-9-]{36}$/i.test(id || '')) return res.status(400).json({ error: 'A valid original submission reference is required.' });
        const receipt = await db.collection('settings').findOne({ tenantId: auth.user.tenantId, key: `submission:${auth.user.tenantId}:${auth.user.id}:${id}`, completedAt: { $exists: true } });
        if (!receipt) return res.status(409).json({ error: 'The original Sheet submission is not confirmed. Retry the original form.' });
        // createCard returns its completed receipt without writing to Sheets again.
        const card = await (deps.createCard || createCard)(db, auth.user, { ...req.body, status: 'submitted' });
        return res.json({ record: await deliverVerifiedPersonalStagingContact(db, auth.user, card, {env,...deps}) });
      }
      requireAction(auth.user, 'manage_users');
      if (req.method === 'GET' && action === 'status') return res.json(await personalStagingStatus(db, auth.user.tenantId, env));
      if (req.method === 'POST' && action === 'connect') {
        verifyCsrf(auth.session, req.headers['x-csrf-token']);
        const result = await beginPersonalStagingConnection(db, auth.user, auth.session, env);
        res.setHeader('Set-Cookie', result.cookie);
        return res.json({ url: result.url });
      }
      return res.status(405).json({ error: 'Method not allowed.' });
    } catch (error) {
      return res.status(error.status || 503).json({ code: error.code || 'CC_OPERATION_FAILED', error: error.code ? error.message : 'Constant Contact could not complete this operation. Retain your submission reference.' });
    }
  };
}
export default createPersonalStagingHandler();
