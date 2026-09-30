import { MongoClient } from "mongodb";

let clientPromise;

export function getMongoClient() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required");
  if (!clientPromise) {
    const client = new MongoClient(uri, { maxPoolSize: 10, minPoolSize: 0 });
    clientPromise = client.connect().catch((error) => {
      clientPromise = undefined;
      throw error;
    });
  }
  return clientPromise;
}

export async function getDb() {
  const client = await getMongoClient();
  return client.db(process.env.MONGODB_DB || "cardsnap");
}

export async function ensureDatabaseIndexes(db) {
  await Promise.all([
    db.collection("users").createIndex({ tenantId: 1, emailLower: 1 }, { unique: true }),
    db.collection("sessions").createIndex({ tokenHash: 1 }, { unique: true }),
    db.collection("sessions").createIndex({ absoluteExpiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("loginAttempts").createIndex({ tenantId: 1, emailLower: 1, createdAt: 1 }),
    db.collection("loginAttempts").createIndex({ createdAt: 1 }, { expireAfterSeconds: 900 }),
    db.collection("rateLimits").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("rateLimits").createIndex({ key: 1 }, { unique: true }),
    db.collection("cards").createIndex({ tenantId: 1, status: 1, createdAt: -1 }),
    db.collection("cards").createIndex({ tenantId: 1, capturedBy: 1, status: 1 }),
    db.collection("cards").createIndex({ tenantId: 1, "duplicateKeys.email": 1 }),
    db.collection("cards").createIndex({ tenantId: 1, "duplicateKeys.phones": 1 }),
    db.collection("cards").createIndex({ tenantId: 1, "duplicateKeys.nameCompany": 1 }),
    db.collection("cardImages").createIndex({ tenantId: 1, cardId: 1 }, { unique: true }),
    db.collection("cardImages").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 7200 }),
    db.collection("auditLogs").createIndex({ tenantId: 1, time: -1 }),
    db.collection("settings").createIndex({ tenantId: 1, key: 1 }, { unique: true }),
  ]);
}
