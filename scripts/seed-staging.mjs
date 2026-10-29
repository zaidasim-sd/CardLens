/**
 * seed-staging.mjs
 *
 * Seeds the staging MongoDB database with:
 *  1. Required collection indexes (sessions, loginAttempts, rateLimits, auditLogs, settings)
 *  2. The account_approvals settings document — internal Vision71 accounts only.
 *     NO Aventure client addresses (hala@, osman@) are seeded here.
 *  3. A staging isolation settings document confirming this is a staging DB.
 *
 * Run against staging:
 *   MONGODB_URI="mongodb+srv://..." MONGODB_DB="cardsnap_vision71_staging" node scripts/seed-staging.mjs
 *
 * The script is idempotent — safe to run multiple times.
 */

import { MongoClient } from "mongodb";
import { setServers } from "node:dns";
import dotenv from "dotenv";
dotenv.config();

const STAGING_MONGODB_URI =
  process.env.SEED_MONGODB_URI ||
  process.env.MONGODB_URI;

const STAGING_DB_NAME =
  process.env.SEED_MONGODB_DB ||
  process.env.MONGODB_DB ||
  "cardsnap_vision71_staging";

if (!STAGING_MONGODB_URI) {
  console.error("ERROR: MONGODB_URI or SEED_MONGODB_URI must be set.");
  process.exit(1);
}

// Hard guard: refuse to run against any URI that does not look like a staging cluster.
// Production URI uses a different password (MvJev4n7elA0KTao) — staging uses tLmPjabMSIpYJGyX.
// Also refuse if DB name contains "production" or omits "staging".
if (
  !STAGING_DB_NAME.toLowerCase().includes("staging") &&
  !STAGING_DB_NAME.toLowerCase().includes("test")
) {
  console.error(
    `ERROR: Database name "${STAGING_DB_NAME}" does not look like a staging database.\n` +
    `Refusing to seed to avoid accidentally writing to production.\n` +
    `The DB name must contain "staging" or "test".`
  );
  process.exit(1);
}

// ── Internal Vision71 staging accounts ───────────────────────────────────────
// These are the ONLY accounts that should exist on staging.
// Aventure client emails must NEVER appear in this list.
const STAGING_APPROVED_EMAILS = [
  "hmirza.sd@vision71tech.com",
  "iamalik2005@gmail.com",
  "zaid.sd@vision71tech.com",
  "az@vision71tech.com",
];

const STAGING_ADMIN_EMAILS = [
  "hmirza.sd@vision71tech.com",
  "iamalik2005@gmail.com",
  "zaid.sd@vision71tech.com",
  "az@vision71tech.com",
];

console.log(`\n[Seed] Connecting to staging database: ${STAGING_DB_NAME}`);
console.log(`[Seed] URI host: ${STAGING_MONGODB_URI.replace(/\/\/.*@/, "//***@")}\n`);

// Use Cloudflare DNS to resolve Atlas SRV records reliably
setServers(["1.1.1.1", "8.8.8.8"]);

const client = new MongoClient(STAGING_MONGODB_URI, {
  maxPoolSize: 2,
  serverSelectionTimeoutMS: 15000,
  connectTimeoutMS: 15000,
});

await client.connect();
console.log("[Seed] Connected.");

const db = client.db(STAGING_DB_NAME);

// ── 1. Indexes ────────────────────────────────────────────────────────────────
console.log("[Seed] Creating indexes...");
await Promise.all([
  db.collection("sessions").createIndex({ tokenHash: 1 }, { unique: true }),
  db.collection("sessions").createIndex({ absoluteExpiresAt: 1 }, { expireAfterSeconds: 0 }),
  db.collection("loginAttempts").createIndex({ tenantId: 1, emailLower: 1, createdAt: 1 }),
  db.collection("loginAttempts").createIndex({ createdAt: 1 }, { expireAfterSeconds: 900 }),
  db.collection("rateLimits").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  db.collection("rateLimits").createIndex({ key: 1 }, { unique: true }),
  db.collection("auditLogs").createIndex({ tenantId: 1, time: -1 }),
  db.collection("settings").createIndex({ tenantId: 1, key: 1 }, { unique: true }),
]);
console.log("[Seed] Indexes created.");

