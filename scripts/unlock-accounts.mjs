import "dotenv/config";
import { getDb } from "../server/db.js";

async function main() {
  const db = await getDb();
  
  // Find all users who are locked
  const users = await db.collection("users").find({}).toArray();
  const locked = users.filter(u => u.lockedUntil && new Date(u.lockedUntil) > new Date());
  
  console.log(`Found ${locked.length} locked accounts:`);
  for (const u of locked) {
    console.log(`- ${u.email} (locked until ${u.lockedUntil})`);
  }

  // Unlock all users
  const unlockResult = await db.collection("users").updateMany(
    {},
    { $unset: { lockedUntil: "" } }
  );
  console.log(`Unlocked accounts (updated count: ${unlockResult.modifiedCount})`);

  // Clear login attempts
  const clearAttempts = await db.collection("loginAttempts").deleteMany({});
  console.log(`Cleared ${clearAttempts.deletedCount} failed login attempt records.`);

  // Clear rate limits
  const clearRateLimits = await db.collection("rateLimits").deleteMany({});
  console.log(`Cleared ${clearRateLimits.deletedCount} IP rate limit records.`);

  process.exit(0);
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
