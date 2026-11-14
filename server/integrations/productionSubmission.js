import { createCard } from '../cards/service.js';
import { deliverProductionContact } from './productionConstantContact.js';
import { productionEnabled } from './productionConstantContact.js';
import { createSheetGateway, submissionSheetField, sheetRow } from './sheetService.js';
import mapping from '../../config/sheetMapping.json' with { type: 'json' };

export async function verifyProductionSheetRecord(card, env = process.env, gateway = createSheetGateway(env)) {
  if (!gateway) throw new Error('Sheet verification is unavailable.');
  const rows = await gateway.readAll(), fields = (rows[0] || []).map(submissionSheetField);
  const idColumn = fields.indexOf('recordId');
  const matches = idColumn < 0 ? [] : rows.slice(1).filter(row => String(row[idColumn] || '') === card.recordId);
  if (matches.length !== 1) throw new Error('Sheet reference is missing or ambiguous.');
  const expected = sheetRow(card);
  for (const field of ['event', 'fullName', 'companyName', 'jobTitle', 'email', 'phone', 'notes', 'capturedByName']) {
    const column = fields.indexOf(field), canonical = mapping.columns.findIndex(c => c.field === field);
    if (column < 0 || String(matches[0][column] || '') !== String(expected[canonical] || '')) throw new Error('Sheet details differ from the reviewed contact.');
  }
  return { ...card, sheetDeliveryVerified: true };
}

export async function deliverVerifiedProductionContact(db, user, card, deps = {}) {
  const env = deps.env || process.env;
  if (!productionEnabled(env) || env.CC_WRITES_ENABLED_PRODUCTION !== 'true') return (deps.deliver || deliverProductionContact)(db, user, card, env);
  try {
    const verified = await (deps.verify || verifyProductionSheetRecord)(card, env);
    return (deps.deliver || deliverProductionContact)(db, user, verified, env);
  } catch {
    return { ...card, constantContactIntegration: true, transferStatus: 'failed', transferError: 'Saved submission could not be matched to the reviewed Sheet details. No Constant Contact request was made. Retain this reference for administrator review.' };
  }
}

export async function submitProductionContact(db, user, input, deps = {}) {
  const record = await (deps.saveSheet || createCard)(db, user, input);
  if(record.alreadySubmitted)return record;
  return deliverVerifiedProductionContact(db, user, record, deps);
}
