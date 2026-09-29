import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/pilot/store.js';
import { ConstantContact } from '../server/pilot/constant-contact.js';
import { exportOCR } from './export-ocr.js';

const result = { id: 1, parsed: { fullName: 'Alice Example', email: 'alice@example.com', companyName: 'Example Co', phone: '+12025550101', alternatePhone: '+12025550102' } };
function setup(t) {
  const store = new Store(':memory:', 'ab'.repeat(32));
  t.after(() => store.db.close());
  store.put('demo', 'config', 'cc', { listId: 'list', sourceFieldId: 'source', testAccountConfirmed: true });
  return store;
}
test('exports parsed fields and repeat runs reuse the receipt', async t => {
  const store = setup(t);
  store.put('demo', 'integration', 'cc', { access_token: 'test', expiresAt: Date.now() + 3600000 });
  let creates = 0;
  const cc = new ConstantContact(store, {}, async (url, options) => {
    if (!options.method) return { ok: true, json: async () => ({ contacts: [] }) };
    creates++;
    const body = JSON.parse(options.body);
    assert.equal(body.email_address.address, result.parsed.email);
    assert.equal(body.first_name, 'Alice');
    assert.equal(body.last_name, 'Example');
    assert.equal(body.company_name, 'Example Co');
    assert.deepEqual(body.list_memberships, ['list']);
    assert.equal(body.phone_numbers.length, 2);
    assert.equal(body.custom_fields[0].value, 'CardSnap OCR benchmark');
    return { ok: true, json: async () => ({ contact_id: 'remote' }) };
  });
  assert.equal((await exportOCR(store, cc, 'demo', result)).status, 'transferred');
  assert.equal((await exportOCR(store, cc, 'demo', result)).contactId, 'remote');
  assert.equal(creates, 1);
});
test('existing email is skipped without creation', async t => {
  const store = setup(t);
  const cc = { lookup: async () => [{ contact_id: 'existing' }], create: async () => assert.fail('must not create') };
  assert.equal((await exportOCR(store, cc, 'demo', result)).status, 'already_exists');
});
test('invalid email is rejected before any request', async t => {
  assert.equal((await exportOCR(setup(t), {}, 'demo', { ...result, parsed: { ...result.parsed, email: 'bad' } })).status, 'invalid_contact');
});
test('uncertain create failures cannot be blindly retried', async t => {
  const store = setup(t);
  let creates = 0;
  const cc = { lookup: async () => [], create: async () => { creates++; throw new Error('timeout'); } };
  assert.equal((await exportOCR(store, cc, 'demo', result)).status, 'transfer_failed');
  assert.equal((await exportOCR(store, cc, 'demo', result)).errorCode, 'RECONCILIATION_REQUIRED');
  assert.equal(creates, 1);
});
