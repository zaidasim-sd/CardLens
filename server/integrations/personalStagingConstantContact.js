import { randomBytes, createHash } from 'node:crypto';
import { encryptValue, decryptValue, blindIndex } from '../security/encryption.js';

export const PERSONAL_STAGING_LIST_ID = 'b171567e-d841-11f1-9651-02420a320002';
export const PERSONAL_STAGING_LIST_NAME = 'Lead71 - Internal Integration Test - DO NOT SEND';
export const PERSONAL_STAGING_CALLBACK = 'https://lead71-cc-staging.vercel.app/api/constantcontact?action=callback';
const API = 'https://api.cc.email/v3';
const TOKEN = 'https://authz.constantcontact.com/oauth2/default/v1/token';
const hash = value => createHash('sha256').update(String(value)).digest('hex');
const issue = (code, message, status = 503) => Object.assign(new Error(message), { code, status });
export const personalStagingEnabled = (env = process.env) => env.CC_PERSONAL_STAGING_ENABLED === 'true';

export function personalStagingConfig(env = process.env) {
  if (!personalStagingEnabled(env)) throw issue('CC_DISABLED', 'Personal staging delivery is disabled.');
  const origin = String(env.APP_ORIGIN || '').trim().replace(/\/$/, '');
  const dummySheet = '1ztzQ61buLJ4kCgxH2oHn9pXqIl36mQGTx4TVANL10sM';
  if (env.APP_ENV !== 'staging' || origin !== 'https://lead71-cc-staging.vercel.app'
      || !/staging|test/i.test(env.MONGODB_DB || '') || env.GOOGLE_SHEET_ID !== dummySheet
      || env.GOOGLE_SHEET_TAB !== 'Sheet1')
    throw issue('CC_STAGING_REFUSED', 'Personal staging requires the approved staging origin, testing database and dummy Sheet1.');
  if (env.CC_LIST_ID !== PERSONAL_STAGING_LIST_ID || env.CC_LIST_NAME !== PERSONAL_STAGING_LIST_NAME)
    throw issue('CC_TARGET_REFUSED', 'Select the approved personal staging test list.');
  const clientId = env.CC_CLIENT_ID?.trim();
  const secret = env.CC_CLIENT_SECRET?.trim();
  if (!clientId || !secret) throw issue('CC_NOT_CONFIGURED', 'Personal staging client credentials are missing.');
  if (!/^[a-f0-9]{64}$/.test(env.CC_STAGING_SUBJECT_HASH || ''))
    throw issue('CC_ACCOUNT_NOT_VERIFIED', 'Configure the verified personal staging account identity.');
  if (env.CC_REDIRECT_URI !== PERSONAL_STAGING_CALLBACK)
    throw issue('CC_CALLBACK_REFUSED', 'Use the exact Lead71 staging callback.');
  return { clientId, secret, callback: PERSONAL_STAGING_CALLBACK };
}

export function assertPersonalStagingToken(token, env = process.env) {
  // The pin is an additional account guard. Constant Contact validates the token.
  let subject;
  try { subject = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub; }
  catch { throw issue('CC_ACCOUNT_REFUSED', 'The personal account token could not be verified.'); }
  if (!subject || hash(subject) !== env.CC_STAGING_SUBJECT_HASH)
    throw issue('CC_ACCOUNT_REFUSED', 'The connected account differs from the verified personal staging account.');
}
function identity(tenantId, env) {
  const config = personalStagingConfig(env);
  return { tenantId, key: `cc_personal_staging_connection:${hash(config.clientId)}:${PERSONAL_STAGING_LIST_ID}` };
}

export async function personalStagingStatus(db, tenantId, env = process.env) {
  if (!personalStagingEnabled(env)) return { enabled: false, configured: false, connected: false, listName: PERSONAL_STAGING_LIST_NAME };
  try {
    const config = await db.collection('settings').findOne(identity(tenantId, env));
    if (config?.tokens) assertPersonalStagingToken(decryptValue(config.tokens).access, env);
    return { enabled: true, configured: true, connected: Boolean(config?.tokens && config?.verifiedListId === PERSONAL_STAGING_LIST_ID), writesEnabled: env.CC_STAGING_WRITES_ENABLED === 'true', listName: PERSONAL_STAGING_LIST_NAME, listId: PERSONAL_STAGING_LIST_ID };
  } catch (error) { return { enabled: true, configured: false, connected: false, listName: PERSONAL_STAGING_LIST_NAME, error: error.message }; }
}

