import { createHash, randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { firebaseIdentity } from "./firebaseIdentity.js";
import { requireAction } from "./permissions.js";
import { writeAudit } from "../audit/service.js";
import { requirePilotRole, pilot } from "../pilot.js";
import { sendApprovalRequestEmail, sendAccountApprovedEmail } from "../notifications/emailService.js";

const SESSION_ABSOLUTE_MS = 8 * 60 * 60 * 1000;
const SESSION_IDLE_MS = 30 * 60 * 1000;
const LOCK_WINDOW_MS = 15 * 60 * 1000;
const SIGN_IN_IP_LIMIT = 20;

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function token() {
  return randomBytes(32).toString("base64url");
}

function authError(code, status, message) {
  return Object.assign(new Error(message), { code, status });
}

function publicUser(user) {
  return {
    id: String(user._id),
    tenantId: user.tenantId,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status || "active",
    expiresAt: user.expiresAt || null,
  };
}

export async function createPreauthSession(db, now = new Date()) {
  const sessionToken = token();
  const csrfToken = token();
  await db.collection("sessions").insertOne({
    tokenHash: digest(sessionToken),
    csrfHash: digest(csrfToken),
    createdAt: now,
    lastSeenAt: now,
    absoluteExpiresAt: new Date(now.getTime() + 10 * 60 * 1000),
    anonymous: true,
  });
  return { sessionToken, csrfToken };
}

async function consumeIpRateLimit(db, ip, now) {
  const key = `signin:${digest(ip || "unknown")}`;
  const start = new Date(now.getTime() - LOCK_WINDOW_MS);
  const result = await db.collection("rateLimits").findOneAndUpdate(
    { key, windowStartedAt: { $gte: start } },
    { $inc: { count: 1 }, $set: { expiresAt: new Date(now.getTime() + LOCK_WINDOW_MS) } },
    { returnDocument: "after" },
  );
  if (result) {
    if (result.count > SIGN_IN_IP_LIMIT) throw authError("RATE_LIMITED", 429, "Too many sign in attempts. Try again later.");
    return;
  }
  await db.collection("rateLimits").updateOne(
    { key },
    { $set: { key, count: 1, windowStartedAt: now, expiresAt: new Date(now.getTime() + LOCK_WINDOW_MS) } },
    { upsert: true },
  );
}

export async function signIn(db, { tenantId, idToken, ip, sessionToken, csrfToken, now = new Date() }) {
  const anonymous = await db.collection("sessions").findOne({ tokenHash: digest(sessionToken || ""), anonymous: true });
  if (!anonymous || anonymous.absoluteExpiresAt <= now || anonymous.csrfHash !== digest(csrfToken || "")) {
    throw authError("CSRF_INVALID", 403, "The request could not be verified.");
  }
  const identity = await firebaseIdentity(idToken);
  const emailLower = identity.email;
  const userQuery = { emailLower, removedAt: { $exists: false } };
  if (tenantId) userQuery.tenantId = tenantId;
  const user = await db.collection("users").findOne(userQuery);
  const effectiveTenantId = user?.tenantId || tenantId || "vision71-internal";

  try {
    await consumeIpRateLimit(db, ip, now);
  } catch (error) {
    await writeAudit(db, { tenantId: effectiveTenantId, action: "failed_sign_in", outcome: "refused", now });
    throw error;
  }
  if (user?.lockedUntil && user.lockedUntil > now) {
    await writeAudit(db, { tenantId: effectiveTenantId, actor: user, action: "failed_sign_in", outcome: "refused", now });
    throw authError("ACCOUNT_LOCKED", 423, "This account is temporarily locked.");
  }
  if (user?.expiresAt && user.expiresAt <= now) {
    await writeAudit(db, { tenantId: effectiveTenantId, actor: user, action: "failed_sign_in", outcome: "refused", now });
    throw authError("ACCOUNT_EXPIRED", 403, "This account has expired.");
  }
  let valid = Boolean(user && user.firebaseUid === identity.uid);
  if (!valid) {
    if (user && !user.firebaseUid) {
      await db.collection("users").updateOne(
        { _id: user._id },
        {
          $set: {
            firebaseUid: identity.uid,
            emailVerifiedAt: user.emailVerifiedAt || now,
            updatedAt: now,
          },
          $unset: { otp: "" },
        }
      );
      user.firebaseUid = identity.uid;
      valid = true;
    } else {
      await db.collection("loginAttempts").insertOne({ tenantId: effectiveTenantId, emailLower, createdAt: now, outcome: "failed" });
      if (user) {
        const count = await db.collection("loginAttempts").countDocuments({ tenantId: effectiveTenantId, emailLower, createdAt: { $gte: new Date(now.getTime() - LOCK_WINDOW_MS) } });
        if (count >= 5) await db.collection("users").updateOne({ _id: user._id }, { $set: { lockedUntil: new Date(now.getTime() + LOCK_WINDOW_MS) } });
      }
      await writeAudit(db, { tenantId: effectiveTenantId, actor: user, action: "failed_sign_in", outcome: "failed", now });
      throw authError("INVALID_CREDENTIALS", 401, "Email or password is incorrect.");
    }
  }
  if (user?.status === "pending_verification") {
    throw authError("PENDING_VERIFICATION", 403, "Please verify your email address before signing in.");
  }
  if (user?.status === "pending_approval") {
    throw authError("PENDING_APPROVAL", 403, "Your email is verified, but your account is waiting for approval by an administrator.");
  }
  if (user?.status === "rejected") {
    throw authError("ACCOUNT_REJECTED", 403, "Your account registration was not approved.");
  }
  const newSessionToken = token();
  requirePilotRole(user.role); // PILOT: reviewer accounts preserved, sign-in paused.
  const newCsrfToken = token();
  await db.collection("sessions").updateOne({ _id: anonymous._id }, { $set: {
    tokenHash: digest(newSessionToken), csrfHash: digest(newCsrfToken), userId: user._id,
    tenantId: user.tenantId, createdAt: now, lastSeenAt: now,
    absoluteExpiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_MS), anonymous: false,
  } });
  await db.collection("loginAttempts").deleteMany({ tenantId: user.tenantId, emailLower });
  await db.collection("users").updateOne({ _id: user._id }, { $unset: { lockedUntil: "" }, $set: { lastSignedInAt: now } });
  await writeAudit(db, { tenantId: user.tenantId, actor: user, action: "sign_in", outcome: "success", now });
  return { sessionToken: newSessionToken, csrfToken: newCsrfToken, user: publicUser(user) };
}

