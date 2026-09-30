import "dotenv/config";
import { getDb, ensureDatabaseIndexes } from "../server/db.js";
import { hashPassword, validatePassword } from "../server/auth/password.js";
import { writeAudit } from "../server/audit/service.js";

const tenantId = process.env.INTERNAL_TEST_TENANT_ID;
const accounts = [
  { key: "ALI", name: "Muhammad Ali Zakaria", role: "aventure_administrator" },
  { key: "ZAID", name: "Zaid", role: "exhibition_assistant" },
  { key: "IBRAHIM", name: "Ibrahim", role: "exhibition_assistant" },
  { key: "HAROON", name: "Haroon", role: "aventure_reviewer" },
  { key: "HASSAN", name: "Hassan", role: "vision71_support" },
];
const required = ["INTERNAL_TEST_TENANT_ID", ...accounts.flatMap((account) => [`INTERNAL_${account.key}_EMAIL`, `INTERNAL_${account.key}_PASSWORD`])];
const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(", ")}`);

const db = await getDb();
await ensureDatabaseIndexes(db);
const now = new Date();
for (const account of accounts) {
  const email = process.env[`INTERNAL_${account.key}_EMAIL`].trim();
  const password = process.env[`INTERNAL_${account.key}_PASSWORD`];
  validatePassword(password);
  const user = {
    tenantId,
    email,
    emailLower: email.toLowerCase(),
    name: account.name,
    role: account.role,
    passwordHash: await hashPassword(password),
    createdAt: now,
    internalTestAccount: true,
  };
  if (account.role === "vision71_support") user.expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const result = await db.collection("users").findOneAndUpdate(
    { tenantId, emailLower: user.emailLower },
    { $set: user, $unset: { removedAt: "", removedBy: "", lockedUntil: "" } },
    { upsert: true, returnDocument: "after" },
  );
  await writeAudit(db, { tenantId, actor: { id: result._id, role: account.role }, action: "user_created", recordRef: result._id, outcome: "success", now });
}
console.log(`Created or refreshed ${accounts.length} internal test account records.`);
process.exit(0);
