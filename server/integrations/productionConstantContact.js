import { randomBytes, createHash } from 'node:crypto';
import { encryptValue, decryptValue, blindIndex } from '../security/encryption.js';

export const PRODUCTION_LIST_ID = 'dac5ef72-d908-11f1-a1dc-02420a320002';
export const PRODUCTION_LIST_NAME = 'Lead71_MasterSheet_CreatedOn:5thNov2026';
export const PRODUCTION_CALLBACK = 'https://lead71.com/api/constantcontact?action=callback';
const API = 'https://api.cc.email/v3';
const TOKEN = 'https://authz.constantcontact.com/oauth2/default/v1/token';
const hash = value => createHash('sha256').update(String(value)).digest('hex');
const issue = (code, message, status = 503) => Object.assign(new Error(message), { code, status });
export const productionEnabled = (env = process.env) => env.CC_ENABLED_PRODUCTION === 'true';

export function productionConfig(env = process.env) {
  if (!productionEnabled(env)) throw issue('CC_DISABLED', 'Constant Contact delivery is disabled.');
  if (env.APP_ENV !== 'production' || String(env.APP_BASE_URL || '').trim().replace(/\/$/, '') !== 'https://lead71.com')
    throw issue('CC_ENVIRONMENT_REFUSED', 'Production integration requires APP_ENV=production and APP_BASE_URL=https://lead71.com.');
  if (env.CC_STAGING_TEST_MODE === 'true' || env.CC_LOCAL_TEST_MODE_PRODUCTION === 'true')
    throw issue('CC_ENVIRONMENT_REFUSED', 'Staging and local Constant Contact test modes must be disabled in production.');
  if (env.CC_LIST_ID_PRODUCTION?.trim() !== PRODUCTION_LIST_ID || env.CC_LIST_NAME_PRODUCTION?.trim() !== PRODUCTION_LIST_NAME)
    throw issue('CC_TARGET_REFUSED', 'The configured Constant Contact destination is not the approved list.');
  const clientId = env.CC_API_KEY_PRODUCTION;
  const secret = env.CC_CLIENT_SECRET_PRODUCTION;
  if (!clientId?.trim() || !secret?.trim())
    throw issue('CC_NOT_CONFIGURED', 'Production Constant Contact credentials are missing.');
  const callback = PRODUCTION_CALLBACK;
  if (env.CC_REDIRECT_URI_PRODUCTION && env.CC_REDIRECT_URI_PRODUCTION !== callback)
    throw issue('CC_CALLBACK_REFUSED', 'The production OAuth callback must match the registered Lead71 callback.');
  return { clientId: clientId.trim(), secret: secret.trim(), callback };
}
function identity(tenantId, env) {
  const config = productionConfig(env);
  return { tenantId, key: `cc_production_connection:${hash(config.clientId)}:${PRODUCTION_LIST_ID}` };
}

export async function productionStatus(db, tenantId, env = process.env) {
  if (!productionEnabled(env)) return { enabled: false, configured: false, connected: false, listName: PRODUCTION_LIST_NAME };
  try {
    const config = await db.collection('settings').findOne(identity(tenantId, env));
    return { enabled: true, configured: true, connected: Boolean(config?.tokens && config?.verifiedListId === PRODUCTION_LIST_ID), writesEnabled: env.CC_WRITES_ENABLED_PRODUCTION === 'true', listName: PRODUCTION_LIST_NAME, listId: PRODUCTION_LIST_ID };
  } catch (error) { return { enabled: true, configured: false, connected: false, listName: PRODUCTION_LIST_NAME, error: error.message }; }
}