export async function authenticate(db, sessionToken, now = new Date(), touch = true) {
  const session = await db.collection("sessions").findOne({ tokenHash: digest(sessionToken || ""), anonymous: false });
  if (!session || session.absoluteExpiresAt <= now || session.lastSeenAt <= new Date(now.getTime() - SESSION_IDLE_MS)) {
    if (session) await db.collection("sessions").deleteOne({ _id: session._id });
    throw authError("UNAUTHENTICATED", 401, "Please sign in.");
  }
  const user = await db.collection("users").findOne({ _id: session.userId, tenantId: session.tenantId, removedAt: { $exists: false } });
  if (!user || !user.firebaseUid || user.status !== "active" || (user.expiresAt && user.expiresAt <= now)) {
    await db.collection("sessions").deleteOne({ _id: session._id });
    throw authError("UNAUTHENTICATED", 401, "Please sign in.");
  }
  if (touch) await db.collection("sessions").updateOne({ _id: session._id }, { $set: { lastSeenAt: now } });
  requirePilotRole(user.role); // Also blocks reviewer sessions created before this deployment.
  return { session, user: publicUser(user) };
}

export function verifyCsrf(session, csrfToken) {
  if (!csrfToken || session.csrfHash !== digest(csrfToken)) throw authError("CSRF_INVALID", 403, "The request could not be verified.");
}

export async function rotateCsrf(db, session) {
  const csrfToken = token();
  await db.collection("sessions").updateOne({ _id: session._id }, { $set: { csrfHash: digest(csrfToken) } });
  return csrfToken;
}

export async function signOut(db, sessionToken, csrfToken) {
  try {
    const { session, user } = await authenticate(db, sessionToken);
    verifyCsrf(session, csrfToken);
    await db.collection("sessions").deleteOne({ _id: session._id });
    await writeAudit(db, { tenantId: user.tenantId, actor: user, action: "sign_out", outcome: "success" });
  } catch (error) {
    if (error.code === "UNAUTHENTICATED") return;
    throw error;
  }
}

export async function createUser() {
  throw authError("FIREBASE_PROVISIONING_REQUIRED", 409, "Create the account in Firebase and link its verified UID before assigning access. MongoDB password provisioning is disabled.");
}

