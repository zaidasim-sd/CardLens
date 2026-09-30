import "dotenv/config";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { MongoClient } from "mongodb";
import { backupDatabase } from "./lib/backup.js";

if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required");
const output = path.resolve(process.env.BACKUP_OUTPUT || `cardsnap-backup-${new Date().toISOString().slice(0, 10)}.bin`);
await mkdir(path.dirname(output), { recursive: true });
const client = new MongoClient(process.env.MONGODB_URI);
try {
  await client.connect();
  const counts = await backupDatabase(client.db(process.env.MONGODB_DB || "cardsnap"), output);
  console.log(`Encrypted backup created at ${output} with ${Object.values(counts).reduce((sum, count) => sum + count, 0)} records.`);
} finally {
  await client.close();
}