async function exchange(db, tenantId, values, env, fetcher) {
  const c = personalStagingConfig(env);
  let r;
  try { r = await fetcher(TOKEN, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(12000),
    headers: { Authorization: `Basic ${Buffer.from(`${c.clientId}:${c.secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(values) }); }
  catch { throw issue('CC_AUTH_UNCERTAIN', 'Authorization could not be confirmed. Reconnect Constant Contact.'); }
  if (!r.ok) throw issue('CC_AUTH_FAILED', 'Constant Contact authorization failed. Reconnect the approved account.');
  const token = await r.json().catch(() => ({}));
  if (!token.access_token || !token.refresh_token || !(Number(token.expires_in) > 0)) throw issue('CC_AUTH_INVALID', 'Constant Contact returned incomplete authorization.');
  assertPersonalStagingToken(token.access_token, env);
  await db.collection('settings').updateOne(identity(tenantId, env), { $set: { tokens: encryptValue({ access: token.access_token, refresh: token.refresh_token, expires: Date.now() + Number(token.expires_in) * 1000 }), refreshUntil: new Date(0) },
    ...(values.grant_type === 'authorization_code' ? {$unset:{verifiedListId:'',verifiedAt:''}} : {}) }, { upsert: true });
  return token.access_token;
}

async function accessToken(db, tenantId, env, fetcher) {
  const query = identity(tenantId, env), settings = db.collection('settings');
  const connection = await settings.findOne(query);
  if (!connection?.tokens) throw issue('CC_CONNECTION_REQUIRED', 'An administrator must connect the approved Constant Contact account.');
  const token = decryptValue(connection.tokens);
  assertPersonalStagingToken(token.access, env);
  if (token.expires > Date.now() + 60000) return token.access;
  const lock = await settings.findOneAndUpdate({ ...query, $or: [{ refreshUntil: { $lt: new Date() } }, { refreshUntil: { $exists: false } }] },
    { $set: { refreshUntil: new Date(Date.now() + 30000) } }, { returnDocument: 'after' });
  if (!lock) throw issue('CC_AUTH_BUSY', 'Authorization is refreshing. Retry shortly.', 409);
  try { return await exchange(db, tenantId, { grant_type: 'refresh_token', refresh_token: token.refresh }, env, fetcher); }
  finally { await settings.updateOne(query, { $set: { refreshUntil: new Date(0) } }); }
}

export async function beginPersonalStagingConnection(db, user, session, env = process.env) {
  const c = personalStagingConfig(env), state = randomBytes(32).toString('hex'), nonce = randomBytes(32).toString('hex');
  await db.collection('settings').insertOne({ tenantId: user.tenantId, key: `cc_personal_staging_oauth:${hash(state)}`, clientHash: hash(c.clientId), callback:c.callback, userId: session.userId, sessionId: session._id,
    nonceHash: hash(nonce), expires: new Date(Date.now() + 600000) });
  const url = new URL('https://authz.constantcontact.com/oauth2/default/v1/authorize');
  url.search = new URLSearchParams({ client_id: c.clientId, redirect_uri: c.callback, response_type: 'code', scope: 'contact_data offline_access', state }).toString();
  return { url: url.href, cookie: `cc_personal_staging_oauth=${nonce}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600` };
}

export async function finishPersonalStagingConnection(db, query, nonce, env = process.env, fetcher = fetch) {
  const c = personalStagingConfig(env);
  if (!/^[a-f0-9]{64}$/.test(String(query.state || '')) || typeof query.code !== 'string' || !query.code || !nonce)
    throw issue('CC_OAUTH_INVALID', 'Authorization was cancelled or expired. Connect again.', 400);
  const state = await db.collection('settings').findOneAndDelete({ key: `cc_personal_staging_oauth:${hash(query.state)}`, nonceHash: hash(nonce), clientHash: hash(c.clientId), callback:c.callback, expires: { $gt: new Date() } });
  if (!state) throw issue('CC_OAUTH_INVALID', 'Authorization expired or was already used. Connect again.', 400);
  const session = await db.collection('sessions').findOne({ _id: state.sessionId, userId: state.userId });
  if (!session || session.user?.role !== 'vision71_administrator' || session.anonymous || session.user.tenantId !== state.tenantId || new Date(session.absoluteExpiresAt) <= new Date() || Date.now() - new Date(session.lastSeenAt).getTime() > 30 * 60000)
    throw issue('CC_OAUTH_SESSION_INVALID', 'Administrator session expired. Connect again.', 403);
  await exchange(db, state.tenantId, { grant_type: 'authorization_code', code: query.code, redirect_uri: c.callback }, env, fetcher);
  // This is the only production list metadata endpoint. Never enumerate lists.
  await allowedCall(db, state.tenantId, `/contact_lists/${PERSONAL_STAGING_LIST_ID}`, 'GET', undefined, env, fetcher);
  await db.collection('settings').updateOne(identity(state.tenantId, env), { $set: { verifiedListId: PERSONAL_STAGING_LIST_ID, verifiedAt: new Date() } });
}

export function personalStagingPayload(data, env = process.env) {
  const email = String(data.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw issue('CC_EMAIL_REQUIRED', 'Add a valid email address before Constant Contact delivery.', 400);
  const [first = '', ...rest] = String(data.fullName || '').trim().split(/\s+/);
  const notes = String(data.notes || '');
  if (notes.length > 2000) throw issue('CC_NOTES_TOO_LONG', 'Short Notes must contain at most 2000 characters for Constant Contact. Edit the review field before submitting.', 400);
  const notesFieldId = env.CC_STAGING_NOTES_FIELD_ID;
  if (notes && !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(notesFieldId || ''))
    throw issue('CC_NOTES_FIELD_REQUIRED', 'Configure the Short Notes custom field before submitting a note.', 503);
  // Consent is never inferred from scanning a business card. No signup/upsert endpoint.
  return { create_source: 'Account', email_address: { address: email, permission_to_send: 'not_set' }, first_name: first.slice(0, 50), last_name: rest.join(' ').slice(0, 50),
    company_name: String(data.companyName || '').slice(0, 50), job_title: String(data.jobTitle || '').slice(0, 50), list_memberships: [PERSONAL_STAGING_LIST_ID],
    ...(notes ? { notes: [{ content: notes }] } : {}),
    ...(notes ? { custom_fields: [{ custom_field_id: notesFieldId, value: notes }] } : {}),
    ...(data.phone ? { phone_numbers: [{ phone_number: String(data.phone).slice(0, 25), kind: 'work' }] } : {}) };
}

export async function allowedCall(db, tenantId, path, method, body, env = process.env, fetcher = fetch) {
  personalStagingConfig(env);
  const isList = method === 'GET' && path === `/contact_lists/${PERSONAL_STAGING_LIST_ID}`;
  const createKeys = new Set(['create_source', 'email_address', 'first_name', 'last_name', 'company_name', 'job_title', 'list_memberships', 'phone_numbers', 'notes', 'custom_fields']);
  const validNotes = body?.notes === undefined || (Array.isArray(body.notes) && body.notes.length === 1
    && Object.keys(body.notes[0] || {}).length === 1 && typeof body.notes[0].content === 'string'
    && body.notes[0].content.length > 0 && body.notes[0].content.length <= 2000);
  const validCustomNotes = body?.notes === undefined ? body?.custom_fields === undefined
    : /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(env.CC_STAGING_NOTES_FIELD_ID || '')
      && Array.isArray(body.custom_fields) && body.custom_fields.length === 1
      && Object.keys(body.custom_fields[0] || {}).length === 2
      && body.custom_fields[0].custom_field_id === env.CC_STAGING_NOTES_FIELD_ID
      && body.custom_fields[0].value === body.notes?.[0]?.content;
  const isCreate = method === 'POST' && path === '/contacts' && Array.isArray(body?.list_memberships) && body.list_memberships.length === 1 && body.list_memberships[0] === PERSONAL_STAGING_LIST_ID && body.email_address?.permission_to_send === 'not_set' && body.create_source === 'Account' && validNotes && validCustomNotes
    && Object.keys(body).every(key => createKeys.has(key)) && Object.keys(body.email_address).every(key => ['address', 'permission_to_send'].includes(key));
  if (!isList && !isCreate) throw issue('CC_OPERATION_REFUSED', 'This Constant Contact operation is outside the approved destination.', 403);
  if (isCreate && env.CC_STAGING_WRITES_ENABLED !== 'true') throw issue('CC_WRITES_PAUSED', 'Personal staging Constant Contact writes are paused.');
  const token = await accessToken(db, tenantId, env, fetcher);
  assertPersonalStagingToken(token, env);
  let response;
  try { response = await fetcher(`${API}${path}`, { method, redirect: 'error', signal: AbortSignal.timeout(12000), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
  catch { throw issue(isCreate ? 'CC_CREATE_UNCERTAIN' : 'CC_NETWORK_FAILED', isCreate ? 'Delivery is uncertain. Do not resend until an administrator reconciles this reference.' : 'Constant Contact could not be reached. Retry later.'); }
  if (!response.ok) {
    if (isCreate && response.status === 409) throw issue('CC_EXISTING_CONTACT', 'This email already exists in Constant Contact. No existing contact was read or changed.', 409);
    throw issue(isCreate && response.status >= 500 ? 'CC_CREATE_UNCERTAIN' : 'CC_REQUEST_FAILED', `Constant Contact rejected the request (${response.status}). Retry only when the delivery status permits it.`);
  }
  const result = await response.json().catch(() => null);
  if (isList && (result?.list_id !== PERSONAL_STAGING_LIST_ID || result?.name !== PERSONAL_STAGING_LIST_NAME)) throw issue('CC_TARGET_REFUSED', 'The destination list identity did not match. Delivery is blocked.');
  if (isCreate && !result?.contact_id) throw issue('CC_CREATE_UNCERTAIN', 'Delivery could not be confirmed. Administrator reconciliation is required.');
  return result;
}

// Only references, HMAC digests, provider IDs and states persist here. No contact payload.
export async function deliverPersonalStagingContact(db, user, card, env = process.env, fetcher = fetch) {
  if (!personalStagingEnabled(env)) return card;
  let receipt, query, createStarted = false;
  const settings = db.collection('settings');
  try {
    personalStagingConfig(env);
    if (card.sheetStatus !== 'submitted' || card.capturedBy !== user.id || card.tenantId !== user.tenantId) throw issue('CC_SHEET_NOT_CONFIRMED', 'The contact must be saved to Google Sheets first.', 409);
    if (env.CC_STAGING_WRITES_ENABLED !== 'true') return { ...card, constantContactIntegration: true, transferStatus: 'pending', transferError: 'Saved to Google Sheets. Constant Contact delivery is paused until the write gate is enabled.' };
    if (!card.sheetDeliveryVerified) throw issue('CC_SHEET_NOT_VERIFIED', 'The reviewed details must match the saved Sheet row before delivery.', 409);
    if (!String(card.verifiedData?.email || '').trim()) return { ...card, constantContactIntegration: true, transferStatus: 'not_started', transferError: 'Saved to Google Sheets. An email address is required for Constant Contact.' };
    const body = personalStagingPayload(card.verifiedData, env);
    query = { tenantId: user.tenantId, key: `cc_personal_staging_submission:${user.id}:${card.id}` };
    const digest = blindIndex(JSON.stringify(body));
    receipt = await settings.findOne(query);
    if (!receipt) {
      try { await settings.insertOne({ ...query, recordId: card.recordId, listId: PERSONAL_STAGING_LIST_ID, digest, state: 'pending', createdAt: new Date() }); }
      catch (error) { if (error.code !== 11000) throw error; }
      receipt = await settings.findOne(query);
    }
    if (receipt.digest !== digest || receipt.listId !== PERSONAL_STAGING_LIST_ID) throw issue('CC_REFERENCE_CONFLICT', 'These details differ from this delivery reference. Administrator review is required.', 409);
    if (receipt.state === 'transferred') return { ...card, constantContactIntegration: true, transferStatus: 'transferred', ccContactId: receipt.ccId, transferError: '' };
    if (receipt.state === 'existing_contact') return { ...card, constantContactIntegration: true, transferStatus: 'existing_contact', transferError: 'Existing Constant Contact email preserved. No existing contact was read or changed.' };
    if (['creating', 'reconciliation_required'].includes(receipt.state)) throw issue('CC_CREATE_UNCERTAIN', 'Delivery needs administrator reconciliation. Automatic resend is blocked.');
    const claimed = await settings.findOneAndUpdate({ ...query, state: { $in: ['pending', 'failed'] }, $or: [{ lease: { $exists: false } }, { lease: { $lt: new Date() } }] }, { $set: { lease: new Date(Date.now() + 60000), state: 'pending' } }, { returnDocument: 'after' });
    if (!claimed) throw issue('CC_BUSY', 'Delivery is already processing. Retry later.', 409);
    await allowedCall(db, user.tenantId, `/contact_lists/${PERSONAL_STAGING_LIST_ID}`, 'GET', undefined, env, fetcher);
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
