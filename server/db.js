import { MongoClient } from "mongodb";
import { setServers } from "node:dns";

let clientPromise;

export function getMongoClient() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required");
  if (!clientPromise) {
    // Optional app-scoped override for networks that block MongoDB SRV lookups.
    const dnsServers = process.env.MONGODB_DNS_SERVERS?.split(",").map((server) => server.trim()).filter(Boolean);
    if (dnsServers?.length) setServers(dnsServers);
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
  return privacyDatabase(client.db(process.env.MONGODB_DB || "cardsnap"));
}

export async function ensureDatabaseIndexes(db) {
  await Promise.all([
    db.collection("users").createIndex({ firebaseUid: 1 }, { unique: true, partialFilterExpression: { firebaseUid: { $type: "string" } } }),
    db.collection("users").createIndex({ tenantId: 1, emailLower: 1 }, { unique: true }),
    db.collection("sessions").createIndex({ tokenHash: 1 }, { unique: true }),
    db.collection("sessions").createIndex({ absoluteExpiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("loginAttempts").createIndex({ tenantId: 1, emailLower: 1, createdAt: 1 }),
    db.collection("loginAttempts").createIndex({ createdAt: 1 }, { expireAfterSeconds: 900 }),
    db.collection("rateLimits").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("rateLimits").createIndex({ key: 1 }, { unique: true }),
    db.collection("auditLogs").createIndex({ tenantId: 1, time: -1 }),
    db.collection("settings").createIndex({ tenantId: 1, key: 1 }, { unique: true }),
  ]);
}

// A final guard for legacy endpoints: contact collections are unavailable and
// password fields cannot be written, even by an overlooked provisioning path.
export function privacyDatabase(db) {
  const denied = new Set(["cards", "cardImages", "transfers", "lists"]);
  const writes = new Set(["insertOne", "insertMany", "updateOne", "updateMany", "replaceOne", "findOneAndUpdate", "findOneAndReplace", "bulkWrite"]);
  function check(value) {
    if (!value || typeof value !== "object" || value instanceof Date) return;
    for (const [key, item] of Object.entries(value)) {
      if (/password|rawOCRText|ocrData|verifiedData|imageBase64|encryptedImage|reviewerComment|duplicateKeys|^payload$/i.test(key)) throw Object.assign(new Error("This data must not be stored in MongoDB."), { code: "MONGO_PRIVACY_REFUSED", status: 409 });
      check(item);
    }
  }
  return new Proxy(db, { get(target, key) {
    if (key === "collection") return name => {
      if (denied.has(name)) throw Object.assign(new Error("Contact storage in MongoDB is disabled."), { code: "SHEET_ONLY", status: 410 });
      const collection = target.collection(name);
      return new Proxy(collection, { get(object, method) {
        const value = object[method];
        if (writes.has(method)) return (...args) => { args.forEach(check); return value.apply(object, args); };
        return typeof value === "function" ? value.bind(object) : value;
      } });
    };
    const value = target[key]; return typeof value === "function" ? value.bind(target) : value;
  } });
}
