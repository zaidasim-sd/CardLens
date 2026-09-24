import { randomUUID } from 'node:crypto';
import { z } from 'zod';
export const fields = ['event', 'country', 'organisationType', 'contactType', 'interest', 'noteCategory'];
export const defaults = { retentionHours: 24, dropdowns: { event: ['Fictional Aviation Expo'], country: ['Pakistan', 'United Kingdom', 'United States'], organisationType: ['Airline', 'Maintenance company', 'Broker', 'Supplier'], contactType: ['Prospect', 'Customer', 'Supplier', 'Partner'], interest: ['Parts', 'Services'], noteCategory: ['General'] } };
const short = z.string().trim().max(100).default('');
export const contactSchema = z.object({ fullName: short, companyName: short, email: z.union([z.string().trim().email().max(80).toLowerCase(), z.literal('')]).default(''), phone: z.string().max(30).default(''), alternatePhone: z.string().max(30).default(''), notes: z.string().max(500).default(''), ...Object.fromEntries(fields.map(k => [k, short])), fictional: z.literal(true) }).strict();
export const phone = value => value.replace(/[^\d+]/g, '').replace(/^00/, '+');
const normal = v => v.trim().toLowerCase().replace(/\s+/g, ' ');
export function duplicates(records, record) {
  const p = [record.data.phone, record.data.alternatePhone].filter(Boolean).map(phone);
  return records.filter(r => r.id !== record.id && r.status !== 'archived' && (
    (record.data.email && normal(r.data.email) === normal(record.data.email)) ||
    [r.data.phone, r.data.alternatePhone].filter(Boolean).some(v => p.includes(phone(v))) ||
    (record.data.companyName && normal(r.data.fullName) === normal(record.data.fullName) && normal(r.data.companyName) === normal(record.data.companyName))
  )).map(r => ({ id: r.id, data: r.data, status: r.status }));
}
export function fail(code, status = 400) { throw Object.assign(new Error(code), { code, status }); }
export function role(user, roles) { if (!roles.includes(user.role)) fail('FORBIDDEN', 403); }
export function recordFor(store, user, id) {
  const r = store.get(user.tenant, 'record', id);
  if (!r || (user.role === 'assistant' && r.owner !== user.id)) fail('NOT_FOUND', 404);
  return r;
}
export function saveStatus(store, user, r, status) {
  return store.transaction(() => { r.status = status; r.updatedAt = new Date().toISOString(); r.version = (r.version || 0) + 1; store.put(user.tenant, 'record', r.id, r); store.audit(user.tenant, user.id, status, r.id); return r; });
}
export function createRecord(store, user, input) {
  role(user, ['assistant']); const data = validateData(store, user, input);
  return saveStatus(store, user, { id: randomUUID(), owner: user.id, data, createdAt: new Date().toISOString(), version: 0 }, 'draft');
}
export function validateData(store, user, input) {
  const data = contactSchema.parse(input); const config = store.get(user.tenant, 'config', 'settings') || defaults;
  for (const k of fields) if (data[k] && !config.dropdowns[k].includes(data[k])) fail('INVALID_DROPDOWN');
  return data;
}
export function transition(store, user, id, action, version) {
  const r = recordFor(store, user, id);
  if (r.version !== version) fail('STALE_RECORD_REFRESH', 409);
  if (action === 'submit') {
    role(user, ['assistant']); if (r.status !== 'draft') fail('INVALID_STATE', 409);
    if (!r.data.fullName || !r.data.email) fail('COMPLETE_NAME_EMAIL_REQUIRED');
    r.duplicateIds = duplicates(store.all(user.tenant, 'record'), r).map(d => d.id);
    return saveStatus(store, user, r, r.duplicateIds.length ? 'possible_duplicate' : 'submitted');
  }
  role(user, ['reviewer']);
  if (action === 'archive' && ['draft', 'submitted', 'possible_duplicate', 'rejected'].includes(r.status)) return saveStatus(store, user, r, 'archived');
  if (!['submitted', 'possible_duplicate'].includes(r.status)) fail('INVALID_STATE', 409);
  if (action === 'correct') return saveStatus(store, user, r, 'draft');
  if (action === 'reject') return saveStatus(store, user, r, 'rejected');
  if (action === 'approve') {
    if (duplicates(store.all(user.tenant, 'record'), r).length) fail('DUPLICATE_DECISION_REQUIRED', 409);
    return saveStatus(store, user, r, 'approved');
  }
  if (action === 'distinct') { r.duplicateDecision = { actor: user.id, at: new Date().toISOString(), decision: 'distinct_contact' }; return saveStatus(store, user, r, 'approved'); }
  fail('INVALID_ACTION');
}