async function exchange(db, tenantId, values, env, fetcher) {
  const c = productionConfig(env);
  let r;
  try { r = await fetcher(TOKEN, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(12000),
    headers: { Authorization: `Basic ${Buffer.from(`${c.clientId}:${c.secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(values) }); }
  catch { throw issue('CC_AUTH_UNCERTAIN', 'Authorization could not be confirmed. Reconnect Constant Contact.'); }
  if (!r.ok) throw issue('CC_AUTH_FAILED', 'Constant Contact authorization failed. Reconnect the approved account.');
  const token = await r.json().catch(() => ({}));
  if (!token.access_token || !token.refresh_token || !(Number(token.expires_in) > 0)) throw issue('CC_AUTH_INVALID', 'Constant Contact returned incomplete authorization.');
  await db.collection('settings').updateOne(identity(tenantId, env), { $set: { tokens: encryptValue({ access: token.access_token, refresh: token.refresh_token, expires: Date.now() + Number(token.expires_in) * 1000 }), refreshUntil: new Date(0) },
    ...(values.grant_type === 'authorization_code' ? {$unset:{verifiedListId:'',verifiedAt:''}} : {}) }, { upsert: true });
  return token.access_token;
}

async function accessToken(db, tenantId, env, fetcher) {
  const query = identity(tenantId, env), settings = db.collection('settings');
  const connection = await settings.findOne(query);
  if (!connection?.tokens) throw issue('CC_CONNECTION_REQUIRED', 'An administrator must connect the approved Constant Contact account.');
  const token = decryptValue(connection.tokens);
  if (token.expires > Date.now() + 60000) return token.access;
  const lock = await settings.findOneAndUpdate({ ...query, $or: [{ refreshUntil: { $lt: new Date() } }, { refreshUntil: { $exists: false } }] },
    { $set: { refreshUntil: new Date(Date.now() + 30000) } }, { returnDocument: 'after' });
  if (!lock) throw issue('CC_AUTH_BUSY', 'Authorization is refreshing. Retry shortly.', 409);
  try { return await exchange(db, tenantId, { grant_type: 'refresh_token', refresh_token: token.refresh }, env, fetcher); }
  finally { await settings.updateOne(query, { $set: { refreshUntil: new Date(0) } }); }
}

export async function beginProductionConnection(db, user, session, env = process.env) {
  const c = productionConfig(env), state = randomBytes(32).toString('hex'), nonce = randomBytes(32).toString('hex');
  await db.collection('settings').insertOne({ tenantId: user.tenantId, key: `cc_production_oauth:${hash(state)}`, clientHash: hash(c.clientId), callback:c.callback, userId: session.userId, sessionId: session._id,
    nonceHash: hash(nonce), expires: new Date(Date.now() + 600000) });
  const url = new URL('https://authz.constantcontact.com/oauth2/default/v1/authorize');
  url.search = new URLSearchParams({ client_id: c.clientId, redirect_uri: c.callback, response_type: 'code', scope: 'contact_data offline_access', state }).toString();
  return { url: url.href, cookie: `cc_production_oauth=${nonce}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600` };
}

export async function finishProductionConnection(db, query, nonce, env = process.env, fetcher = fetch) {
  const c = productionConfig(env);
  if (!/^[a-f0-9]{64}$/.test(String(query.state || '')) || typeof query.code !== 'string' || !query.code || !nonce)
    throw issue('CC_OAUTH_INVALID', 'Authorization was cancelled or expired. Connect again.', 400);
  const state = await db.collection('settings').findOneAndDelete({ key: `cc_production_oauth:${hash(query.state)}`, nonceHash: hash(nonce), clientHash: hash(c.clientId), callback:c.callback, expires: { $gt: new Date() } });
  if (!state) throw issue('CC_OAUTH_INVALID', 'Authorization expired or was already used. Connect again.', 400);
  const session = await db.collection('sessions').findOne({ _id: state.sessionId, userId: state.userId });
  if (!session || session.user?.role !== 'vision71_administrator' || session.anonymous || session.user.tenantId !== state.tenantId || new Date(session.absoluteExpiresAt) <= new Date() || Date.now() - new Date(session.lastSeenAt).getTime() > 30 * 60000)
    throw issue('CC_OAUTH_SESSION_INVALID', 'Administrator session expired. Connect again.', 403);
  await exchange(db, state.tenantId, { grant_type: 'authorization_code', code: query.code, redirect_uri: c.callback }, env, fetcher);
  // This is the only production list metadata endpoint. Never enumerate lists.
  await allowedCall(db, state.tenantId, `/contact_lists/${PRODUCTION_LIST_ID}`, 'GET', undefined, env, fetcher);
  await db.collection('settings').updateOne(identity(state.tenantId, env), { $set: { verifiedListId: PRODUCTION_LIST_ID, verifiedAt: new Date() } });
}

export function productionPayload(data) {
  const email = String(data.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw issue('CC_EMAIL_REQUIRED', 'Add a valid email address before Constant Contact delivery.', 400);
  const [first = '', ...rest] = String(data.fullName || '').trim().split(/\s+/);
  // Consent is never inferred from scanning a business card. No signup/upsert endpoint.
  return { create_source: 'Account', email_address: { address: email, permission_to_send: 'not_set' }, first_name: first.slice(0, 50), last_name: rest.join(' ').slice(0, 50),
    company_name: String(data.companyName || '').slice(0, 50), job_title: String(data.jobTitle || '').slice(0, 50), list_memberships: [PRODUCTION_LIST_ID],
    ...(data.phone ? { phone_numbers: [{ phone_number: String(data.phone).slice(0, 25), kind: 'work' }] } : {}) };
}

export async function allowedCall(db, tenantId, path, method, body, env = process.env, fetcher = fetch) {
  productionConfig(env);
  const isList = method === 'GET' && path === `/contact_lists/${PRODUCTION_LIST_ID}`;
  const createKeys = new Set(['create_source', 'email_address', 'first_name', 'last_name', 'company_name', 'job_title', 'list_memberships', 'phone_numbers']);
  const isCreate = method === 'POST' && path === '/contacts' && Array.isArray(body?.list_memberships) && body.list_memberships.length === 1 && body.list_memberships[0] === PRODUCTION_LIST_ID && body.email_address?.permission_to_send === 'not_set' && body.create_source === 'Account'
    && Object.keys(body).every(key => createKeys.has(key)) && Object.keys(body.email_address).every(key => ['address', 'permission_to_send'].includes(key));
  if (!isList && !isCreate) throw issue('CC_OPERATION_REFUSED', 'This Constant Contact operation is outside the approved destination.', 403);
  if (isCreate && env.CC_WRITES_ENABLED_PRODUCTION !== 'true') throw issue('CC_WRITES_PAUSED', 'Production Constant Contact writes are paused.');
  const token = await accessToken(db, tenantId, env, fetcher);
  let response;
  try { response = await fetcher(`${API}${path}`, { method, redirect: 'error', signal: AbortSignal.timeout(12000), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
  catch { throw issue(isCreate ? 'CC_CREATE_UNCERTAIN' : 'CC_NETWORK_FAILED', isCreate ? 'Delivery is uncertain. Do not resend until an administrator reconciles this reference.' : 'Constant Contact could not be reached. Retry later.'); }
  if (!response.ok) {
    if (isCreate && response.status === 409) throw issue('CC_EXISTING_CONTACT', 'This email already exists in Constant Contact. No existing contact was read or changed.', 409);
    throw issue(isCreate && response.status >= 500 ? 'CC_CREATE_UNCERTAIN' : 'CC_REQUEST_FAILED', `Constant Contact rejected the request (${response.status}). Retry only when the delivery status permits it.`);
  }
  const result = await response.json().catch(() => null);
  if (isList && (result?.list_id !== PRODUCTION_LIST_ID || result?.name !== PRODUCTION_LIST_NAME)) throw issue('CC_TARGET_REFUSED', 'The destination list identity did not match. Delivery is blocked.');
  if (isCreate && !result?.contact_id) throw issue('CC_CREATE_UNCERTAIN', 'Delivery could not be confirmed. Administrator reconciliation is required.');
  return result;
}

// Only references, HMAC digests, provider IDs and states persist here. No contact payload.
export async function deliverProductionContact(db, user, card, env = process.env, fetcher = fetch) {
  if (!productionEnabled(env)) return card;
  let receipt, query, createStarted = false;
  const settings = db.collection('settings');
  try {
    productionConfig(env);
    if (card.sheetStatus !== 'submitted' || card.capturedBy !== user.id || card.tenantId !== user.tenantId) throw issue('CC_SHEET_NOT_CONFIRMED', 'The contact must be saved to Google Sheets first.', 409);
    if (env.CC_WRITES_ENABLED_PRODUCTION !== 'true') return { ...card, constantContactIntegration: true, transferStatus: 'pending', transferError: 'Saved to Google Sheets. Constant Contact delivery is paused until the write gate is enabled.' };
    if (!card.sheetDeliveryVerified) throw issue('CC_SHEET_NOT_VERIFIED', 'The reviewed details must match the saved Sheet row before delivery.', 409);
    if (!String(card.verifiedData?.email || '').trim()) return { ...card, constantContactIntegration: true, transferStatus: 'not_started', transferError: 'Saved to Google Sheets. An email address is required for Constant Contact.' };
    const body = productionPayload(card.verifiedData);
    query = { tenantId: user.tenantId, key: `cc_production_submission:${user.id}:${card.id}` };
    const digest = blindIndex(JSON.stringify(body));
    receipt = await settings.findOne(query);
    if (!receipt) {
      try { await settings.insertOne({ ...query, recordId: card.recordId, listId: PRODUCTION_LIST_ID, digest, state: 'pending', createdAt: new Date() }); }
      catch (error) { if (error.code !== 11000) throw error; }
      receipt = await settings.findOne(query);
    }
    if (receipt.digest !== digest || receipt.listId !== PRODUCTION_LIST_ID) throw issue('CC_REFERENCE_CONFLICT', 'These details differ from this delivery reference. Administrator review is required.', 409);
    if (receipt.state === 'transferred') return { ...card, constantContactIntegration: true, transferStatus: 'transferred', ccContactId: receipt.ccId, transferError: '' };
    if (receipt.state === 'existing_contact') return { ...card, constantContactIntegration: true, transferStatus: 'existing_contact', transferError: 'Existing Constant Contact email preserved. No existing contact was read or changed.' };
    if (['creating', 'reconciliation_required'].includes(receipt.state)) throw issue('CC_CREATE_UNCERTAIN', 'Delivery needs administrator reconciliation. Automatic resend is blocked.');
    const claimed = await settings.findOneAndUpdate({ ...query, state: { $in: ['pending', 'failed'] }, $or: [{ lease: { $exists: false } }, { lease: { $lt: new Date() } }] }, { $set: { lease: new Date(Date.now() + 60000), state: 'pending' } }, { returnDocument: 'after' });
    if (!claimed) throw issue('CC_BUSY', 'Delivery is already processing. Retry later.', 409);
    await allowedCall(db, user.tenantId, `/contact_lists/${PRODUCTION_LIST_ID}`, 'GET', undefined, env, fetcher);
    await settings.updateOne(query, { $set: { state: 'creating', attemptedAt: new Date() } });
    createStarted = true;
    const created = await allowedCall(db, user.tenantId, '/contacts', 'POST', body, env, fetcher);
    await settings.updateOne(query, { $set: { state: 'transferred', ccId: created.contact_id, completedAt: new Date() }, $unset: { lease: '' } });
    return { ...card, constantContactIntegration: true, transferStatus: 'transferred', ccContactId: created.contact_id, transferError: '' };
  } catch (error) {
    const definiteFailure = ['CC_EXISTING_CONTACT', 'CC_REQUEST_FAILED', 'CC_CONNECTION_REQUIRED', 'CC_AUTH_BUSY', 'CC_AUTH_FAILED', 'CC_AUTH_UNCERTAIN', 'CC_AUTH_INVALID'];
    const uncertain = error.code === 'CC_CREATE_UNCERTAIN' || (createStarted && !definiteFailure.includes(error.code));
    const state = uncertain ? 'reconciliation_required' : error.code === 'CC_EXISTING_CONTACT' ? 'existing_contact' : 'failed';
    // Do not replace the state of another worker or an already completed receipt.
    if (query && receipt && !['CC_BUSY', 'CC_REFERENCE_CONFLICT'].includes(error.code)) {
      try { await settings.updateOne({ ...query, state: { $nin: ['transferred', 'existing_contact'] } }, { $set: { state, errorCode: error.code || 'CC_DELIVERY_FAILED', lastAttemptAt: new Date() }, $unset: { lease: '' } }); } catch { /* Existing creating state blocks unsafe resend if persistence is unavailable. */ }
    }
    return { ...card, constantContactIntegration: true, transferStatus: uncertain ? 'reconciliation_required' : error.code === 'CC_EXISTING_CONTACT' ? 'existing_contact' : 'failed', transferError: error.code ? error.message : 'Delivery could not be confirmed. Retain this reference for administrator review.' };
  }
}
