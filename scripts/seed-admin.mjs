import "dotenv/config";
import { getDb, ensureDatabaseIndexes } from "../server/db.js";
import { seedAdministrator } from "../server/auth/service.js";

const required = ["SEED_ADMIN_EMAIL", "SEED_ADMIN_PASSWORD", "SEED_ADMIN_NAME", "SEED_TENANT_ID"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(", ")}`);

const db = await getDb();
await ensureDatabaseIndexes(db);
const user = await seedAdministrator(db, {
  email: process.env.SEED_ADMIN_EMAIL,
  password: process.env.SEED_ADMIN_PASSWORD,
  name: process.env.SEED_ADMIN_NAME,
  tenantId: process.env.SEED_TENANT_ID,
});
console.log(`Administrator created with record reference ${user.id}.`);
process.exit(0);