export async function removeUser(db, actor, id, now = new Date()) {
  requireAction(actor, "manage_users");
  if (!ObjectId.isValid(id)) throw authError("USER_NOT_FOUND", 404, "Account not found.");
  const userId = new ObjectId(id);
  if (String(actor.id) === String(userId)) {
    throw authError("CANNOT_DELETE_SELF", 400, "You cannot delete your own account.");
  }
  const result = await db.collection("users").updateOne(
    { _id: userId, tenantId: actor.tenantId, removedAt: { $exists: false } },
    { $set: { removedAt: now, removedBy: new ObjectId(actor.id) } },
  );
  if (!result.matchedCount) throw authError("USER_NOT_FOUND", 404, "Account not found.");
  await db.collection("sessions").deleteMany({ userId, tenantId: actor.tenantId });
  await writeAudit(db, { tenantId: actor.tenantId, actor, action: "user_removed", recordRef: userId, outcome: "success", now });
}

export async function listUsers(db, actor) {
  requireAction(actor, "manage_users");
  const users = await db.collection("users").find({ tenantId: actor.tenantId, removedAt: { $exists: false } }, { projection: { passwordHash: 0, emailLower: 0 } }).sort({ name: 1 }).toArray();
  return users.map(publicUser);
}

export async function seedAdministrator() {
  throw authError("FIREBASE_PROVISIONING_REQUIRED", 409, "Create the account in Firebase and link its verified UID before assigning access. MongoDB password provisioning is disabled.");
}

export function isVision71EmailAllowed() {
  const envVal =
    process.env.ALLOW_VISION71_EMAILS ??
    process.env.VITE_ALLOW_VISION71_EMAILS ??
    process.env.ALLOW_VISION71_EMAIL;

  if (envVal !== undefined && envVal !== "") {
    const norm = String(envVal).trim().toLowerCase();
    return norm === "true" || norm === "1" || norm === "yes";
  }

  if (typeof pilot?.allowVision71Emails === "boolean") {
    return pilot.allowVision71Emails;
  }

  return process.env.APP_ENV === "development" || process.env.NODE_ENV === "test";
}

export function isAllowedEmail(email) {
  const emailLower = String(email || "").trim().toLowerCase();
  if (emailLower.endsWith("@aventureaviation.com")) return true;
  if (isVision71EmailAllowed()) {
    if (emailLower.endsWith("@vision71tech.com") || emailLower.endsWith("@example.test")) return true;
  }
  return false;
}

export const isAllowedAventureEmail = isAllowedEmail;

export async function registerUser(db, { idToken, now = new Date() }, { notify = sendApprovalRequestEmail } = {}) {
  const identity = await firebaseIdentity(idToken);
  let user = await db.collection("users").findOne({ emailLower: identity.email, removedAt: { $exists: false } });

  // If user already exists, auto-link unlinked/legacy accounts
  if (user) {
    if (!user.firebaseUid) {
      await db.collection("users").updateOne(
        { _id: user._id },
        {
          $set: {
            firebaseUid: identity.uid,
            emailVerifiedAt: user.emailVerifiedAt || now,
            updatedAt: now,
          },
          $unset: { otp: "" },
        }
      );
      user.firebaseUid = identity.uid;
    } else if (user.firebaseUid !== identity.uid) {
      throw authError("FIREBASE_MIGRATION_REQUIRED", 409, "This existing account must be linked to Firebase by the administrator.");
    }
    return { ok: true, email: user.email, status: user.status };
  }

  if (!isAllowedAventureEmail(identity.email)) {
    const domainMsg = isVision71EmailAllowed()
      ? "Please use an authorized work email (@aventureaviation.com or @vision71tech.com)."
      : "Please use your Aventure Aviation work email.";
    throw authError("DOMAIN_RESTRICTED", 403, domainMsg);
  }

  const initialStatus = "pending_approval";
  const approvalToken = token();
  const doc = {
    tenantId: process.env.AVENTURE_TENANT_ID || "vision71-internal",
    firebaseUid: identity.uid,
    email: identity.email,
    emailLower: identity.email,
    name: identity.name || identity.email.split("@")[0],
    role: "exhibition_assistant",
    status: initialStatus,
    approvalToken,
    emailVerifiedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await db.collection("users").insertOne(doc);
  } catch (error) {
    if (error.code !== 11000) throw error;
    user = await db.collection("users").findOne({ firebaseUid: identity.uid, emailLower: identity.email });
    if (!user) throw authError("ACCOUNT_EXISTS", 409, "This account already exists.");
    return { ok: true, email: user.email, status: user.status };
  }

  const approvalUrl = (process.env.APP_BASE_URL || "https://lead71.com") + "/approve-user?token=" + approvalToken + "&email=" + encodeURIComponent(doc.email);
  const approvers = [
    process.env.HALA_APPROVAL_EMAIL || "hmirza.sd@vision71tech.com",
    process.env.OSMAN_APPROVAL_EMAIL || "iamalik2005@gmail.com",
  ];
  for (const adminEmail of approvers) {
    if (adminEmail && adminEmail.trim()) {
      await notify({ adminEmail: adminEmail.trim(), userName: doc.name, userEmail: doc.email, approvalUrl });
    }
  }

  return { ok: true, email: doc.email, status: initialStatus };
}

