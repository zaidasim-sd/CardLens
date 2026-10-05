// Default is a preview. Applying is an explicit company-approved migration step.
import "dotenv/config";
import { getMongoClient } from "../server/db.js";
import { firebaseIdentity } from "../server/auth/firebaseIdentity.js";

const apply = process.argv.includes("--apply");
let client;
try {
  client = await getMongoClient();
  const db = client.db(process.env.MONGODB_DB || "cardsnap");
  if (!apply) {
    const legacyAccounts = await db.collection("users").countDocuments({ passwordHash: { $exists: true } });
    console.log(JSON.stringify({ preview: true, legacyAccounts, action: "Link each existing account to its verified Firebase UID, remove password hash, invalidate sessions. No changes made." }));
  } else {
    if (!process.argv.includes("--company-approved")) throw new Error("Written company approval is required before applying this migration.");
    // Supply the user's fresh ID token through the environment, never CLI args.
    const identity = await firebaseIdentity(process.env.FIREBASE_MIGRATION_ID_TOKEN);
    const user = await db.collection("users").findOne({ emailLower: identity.email, removedAt: { $exists: false } });
    if (!user) throw new Error("Existing account not found. This tool does not create accounts or grant roles.");
    if (user.firebaseUid && user.firebaseUid !== identity.uid) throw new Error("This account is already linked to another Firebase UID.");
    const uidOwner = await db.collection("users").findOne({ firebaseUid: identity.uid, _id: { $ne: user._id } });
    if (uidOwner) throw new Error("This Firebase UID is already linked to another account.");
    const now = new Date();
    await db.collection("users").updateOne({ _id: user._id }, {
      $set: { firebaseUid: identity.uid, emailVerifiedAt: now, updatedAt: now, status: user.status || "active" },
      $unset: { passwordHash: "", password: "", otp: "" },
    });
    await db.collection("sessions").deleteMany({ userId: user._id });
    console.log(JSON.stringify({ migrated: true, remainingPasswordHashes: await db.collection("users").countDocuments({ passwordHash: { $exists: true } }) }));
  }
} catch (error) {
  console.error(error.status ? error.message : "Migration failed. Check database connectivity and the approved account mapping.");
  process.exitCode = 1;
} finally { if (client) await client.close(); }
