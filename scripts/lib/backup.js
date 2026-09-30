import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { readFile, writeFile } from "node:fs/promises";
import { EJSON } from "bson";
import { ensureDatabaseIndexes } from "../../server/db.js";

const COLLECTIONS = ["cards", "users", "lists", "settings"];
const MAGIC = "CARDSNAP_BACKUP_V1";

function backupKey() {
  const value = process.env.BACKUP_KEY;
  if (!value) throw new Error("BACKUP_KEY is required");
  const key = /^[0-9a-f]{64}$/i.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("BACKUP_KEY must decode to exactly 32 bytes");
  return key;
}

export async function backupDatabase(db, outputPath, now = new Date()) {
  const collections = {};
  for (const name of COLLECTIONS) {
    const projection = name === "users" ? { passwordHash: 0 } : undefined;
    collections[name] = await db.collection(name).find({}, projection ? { projection } : {}).toArray();
  }
  const payload = { format: 1, createdAt: now, database: db.databaseName, collections, counts: Object.fromEntries(COLLECTIONS.map((name) => [name, collections[name].length])) };
  const compressed = gzipSync(Buffer.from(EJSON.stringify(payload), "utf8"));
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", backupKey(), iv);
  const encrypted = Buffer.concat([cipher.update(compressed), cipher.final()]);
  const envelope = { format: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: encrypted.toString("base64") };
  await writeFile(outputPath, `${MAGIC}\n${JSON.stringify(envelope)}`, { mode: 0o600 });
  return payload.counts;
}

async function readBackup(inputPath) {
  const file = await readFile(inputPath, "utf8");
  const newline = file.indexOf("\n");
  if (file.slice(0, newline) !== MAGIC) throw new Error("Backup format is not recognized");
  const envelope = JSON.parse(file.slice(newline + 1));
  const decipher = createDecipheriv("aes-256-gcm", backupKey(), Buffer.from(envelope.iv, "base64"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  const compressed = Buffer.concat([decipher.update(Buffer.from(envelope.data, "base64")), decipher.final()]);
  return EJSON.parse(gunzipSync(compressed).toString("utf8"));
}

export async function restoreDatabase(db, inputPath) {
  const existingCollections = await db.listCollections({}, { nameOnly: true }).toArray();
  for (const { name } of existingCollections) {
    if (await db.collection(name).estimatedDocumentCount() > 0) throw new Error("Restore target database is not empty");
  }
  const payload = await readBackup(inputPath);
  for (const name of COLLECTIONS) {
    const documents = payload.collections[name] || [];
    if (documents.length) await db.collection(name).insertMany(documents, { ordered: true });
  }
  await ensureDatabaseIndexes(db);
  const restoredCounts = {};
  for (const name of COLLECTIONS) restoredCounts[name] = await db.collection(name).countDocuments();
  for (const name of COLLECTIONS) if (restoredCounts[name] !== payload.counts[name]) throw new Error(`Restored ${name} count does not match the backup`);
  return restoredCounts;
}