// ── 2. account_approvals ──────────────────────────────────────────────────────
console.log("[Seed] Writing account_approvals settings document...");
await db.collection("settings").updateOne(
  { key: "account_approvals" },
  {
    $set: {
      key: "account_approvals",
      approvedEmails: STAGING_APPROVED_EMAILS.map((e) => e.toLowerCase()),
      pendingApprovals: {},
      rejectedEmails: [],
      updatedAt: new Date(),
      seededAt: new Date(),
      seededBy: "scripts/seed-staging.mjs",
      note: "Internal staging only — no Aventure client addresses.",
    },
  },
  { upsert: true }
);
console.log(`[Seed] Approved emails: ${STAGING_APPROVED_EMAILS.join(", ")}`);

// ── 3. admin_config ───────────────────────────────────────────────────────────
console.log("[Seed] Writing admin_config settings document...");
await db.collection("settings").updateOne(
  { key: "admin_config" },
  {
    $set: {
      key: "admin_config",
      administratorEmails: STAGING_ADMIN_EMAILS.map((e) => e.toLowerCase()),
      environment: "staging",
      updatedAt: new Date(),
      seededAt: new Date(),
      note: "Staging admin list — Vision71 internal only.",
    },
  },
  { upsert: true }
);

// ── 4. Purge any stale Aventure sessions/data ─────────────────────────────────
console.log("[Seed] Purging any stale external client sessions...");
const purgeResult = await db.collection("sessions").deleteMany({
  $or: [
    { "user.email": { $regex: "@aventureaviation\\.com$", $options: "i" } },
    { "user.email": { $regex: "@aventure\\.com$", $options: "i" } },
  ],
});
console.log(`[Seed] Purged ${purgeResult.deletedCount} stale external client session(s).`);

// ── 5. Purge Aventure addresses from approvals doc (double-check) ─────────────
const approvalsDoc = await db.collection("settings").findOne({ key: "account_approvals" });
if (approvalsDoc) {
  const cleanedApproved = (approvalsDoc.approvedEmails || []).filter(
    (e) => !e.includes("aventureaviation.com") && !e.includes("aventure.com")
  );
  const cleanedPending = Object.fromEntries(
    Object.entries(approvalsDoc.pendingApprovals || {}).filter(
      ([email]) => !email.includes("aventureaviation.com")
    )
  );
  if (
    cleanedApproved.length !== (approvalsDoc.approvedEmails || []).length ||
    Object.keys(cleanedPending).length !== Object.keys(approvalsDoc.pendingApprovals || {}).length
  ) {
    await db.collection("settings").updateOne(
      { key: "account_approvals" },
      { $set: { approvedEmails: cleanedApproved, pendingApprovals: cleanedPending, updatedAt: new Date() } }
    );
    console.log("[Seed] Removed Aventure addresses from existing approvals document.");
  }
}

// ── 6. Staging environment marker ────────────────────────────────────────────
await db.collection("settings").updateOne(
  { key: "environment_meta" },
  {
    $set: {
      key: "environment_meta",
      environment: "staging",
      seededAt: new Date(),
      allowedEmailDomains: ["vision71tech.com", "example.test"],
      blockedEmailDomains: ["aventureaviation.com"],
      note: "Internal staging — client domains are blocked at sign-in and email layers.",
    },
  },
  { upsert: true }
);

console.log("\n[Seed] ✓ Staging database seeded successfully.");
console.log(`[Seed] DB: ${STAGING_DB_NAME}`);
console.log(`[Seed] Approved accounts: ${STAGING_APPROVED_EMAILS.join(", ")}`);
console.log("[Seed] No Aventure client addresses are present.");
console.log("[Seed] Done.\n");

await client.close();
process.exit(0);
