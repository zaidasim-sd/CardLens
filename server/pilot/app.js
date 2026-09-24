import express from 'express';
import multer from 'multer';
import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { hash, passwordHash, passwordMatches } from './store.js';
import { defaults, fields, fail, role, createRecord, recordFor, saveStatus, transition, validateData, duplicates } from './workflow.js';
import { ConstantContact, transfer } from './constant-contact.js';
import { parseOCRText } from '../services/cardParser.js';
import { extractImage } from './ocr.js';

export function purgeImages(store, now = Date.now()) {
  const tenants = store.db.prepare("SELECT DISTINCT tenant FROM entities WHERE kind='image'").all();
  let count = 0;
  for (const { tenant } of tenants) for (const im of store.all(tenant, 'image')) if (im.expiresAt <= now) {
    store.transaction(() => { store.delete(tenant, 'image', im.id); store.audit(tenant, 'retention-worker', 'image_deleted', im.recordId); }); count++;
  }
  if (count) store.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  return count;
}
export function makeApp(store, env = process.env, cc = new ConstantContact(store, env)) {
  if (env.APP_ENV === 'production') throw new Error('Production is locked pending acceptance and security review');
  const app = express(); app.disable('x-powered-by'); app.use(express.json({ limit: '32kb' }));
  const origin = env.APP_ORIGIN || 'http://localhost:3000';
  app.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; style-src 'self'; img-src 'self' blob:; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" });
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin !== origin) return res.status(403).json({ error: 'ORIGIN_DENIED' });
    next();
  });
  app.use('/pilot', express.static(path.resolve('server/pilot/ui')));
  app.get('/', (_req, res) => res.redirect('/pilot/'));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', environment: env.APP_ENV || 'development', productionLocked: true }));
  const attempts = new Map();
  app.post('/api/pilot/login', (req, res) => {
    const body = z.object({ tenant: z.string().max(80), username: z.string().max(80), password: z.string().max(200) }).parse(req.body);
    const key = req.ip; const previous = attempts.get(key); const a = previous && previous.until > Date.now() ? previous : { count: 0, until: Date.now() + 900000 };
    if (++a.count > 20) fail('LOGIN_RATE_LIMIT', 429); attempts.set(key, a);
    const user = store.all(body.tenant, 'user').find(u => u.username === body.username);
    if (!user || !user.active || (user.expiresAt && user.expiresAt <= Date.now()) || !passwordMatches(body.password, user.password)) fail('INVALID_LOGIN', 401);
    const token = randomBytes(32).toString('hex'); const csrf = randomBytes(24).toString('hex');
    store.put(body.tenant, 'session', hash(token), { id: hash(token), userId: user.id, csrf, expiresAt: Date.now() + 8 * 3600000 });
    store.audit(body.tenant, user.id, 'login');
    res.cookie('cardsnap', `${body.tenant}.${token}`, { httpOnly: true, sameSite: 'lax', secure: origin.startsWith('https:'), maxAge: 8 * 3600000, path: '/' });
    res.json({ csrf, user: { id: user.id, role: user.role, username: user.username } });
  });
  const auth = (req, _res, next) => {
    const cookie = (req.headers.cookie || '').split('; ').find(x => x.startsWith('cardsnap='))?.slice(9);
    const [tenant, token] = decodeURIComponent(cookie || '').split('.');
    const session = token && store.get(tenant, 'session', hash(token));
    const u = session && store.get(tenant, 'user', session.userId);
    if (!u || !u.active || session.expiresAt <= Date.now() || (u.expiresAt && u.expiresAt <= Date.now())) fail('AUTH_REQUIRED', 401);
    if (!['GET', 'HEAD'].includes(req.method) && req.headers['x-csrf-token'] !== session.csrf) fail('CSRF_DENIED', 403);
    req.user = { ...u, tenant }; req.session = session; next();
  };
  app.use('/api/pilot', auth);
  app.get('/api/pilot/me', (req, res) => res.json({ csrf: req.session.csrf, user: { id: req.user.id, role: req.user.role, username: req.user.username } }));
  app.post('/api/pilot/logout', (req, res) => { store.delete(req.user.tenant, 'session', req.session.id); res.clearCookie('cardsnap'); res.json({ ok: true }); });
  app.use('/api/pilot', (req, _res, next) => { if (req.user.role === 'support' && req.path !== '/metrics') fail('FORBIDDEN', 403); next(); });
  app.get('/api/pilot/records', (req, res) => res.json(store.all(req.user.tenant, 'record').filter(r => req.user.role !== 'assistant' || r.owner === req.user.id)));
  app.post('/api/pilot/records', (req, res) => res.status(201).json(createRecord(store, req.user, req.body)));
  app.put('/api/pilot/records/:id', (req, res) => {
    role(req.user, ['assistant']); const r = recordFor(store, req.user, req.params.id);
    if (r.status !== 'draft' || r.version !== req.body.version) fail('STALE_OR_LOCKED', 409);
    r.data = validateData(store, req.user, req.body.data); res.json(saveStatus(store, req.user, r, 'draft'));
  });
  app.post('/api/pilot/records/:id/action', (req, res) => res.json(transition(store, req.user, req.params.id, req.body.action, req.body.version)));
  app.get('/api/pilot/records/:id/duplicates', (req, res) => { role(req.user, ['reviewer']); const r = recordFor(store, req.user, req.params.id); res.json({ local: duplicates(store.all(req.user.tenant, 'record'), r), remote: r.remoteMatches || [] }); });
  app.post('/api/pilot/records/:id/transfer', async (req, res) => res.json(await transfer(store, cc, req.user, req.params.id)));
  app.post('/api/pilot/records/:id/reconcile', async (req, res) => {
    role(req.user, ['reviewer']); const r = recordFor(store, req.user, req.params.id);
    if (!r.uncertain && !r.remoteMatches?.length) fail('NO_RECONCILIATION_REQUIRED');
    const matches = await cc.lookup(req.user.tenant, r.data.email);
    if (!matches.some(c => c.contact_id === req.body.contactId)) fail('DESTINATION_NOT_VERIFIED', 409);
    r.ccId = req.body.contactId; r.uncertain = false; r.errorCode = null;
    res.json(saveStatus(store, req.user, r, 'transferred'));
  });
  app.get('/api/pilot/config', (req, res) => res.json(store.get(req.user.tenant, 'config', 'settings') || defaults));
  app.put('/api/pilot/config', (req, res) => {
    role(req.user, ['admin']); const c = z.object({ retentionHours: z.number().int().min(0).max(168), dropdowns: z.object(Object.fromEntries(fields.map(k => [k, z.array(z.string().trim().min(1).max(100)).max(100)]))).strict() }).strict().parse(req.body);
    store.transaction(() => { store.put(req.user.tenant, 'config', 'settings', c); for (const im of store.all(req.user.tenant, 'image')) { im.expiresAt = Math.min(im.expiresAt, im.createdAt + c.retentionHours * 3600000); store.put(req.user.tenant, 'image', im.id, im); } store.audit(req.user.tenant, req.user.id, 'settings_changed'); });
    purgeImages(store); res.json(c);
  });
  app.get('/api/pilot/users', (req, res) => { role(req.user, ['admin']); res.json(store.all(req.user.tenant, 'user').map(({ password, ...u }) => u)); });
  app.post('/api/pilot/users', (req, res) => {
    role(req.user, ['admin']); const b = z.object({ username: z.string().regex(/^[a-zA-Z0-9@_-]{3,80}$/), password: z.string().min(14).max(200), role: z.enum(['assistant', 'reviewer', 'admin', 'support']), expiresAt: z.number().optional() }).strict().parse(req.body);
    if (store.all(req.user.tenant, 'user').some(u => u.username === b.username)) fail('USERNAME_EXISTS', 409);
    if (b.role === 'support' && (!b.expiresAt || b.expiresAt <= Date.now() || b.expiresAt > Date.now() + 86400000)) fail('SUPPORT_EXPIRY_REQUIRED');
    const u = { ...b, id: randomUUID(), active: true, password: passwordHash(b.password) }; store.put(req.user.tenant, 'user', u.id, u); store.audit(req.user.tenant, req.user.id, 'user_created', u.id); res.status(201).json({ id: u.id });
  });
  app.post('/api/pilot/users/:id/revoke', (req, res) => {
    role(req.user, ['admin']); if (req.user.id === req.params.id) fail('CANNOT_REVOKE_SELF'); const u = store.get(req.user.tenant, 'user', req.params.id); if (!u) fail('NOT_FOUND', 404);
    u.active = false; store.put(req.user.tenant, 'user', u.id, u); for (const s of store.all(req.user.tenant, 'session')) if (s.userId === u.id) store.delete(req.user.tenant, 'session', s.id); store.audit(req.user.tenant, req.user.id, 'user_revoked', u.id); res.json({ ok: true });
  });
  // Support can see counts only, never cards, contacts, integrations or user lists.
  app.get('/api/pilot/metrics', (req, res) => { role(req.user, ['admin', 'support', 'reviewer']); const records = store.all(req.user.tenant, 'record'); res.json({ failedTransfers: records.filter(r => r.status === 'transfer_failed').length, awaitingReview: records.filter(r => ['submitted', 'possible_duplicate'].includes(r.status)).length }); });
  app.get('/api/pilot/audit', (req, res) => { role(req.user, ['admin', 'reviewer']); res.json(store.db.prepare('SELECT * FROM audit WHERE tenant=? ORDER BY seq DESC LIMIT 500').all(req.user.tenant)); });
  app.post('/api/pilot/cc/connect', (req, res) => {
    role(req.user, ['admin']); const state = randomBytes(32).toString('hex'); store.put(req.user.tenant, 'oauth', hash(state), { sessionId: req.session.id, expiresAt: Date.now() + 300000 }); res.json({ url: cc.authorization(`${req.user.tenant}.${state}`) });
  });
  app.get('/auth/callback', auth, async (req, res) => {
    role(req.user, ['admin']); const [tenant, state] = String(req.query.state || '').split('.'); const saved = state && store.get(tenant, 'oauth', hash(state));
    if (tenant !== req.user.tenant || !saved || saved.sessionId !== req.session.id || saved.expiresAt < Date.now()) fail('OAUTH_STATE_INVALID', 403);
    store.delete(tenant, 'oauth', hash(state));
    await cc.token(tenant, { grant_type: 'authorization_code', code: String(req.query.code || ''), redirect_uri: env.CC_REDIRECT_URI }); store.audit(tenant, req.user.id, 'cc_connected'); res.redirect('/pilot/?connected=1');
  });
  app.get('/api/pilot/cc/options', async (req, res) => { role(req.user, ['admin']); res.json(await cc.configuration(req.user.tenant)); });
  app.put('/api/pilot/cc/config', (req, res) => {
    role(req.user, ['admin']); const c = z.object({ listId: z.uuid(), sourceFieldId: z.uuid(), testAccountConfirmed: z.literal(true) }).strict().parse(req.body); store.put(req.user.tenant, 'config', 'cc', c); store.audit(req.user.tenant, req.user.id, 'cc_mapping_configured'); res.json({ ok: true });
  });
  app.get('/api/pilot/export', (req, res) => {
    role(req.user, ['reviewer']); const records = store.all(req.user.tenant, 'record').filter(r => r.status === 'approved' && !r.uncertain);
    const escape = v => `"${String(v || '').replace(/^[=+@-]/, "'$&").replaceAll('"', '""')}"`;
    store.audit(req.user.tenant, req.user.id, 'controlled_export');
    res.type('text/csv').attachment('approved-for-manual-review.csv').send(['Record ID,Email,Name,Company,Event', ...records.map(r => [r.id, r.data.email, r.data.fullName, r.data.companyName, r.data.event].map(escape).join(','))].join('\r\n'));
  });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 2, fields: 1 } }).fields([{ name: 'front', maxCount: 1 }, { name: 'back', maxCount: 1 }]);
  app.post('/api/pilot/records/:id/ocr', (req, _res, next) => { role(req.user, ['assistant']); const r = recordFor(store, req.user, req.params.id); if (r.status !== 'draft') fail('INVALID_STATE', 409); next(); }, upload, async (req, res) => {
    const r = recordFor(store, req.user, req.params.id); const files = Object.values(req.files || {}).flat(); if (!files.length) fail('IMAGE_REQUIRED');
    const output = [];
    for (const file of files) {
      const b = file.buffer; const png = b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])); const jpg = b[0] === 255 && b[1] === 216 && b[2] === 255;
      if (!(png && file.mimetype === 'image/png') && !(jpg && file.mimetype === 'image/jpeg')) fail('INVALID_IMAGE');
      const extracted = await extractImage(b, env);
      const c = store.get(req.user.tenant, 'config', 'settings') || defaults; const id = randomUUID();
      if (c.retentionHours > 0) store.put(req.user.tenant, 'image', id, { id, recordId: r.id, createdAt: Date.now(), expiresAt: Date.now() + c.retentionHours * 3600000, content: b.toString('base64') });
      output.push(extracted);
    }
    store.audit(req.user.tenant, req.user.id, 'ocr_processed', r.id); res.json({ parsed: parseOCRText(output.join('\n')) });
  });
  app.delete('/api/pilot/records/:id/images', (req, res) => {
    role(req.user, ['admin', 'reviewer']); recordFor(store, req.user, req.params.id);
    store.transaction(() => { for (const im of store.all(req.user.tenant, 'image')) if (im.recordId === req.params.id) store.delete(req.user.tenant, 'image', im.id); store.audit(req.user.tenant, req.user.id, 'images_deleted', req.params.id); }); store.db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); res.json({ ok: true });
  });
  app.use((err, _req, res, _next) => { const status = err instanceof z.ZodError ? 400 : err.code === 'LIMIT_FILE_SIZE' ? 413 : err.status || 500; res.status(status).json({ error: err instanceof z.ZodError ? 'INVALID_INPUT' : err.status ? err.code : 'REQUEST_FAILED' }); });
  return app;
}