export async function verifyUserOtp(db, input) { return registerUser(db, input); }

export async function resendUserOtp() { throw authError("FIREBASE_VERIFICATION_REQUIRED", 400, "Request a verification link through Firebase."); }

export async function authenticateGoogleUser(db, input) {
  const result = await registerUser(db, input);
  if (result.status !== "active") return result;
  const signedIn = await signIn(db, input);
  return { ok: true, status: "active", ...signedIn };
}

export async function approveUserByToken(db, { email, token: approvalToken, decision = "approve", now = new Date() }) {
  const emailLower = String(email || "").trim().toLowerCase();
  const user = await db.collection("users").findOne({
    emailLower,
    approvalToken: String(approvalToken || "").trim(),
    removedAt: { $exists: false },
  });

  if (!user || !user.firebaseUid || !user.emailVerifiedAt || user.status !== "pending_approval") throw authError("INVALID_APPROVAL_TOKEN", 400, "The approval link is invalid or has already been used.");

  if (decision === "reject") {
    await db.collection("users").updateOne(
      { _id: user._id },
      {
        $set: { status: "rejected", rejectedAt: now, updatedAt: now },
        $unset: { approvalToken: "" },
      }
    );
    return { ok: true, status: "rejected", message: `Account request for ${user.name} (${user.email}) has been declined.` };
  }

  await db.collection("users").updateOne(
    { _id: user._id },
    {
      $set: { status: "active", approvedAt: now, updatedAt: now },
      $unset: { approvalToken: "" },
    }
  );

  const baseUrl = process.env.APP_BASE_URL || "https://lead71.com";
  await sendAccountApprovedEmail({
    toEmail: user.email,
    name: user.name,
    loginUrl: `${baseUrl}/sign-in`,
  });

  return { ok: true, status: "approved", message: `Account for ${user.name} (${user.email}) has been approved successfully.` };
}

export async function approveUserByAdmin(db, actor, userId, now = new Date()) {
  requireAction(actor, "manage_users");
  const approvers = [
    process.env.HALA_APPROVAL_EMAIL || "hmirza.sd@vision71tech.com",
    process.env.OSMAN_APPROVAL_EMAIL || "iamalik2005@gmail.com",
  ].map(e => e.toLowerCase());
  if (!approvers.includes(String(actor.email || "").toLowerCase())) throw authError("FORBIDDEN", 403, "Only designated approvers can approve accounts.");
  if (!ObjectId.isValid(userId)) throw authError("USER_NOT_FOUND", 404, "User not found.");
  const id = new ObjectId(userId);
  const user = await db.collection("users").findOne({ _id: id, tenantId: actor.tenantId, removedAt: { $exists: false } });
  if (!user || !user.firebaseUid || !user.emailVerifiedAt || user.status !== "pending_approval") throw authError("USER_NOT_FOUND", 404, "Verified pending account not found.");

  await db.collection("users").updateOne(
    { _id: id },
    {
      $set: { status: "active", approvedAt: now, approvedBy: new ObjectId(actor.id), updatedAt: now },
      $unset: { approvalToken: "", otp: "" },
    }
  );

  const baseUrl = process.env.APP_BASE_URL || "https://lead71.com";
  await sendAccountApprovedEmail({
    toEmail: user.email,
    name: user.name,
    loginUrl: `${baseUrl}/sign-in`,
  });

  await writeAudit(db, { tenantId: actor.tenantId, actor, action: "user_approved", recordRef: id, outcome: "success", now });
  return publicUser({ ...user, status: "active" });
}
