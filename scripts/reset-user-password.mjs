import "dotenv/config";
import { getDb } from "../server/db.js";
import { hashPassword, validatePassword } from "../server/auth/password.js";

async function main() {
  const email = process.argv[2];
  const newPassword = process.argv[3];

  if (!email || !newPassword) {
    console.log("Usage: node scripts/reset-user-password.mjs <email> <newPassword>");
    process.exit(1);
  }

  validatePassword(newPassword);
  const db = await getDb();
  const emailLower = email.trim().toLowerCase();
  
  const user = await db.collection("users").findOne({ emailLower });
  if (!user) {
    console.error(`User with email "${email}" not found.`);
    process.exit(1);
  }

  const passwordHash = await hashPassword(newPassword);
  await db.collection("users").updateOne(
    { _id: user._id },
    {
      $set: { passwordHash, updatedAt: new Date() },
      $unset: { lockedUntil: "" }
    }
  );

  await db.collection("loginAttempts").deleteMany({ emailLower });
  console.log(`Successfully reset password and unlocked account for: ${user.email}`);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
