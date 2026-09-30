import "dotenv/config";
import path from "node:path";
import { MongoClient } from "mongodb";
import { restoreDatabase } from "./lib/backup.js";

const input = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (!input) throw new Error("Provide the encrypted backup file path as the first argument");
if (!process.env.RESTORE_MONGODB_URI) throw new Error("RESTORE_MONGODB_URI is required");
if (!process.env.RESTORE_DB) throw new Error("RESTORE_DB is required");
const client = new MongoClient(process.env.RESTORE_MONGODB_URI);
try {
  await client.connect();
  const counts = await restoreDatabase(client.db(process.env.RESTORE_DB), input);
  console.log(`Restore completed and verified with ${Object.values(counts).reduce((sum, count) => sum + count, 0)} records.`);
} finally {
  await client.close();
}
