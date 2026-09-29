import 'dotenv/config';
import { createWorker } from 'tesseract.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { parseOCRText } from '../server/services/cardParser.js';
import { Store } from '../server/pilot/store.js';
import { ConstantContact } from '../server/pilot/constant-contact.js';
import { exportOCR } from './export-ocr.js';

const cases = JSON.parse(readFileSync('validation/ocr/manifest.json'));
const results = [];
const exportEnabled = !process.argv.includes('--no-export');
const tenant = process.env.CC_TENANT || 'demo';
const normalize = (v, k) => k === 'phone' ? v.replace(/\D/g, '') : v.trim().toLowerCase().replace(/\s+/g, ' ');
let store, worker;
try {
  let cc;
  if (exportEnabled) {
    store = new Store(process.env.DATA_PATH || './.data/development.sqlite', process.env.DATA_KEY);
    if (!store.get(tenant, 'integration', 'cc')) throw new Error('Connect Constant Contact through pilot OAuth before running test:ocr, or use --no-export.');
    const config = store.get(tenant, 'config', 'cc');
    if (!config?.listId || !config?.sourceFieldId || !config.testAccountConfirmed) throw new Error('Configure the Constant Contact destination list, source field, and confirmed test account in the pilot first.');
    cc = new ConstantContact(store);
  }
  worker = await createWorker('eng');
  for (const c of cases) {
    const start = performance.now();
    let raw = '';
    for (const file of c.files) raw += '\n' + (await worker.recognize(`validation/ocr/${file}`)).data.text;
    const parsed = parseOCRText(raw);
    const matches = Object.fromEntries(Object.entries(c.expected).map(([k, v]) => [k, normalize(parsed[k] || '', k) === normalize(v, k)]));
    const result = { id: c.id, category: c.category, milliseconds: Math.round(performance.now() - start), matches, manualCorrectionRequired: Object.values(matches).some(v => !v), parsed };
    result.export = exportEnabled ? await exportOCR(store, cc, tenant, result) : { status: 'disabled' };
    results.push(result);
    writeFileSync('validation/ocr/results.json', JSON.stringify({ complete: false, results }, null, 2));
    console.log(`Card ${c.id}: ${result.export.status}${result.export.errorCode ? ` (${result.export.errorCode})` : ''}`);
  }
  const summary = {
    complete: true,
    provider: 'Tesseract.js local baseline, not a cloud-provider validation',
    cards: results.length,
    pages: cases.reduce((n, c) => n + c.files.length, 0),
    accuracy: Object.fromEntries(Object.keys(cases[0]?.expected || {}).map(k => [k, results.filter(r => r.matches[k]).length / results.length])),
    meanMilliseconds: results.length ? Math.round(results.reduce((n, r) => n + r.milliseconds, 0) / results.length) : 0,
    manualCorrectionCards: results.filter(r => r.manualCorrectionRequired).length,
    exports: results.reduce((counts, r) => { counts[r.export.status] = (counts[r.export.status] || 0) + 1; return counts; }, {}),
    results,
  };
  writeFileSync('validation/ocr/results.json', JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ ...summary, results: undefined }, null, 2));
  if (results.some(r => ['transfer_failed', 'invalid_contact'].includes(r.export.status))) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (worker) await worker.terminate();
  store?.db.close();
}
