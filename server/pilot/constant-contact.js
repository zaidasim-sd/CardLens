import { createRemoteJWKSet, jwtVerify } from 'jose';
import { fail, recordFor, role, saveStatus } from './workflow.js';
const issuer = 'https://authz.constantcontact.com/oauth2/default';
const tokenIssuer = 'https://identity.constantcontact.com/oauth2/aus1lm3ry9mF7x2Ja0h8';
const jwks = createRemoteJWKSet(new URL(`${tokenIssuer}/v1/keys`));
export class ConstantContact {
  constructor(store, env = process.env, fetcher = fetch) { this.store = store; this.env = env; this.fetch = fetcher; this.queue = Promise.resolve(); this.lastRequest = 0; }
  authorization(state) {
    if (!this.env.CC_CLIENT_ID || !this.env.CC_CLIENT_SECRET) fail('CC_NOT_CONFIGURED', 503);
    return `${issuer}/v1/authorize?${new URLSearchParams({ client_id: this.env.CC_CLIENT_ID, redirect_uri: this.env.CC_REDIRECT_URI, response_type: 'code', scope: 'contact_data offline_access', state })}`;
  }
  async token(tenant, params) {
    const r = await this.fetch(`${issuer}/v1/token`, { method: 'POST', signal: AbortSignal.timeout(20000), headers: { Authorization: `Basic ${Buffer.from(`${this.env.CC_CLIENT_ID}:${this.env.CC_CLIENT_SECRET}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) });
    if (!r.ok) fail('CC_AUTH_FAILED', 502);
    const token = await r.json();
    const { payload } = await jwtVerify(token.access_token, jwks, { issuer: tokenIssuer, audience: 'https://api.cc.email/v3', algorithms: ['RS256'], requiredClaims: ['exp','sub','cid','platform_user_id'] });
    if (payload.cid !== this.env.CC_CLIENT_ID) fail('CC_TOKEN_CLIENT_MISMATCH', 502);
    this.store.put(tenant, 'integration', 'cc', { ...token, expiresAt: Date.now() + token.expires_in * 1000 });
  }
  async request(tenant, route, options = {}) {
    const task = this.queue.then(() => this.requestSerial(tenant, route, options));
    this.queue = task.catch(() => {}); return task;
  }
  async requestSerial(tenant, route, options = {}) {
    const delay = this.lastRequest + 300 - Date.now();
    if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
    this.lastRequest = Date.now();
    let t = this.store.get(tenant, 'integration', 'cc'); if (!t) fail('CC_CONSENT_REQUIRED', 409);
    if (t.expiresAt < Date.now() + 60000) { await this.token(tenant, { grant_type: 'refresh_token', refresh_token: t.refresh_token }); t = this.store.get(tenant, 'integration', 'cc'); }
    const r = await this.fetch(`https://api.cc.email/v3${route}`, { ...options, signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${t.access_token}`, 'Content-Type': 'application/json' } });
    if (!r.ok) throw Object.assign(new Error('CC_REQUEST_FAILED'), { code: r.status === 429 ? 'CC_RATE_LIMIT' : 'CC_REQUEST_FAILED', httpStatus: r.status, retryAfter: Math.min(3600, Math.max(1, Number(r.headers.get('retry-after')) || 60)) });
    return r.json();
  }
  async lookup(tenant, email) { return (await this.request(tenant, `/contacts?email=${encodeURIComponent(email)}&include=custom_fields,list_memberships,phone_numbers`)).contacts || []; }
  async configuration(tenant) {
    const lists = await this.request(tenant, '/contact_lists?limit=500');
    const custom = await this.request(tenant, '/contact_custom_fields?limit=100');
    return { lists: lists.lists || [], customFields: custom.custom_fields || [] };
  }
  async create(tenant, data, config) {
    const names = data.fullName.split(' ');
    return this.request(tenant, '/contacts', { method: 'POST', body: JSON.stringify({ email_address: { address: data.email, permission_to_send: 'implicit' }, first_name: names.shift(), last_name: names.join(' '), company_name: data.companyName, create_source: 'Account', list_memberships: [config.listId], phone_numbers: [data.phone, data.alternatePhone].filter(Boolean).map((v, i) => ({ phone_number: v, kind: i ? 'other' : 'work' })), custom_fields: [{ custom_field_id: config.sourceFieldId, value: data.event || 'CardSnap test' }] }) });
  }
}

// A durable tenant lock serializes destination checks and writes. Crash recovery is
// deliberately conservative: an interrupted write must be reconciled by a reviewer.
export async function transfer(store, cc, user, id) {
  role(user, ['reviewer']);
  const r = recordFor(store, user, id);
  if (r.status === 'transferred') return r;
  if (!['approved', 'transfer_failed'].includes(r.status)) fail('NOT_APPROVED', 409);
  if (r.uncertain) fail('RECONCILIATION_REQUIRED', 409);
  if ((r.retryAt || 0) > Date.now()) fail('RETRY_NOT_DUE', 429);
  const config = store.get(user.tenant, 'config', 'cc');
  if (!config?.listId || !config?.sourceFieldId || !config.testAccountConfirmed) fail('CC_CONFIGURATION_REQUIRED', 409);
  try { store.db.prepare('INSERT INTO locks VALUES(?)').run(user.tenant); } catch { fail('TRANSFER_BUSY_OR_INTERRUPTED', 409); }
  try {
    const existing = await cc.lookup(user.tenant, r.data.email);
    if (existing.length) { r.remoteMatches = existing; return saveStatus(store, user, r, 'possible_duplicate'); }
    r.uncertain = true; saveStatus(store, user, r, 'transfer_failed');
    const result = await cc.create(user.tenant, r.data, config);
    if (!result.contact_id) fail('CC_RESULT_UNCONFIRMED', 502);
    r.ccId = result.contact_id; r.uncertain = false; r.errorCode = null;
    return saveStatus(store, user, r, 'transferred');
  } catch (e) {
    // A definitive non-timeout 4xx means no creation occurred. 409 still returns to
    // lookup on retry; timeouts and 5xx require human reconciliation.
    if (e.httpStatus >= 400 && e.httpStatus < 500 && e.httpStatus !== 408) r.uncertain = false;
    r.errorCode = e.code || 'CC_NETWORK_FAILURE'; r.retryAt = Date.now() + (e.retryAfter || 60) * 1000;
    return saveStatus(store, user, r, 'transfer_failed');
  } finally { store.db.prepare('DELETE FROM locks WHERE tenant=?').run(user.tenant); }
}
