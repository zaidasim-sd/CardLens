import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { MongoClient, ObjectId } from "mongodb";
import { backupDatabase, restoreDatabase } from "./backup.js";
import { encryptValue } from "../../server/security/encryption.js";

const marker = `${Date.now()}_${randomBytes(3).toString("hex")}`;
const sourceName = `cs_bak_s_${marker}`;
const targetName = `cs_bak_t_${marker}`;
let client;
let source;
let target;
let directory;
let backupPath;
let backupCounts;
let restoredCounts;

before(async () => {
  assert.ok(process.env.MONGODB_URI, "MONGODB_URI is required for integration tests");
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
  process.env.BACKUP_KEY = randomBytes(32).toString("base64");
  client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  source = client.db(sourceName);
  target = client.db(targetName);
  const tenantId = "fake_backup_tenant";
  const userId = new ObjectId();
  await source.collection("cards").insertOne({ tenantId, capturedBy: userId, status: "approved", createdAt: new Date(), updatedAt: new Date(), payload: encryptValue({ verifiedData: { fullName: "Casey Example", email: "casey@example.test", phone: "+1 202 555 0111" }, rawOCRText: "Fake backup OCR" }) });
  await source.collection("users").insertOne({ _id: userId, tenantId, email: "admin@example.test", emailLower: "admin@example.test", name: "Fake Backup Admin", role: "aventure_administrator", passwordHash: "must not be backed up", createdAt: new Date() });
  await source.collection("lists").insertOne({ tenantId, key: "events", values: ["Fake Expo"] });
  await source.collection("settings").insertOne({ tenantId, key: "retentionHours", value: 24 });
  await source.collection("cardImages").insertOne({ tenantId, cardId: new ObjectId(), encryptedImage: "excluded" });
  await source.collection("sessions").insertOne({ tenantId, tokenHash: "excluded token" });
  await source.collection("loginAttempts").insertOne({ tenantId, outcome: "excluded" });
  await source.collection("rateLimits").insertOne({ tenantId, key: "excluded limit" });
  await mkdir(path.resolve(".data"), { recursive: true });
  directory = await mkdtemp(path.resolve(".data", "backup-test-"));
  backupPath = path.join(directory, "restore-test.bin");
  backupCounts = await backupDatabase(source, backupPath, new Date("2026-09-30T12:00:00.000Z"));
  restoredCounts = await restoreDatabase(target, backupPath);
});

after(async () => {
  if (!sourceName.startsWith("cs_bak_s_") || !targetName.startsWith("cs_bak_t_")) throw new Error("Unsafe test database name");
  await source.dropDatabase();
  await target.dropDatabase();
  await client.close();
  await rm(directory, { recursive: true, force: true });
});

test("restore into a separate empty database matches collection counts", () => {
  assert.deepEqual(restoredCounts, backupCounts);
  assert.deepEqual(restoredCounts, { cards: 1, users: 1, lists: 1, settings: 1 });
});

test("backup file contains no readable card or user text", async () => {
  const raw = (await readFile(backupPath)).toString("utf8");
  for (const value of ["Casey Example", "casey@example.test", "+1 202 555 0111", "Fake backup OCR", "admin@example.test", "must not be backed up"]) assert.equal(raw.includes(value), false);
});

test("backup excludes images sessions attempts limits and password hashes", async () => {
  for (const name of ["cardImages", "sessions", "loginAttempts", "rateLimits"]) assert.equal(await target.collection(name).countDocuments(), 0);
  const user = await target.collection("users").findOne({ tenantId: "fake_backup_tenant" });
  assert.equal(user.passwordHash, undefined);
});

test("restore refuses a database that is not empty", async () => {
  await assert.rejects(restoreDatabase(target, backupPath), /not empty/);
});
