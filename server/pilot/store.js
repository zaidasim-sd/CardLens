import { DatabaseSync } from 'node:sqlite';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

export const hash = value => createHash('sha256').update(value).digest('hex');
export function passwordHash(password, salt = randomBytes(16).toString('hex')) {
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function passwordMatches(password, stored) {
  const actual = passwordHash(password, stored.split(':')[0]);
  return timingSafeEqual(Buffer.from(actual), Buffer.from(stored));
}
export class Store {
  constructor(filename, key) {
    if (!/^[a-f0-9]{64}$/i.test(key || '')) throw new Error('DATA_KEY must be 32 random bytes in hex');
    this.key = Buffer.from(key, 'hex');
    if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON;
      CREATE TABLE IF NOT EXISTS entities (tenant TEXT NOT NULL, kind TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(tenant,kind,id));
      CREATE TABLE IF NOT EXISTS audit (seq INTEGER PRIMARY KEY, tenant TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, record TEXT, at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS locks (tenant TEXT PRIMARY KEY);`);
  }
  seal(value) {
    const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
  }
  open(value) {
    const b = Buffer.from(value, 'base64'); const decipher = createDecipheriv('aes-256-gcm', this.key, b.subarray(0, 12));
    decipher.setAuthTag(b.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(b.subarray(28)), decipher.final()]).toString());
  }
  get(t, k, id) { const r = this.db.prepare('SELECT payload FROM entities WHERE tenant=? AND kind=? AND id=?').get(t, k, id); return r ? this.open(r.payload) : null; }
  all(t, k) { return this.db.prepare('SELECT payload FROM entities WHERE tenant=? AND kind=?').all(t, k).map(r => this.open(r.payload)); }
  put(t, k, id, value) { this.db.prepare('INSERT OR REPLACE INTO entities VALUES(?,?,?,?)').run(t, k, id, this.seal(value)); return value; }
  delete(t, k, id) { this.db.prepare('DELETE FROM entities WHERE tenant=? AND kind=? AND id=?').run(t, k, id); }
  audit(t, actor, action, record = null) { this.db.prepare('INSERT INTO audit(tenant,actor,action,record,at) VALUES(?,?,?,?,?)').run(t, actor, action, record, new Date().toISOString()); }
  transaction(fn) { this.db.exec('BEGIN IMMEDIATE'); try { const out = fn(); this.db.exec('COMMIT'); return out; } catch (e) { this.db.exec('ROLLBACK'); throw e; } }
}
