import { createHash } from 'node:crypto';
import { z } from 'zod';
import { transfer } from '../server/pilot/constant-contact.js';

// Reuse durable transfers so repeated runs and uncertain writes cannot double-create.
export async function exportOCR(store, cc, tenant, result) {
  const data = { ...result.parsed, event: 'CardSnap OCR benchmark' };
  data.email = (data.email || '').trim().toLowerCase();
  data.fullName = (data.fullName || '').trim();
  if (!data.fullName || !z.string().email().max(80).safeParse(data.email).success) {
    return { status: 'invalid_contact', errorCode: 'VALID_NAME_EMAIL_REQUIRED' };
  }
  const id = `ocr-${createHash('sha256').update(JSON.stringify([result.id, data])).digest('hex')}`;
  const user = { id: 'ocr-benchmark', tenant, role: 'reviewer' };
  if (!store.get(tenant, 'record', id)) {
    store.put(tenant, 'record', id, { id, owner: user.id, data, status: 'approved', version: 1, createdAt: new Date().toISOString() });
    store.audit(tenant, user.id, 'ocr_export_requested', id);
  }
  const existing = store.get(tenant, 'record', id);
  if (existing.status === 'possible_duplicate') return { status: 'already_exists', recordId: id, contactId: existing.remoteMatches?.[0]?.contact_id };
  try {
    const record = await transfer(store, cc, user, id);
    return { status: record.status === 'possible_duplicate' ? 'already_exists' : record.status, recordId: id, contactId: record.ccId || record.remoteMatches?.[0]?.contact_id, errorCode: record.errorCode || undefined };
  } catch (error) {
    return { status: 'transfer_failed', recordId: id, errorCode: error.code || 'CC_EXPORT_FAILED' };
  }
}
