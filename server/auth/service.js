import { createHash, randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { hashPassword, validatePassword, verifyPassword } from "./password.js";
import { requireAction, ROLES } from "./permissions.js";
import { writeAudit } from "../audit/service.js";
import { requirePilotRole } from "../pilot.js";
import { sendOtpEmail, sendApprovalRequestEmail, sendAccountApprovedEmail } from "../notifications/emailService.js";

const SESSION_ABSOLUTE_MS = 8 * 60 * 60 * 1000;
const SESSION_IDLE_MS = 30 * 60 * 1000;
const LOCK_WINDOW_MS = 15 * 60 * 1000;
const SUPPORT_LIFETIME_MS = 24 * 60 * 60 * 1000;
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

export async function signIn(db, { tenantId, email, password, ip, sessionToken, csrfToken, now = new Date() }) {
  const anonymous = await db.collection("sessions").findOne({ tokenHash: digest(sessionToken || ""), anonymous: true });
  if (!anonymous || anonymous.absoluteExpiresAt <= now || anonymous.csrfHash !== digest(csrfToken || "")) {
    throw authError("CSRF_INVALID", 403, "The request could not be verified.");
  }
  const emailLower = String(email || "").trim().toLowerCase();
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
  const valid = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!valid) {
    await db.collection("loginAttempts").insertOne({ tenantId: effectiveTenantId, emailLower, createdAt: now, outcome: "failed" });
    if (user) {
      const count = await db.collection("loginAttempts").countDocuments({ tenantId: effectiveTenantId, emailLower, createdAt: { $gte: new Date(now.getTime() - LOCK_WINDOW_MS) } });
      if (count >= 5) await db.collection("users").updateOne({ _id: user._id }, { $set: { lockedUntil: new Date(now.getTime() + LOCK_WINDOW_MS) } });
    }
    await writeAudit(db, { tenantId: effectiveTenantId, actor: user, action: "failed_sign_in", outcome: "failed", now });
    throw authError("INVALID_CREDENTIALS", 401, "Email or password is incorrect.");
  }
  if (user?.status === "pending_verification") {
    throw authError("PENDING_VERIFICATION", 403, "Please verify your email address before signing in.");
  }
  if (user?.status === "pending_approval") {
    throw authError("PENDING_APPROVAL", 403, "Your account has been verified and is waiting for approval by Aventure Aviation.");
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
  if (!user || (user.expiresAt && user.expiresAt <= now)) {
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

export async function createUser(db, actor, input, now = new Date()) {
  requireAction(actor, "manage_users");
  if (!ROLES.includes(input.role)) throw authError("ROLE_INVALID", 400, "Choose a valid role.");
  requirePilotRole(input.role);
  validatePassword(input.password);
  const email = String(input.email || "").trim();
  if (!email || !email.includes("@")) throw authError("EMAIL_INVALID", 400, "Enter a valid email address.");
  const user = {
    tenantId: actor.tenantId,
    email,
    emailLower: email.toLowerCase(),
    name: String(input.name || "").trim(),
    role: input.role,
    passwordHash: await hashPassword(input.password),
    createdAt: now,
    createdBy: new ObjectId(actor.id),
  };
  if (input.role === "vision71_support") user.expiresAt = new Date(now.getTime() + SUPPORT_LIFETIME_MS);
  const result = await db.collection("users").insertOne(user);
  await writeAudit(db, { tenantId: actor.tenantId, actor, action: "user_created", recordRef: result.insertedId, outcome: "success", now });
  return publicUser({ ...user, _id: result.insertedId });
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

export async function seedAdministrator(db, input, now = new Date()) {
  validatePassword(input.password);
  const email = String(input.email || "").trim();
  const existing = await db.collection("users").findOne({ tenantId: input.tenantId, emailLower: email.toLowerCase(), removedAt: { $exists: false } });
  if (existing) throw authError("ADMIN_EXISTS", 409, "The administrator account already exists.");
  const user = { tenantId: input.tenantId, email, emailLower: email.toLowerCase(), name: input.name, role: "vision71_administrator", passwordHash: await hashPassword(input.password), createdAt: now, seeded: true };
  const result = await db.collection("users").insertOne(user);
  await writeAudit(db, { tenantId: input.tenantId, actor: { id: result.insertedId, role: user.role }, action: "user_created", recordRef: result.insertedId, outcome: "success", now });
  return publicUser({ ...user, _id: result.insertedId });
}

export function isAllowedAventureEmail(email) {
  const emailLower = String(email || "").trim().toLowerCase();
  if (emailLower.endsWith("@aventureaviation.com")) return true;
  if (process.env.APP_ENV === "development" || process.env.NODE_ENV === "test") {
    if (emailLower.endsWith("@vision71tech.com") || emailLower.endsWith("@example.test")) return true;
  }
  return false;
}

export async function registerUser(db, { tenantId, email, password, name, now = new Date() }) {
  const emailLower = String(email || "").trim().toLowerCase();
  if (!emailLower || !emailLower.includes("@")) throw authError("EMAIL_INVALID", 400, "Enter a valid email address.");
  if (!isAllowedAventureEmail(emailLower)) {
    throw authError("DOMAIN_RESTRICTED", 400, "Please use your Aventure Aviation work email.");
  }
  validatePassword(password);
  const fullName = String(name || "").trim() || emailLower.split("@")[0];

  const existing = await db.collection("users").findOne({ emailLower, removedAt: { $exists: false } });
  if (existing) {
    if (existing.status === "active" || !existing.status) {
      throw authError("ACCOUNT_EXISTS", 409, "An account with this email already exists. Please sign in.");
    }
    if (existing.status === "pending_approval") {
      throw authError("PENDING_APPROVAL", 403, "Your account has been verified and is waiting for approval.");
    }
  }

  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const passwordHash = await hashPassword(password);
  const effectiveTenantId = tenantId || existing?.tenantId || "vision71-internal";

  const userDoc = {
    tenantId: effectiveTenantId,
    email: emailLower,
    emailLower,
    name: fullName,
    role: "exhibition_assistant",
    passwordHash,
    status: "pending_verification",
    otp: {
      code: otpCode,
      expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
      attempts: 0,
    },
    updatedAt: now,
  };

  if (existing) {
    await db.collection("users").updateOne({ _id: existing._id }, { $set: userDoc });
  } else {
    userDoc.createdAt = now;
    await db.collection("users").insertOne(userDoc);
  }

  await sendOtpEmail({ toEmail: emailLower, otpCode, name: fullName });
  return {
    ok: true,
    email: emailLower,
    status: "pending_verification",
    devOtp: process.env.NODE_ENV !== "production" ? otpCode : undefined,
  };
}

export async function verifyUserOtp(db, { email, otp, now = new Date() }) {
  const emailLower = String(email || "").trim().toLowerCase();
  const user = await db.collection("users").findOne({ emailLower, removedAt: { $exists: false } });
  if (!user) throw authError("USER_NOT_FOUND", 404, "Account not found.");

  if (user.status === "active") return { ok: true, status: "active" };
  if (user.status === "pending_approval") return { ok: true, status: "pending_approval" };

  if (!user.otp || !user.otp.code) {
    throw authError("OTP_NOT_FOUND", 400, "No active verification code found. Please request a new one.");
  }

  if (user.otp.expiresAt && user.otp.expiresAt < now) {
    throw authError("OTP_EXPIRED", 400, "The verification code has expired. Please request a new code.");
  }

  if (String(user.otp.code).trim() !== String(otp || "").trim()) {
    await db.collection("users").updateOne({ _id: user._id }, { $inc: { "otp.attempts": 1 } });
    throw authError("OTP_INVALID", 400, "Invalid verification code. Please check your email or console and try again.");
  }

  const approvalToken = token();
  await db.collection("users").updateOne(
    { _id: user._id },
    {
      $set: {
        status: "pending_approval",
        approvalToken,
        emailVerifiedAt: now,
        updatedAt: now,
      },
      $unset: { otp: "" },
    }
  );

  const approverEmails = [
    process.env.HALA_APPROVAL_EMAIL || "hala@aventureaviation.com",
    process.env.OSMAN_APPROVAL_EMAIL || "osman@aventureaviation.com",
  ];
  const baseUrl = process.env.APP_BASE_URL || "https://lead71.com";
  const approvalUrl = `${baseUrl}/approve-user?token=${approvalToken}&email=${encodeURIComponent(user.email)}`;

  for (const adminEmail of approverEmails) {
    await sendApprovalRequestEmail({
      adminEmail,
      userName: user.name,
      userEmail: user.email,
      approvalUrl,
    });
  }

  return { ok: true, status: "pending_approval", email: user.email };
}

export async function resendUserOtp(db, { email, now = new Date() }) {
  const emailLower = String(email || "").trim().toLowerCase();
  const user = await db.collection("users").findOne({ emailLower, removedAt: { $exists: false } });
  if (!user) throw authError("USER_NOT_FOUND", 404, "Account not found.");

  if (user.status === "active") throw authError("ALREADY_ACTIVE", 400, "This account is already verified and approved.");
  if (user.status === "pending_approval") throw authError("PENDING_APPROVAL", 400, "Your email is verified. Your account is waiting for approval.");

  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  await db.collection("users").updateOne(
    { _id: user._id },
    {
      $set: {
        otp: {
          code: otpCode,
          expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
          attempts: 0,
        },
        updatedAt: now,
      },
    }
  );

  await sendOtpEmail({ toEmail: user.email, otpCode, name: user.name });
  return {
    ok: true,
    email: user.email,
    devOtp: process.env.NODE_ENV !== "production" ? otpCode : undefined,
  };
}

export async function authenticateGoogleUser(db, { email, name, tenantId, sessionToken, csrfToken, now = new Date() }) {
  const anonymous = await db.collection("sessions").findOne({ tokenHash: digest(sessionToken || ""), anonymous: true });
  if (!anonymous || anonymous.absoluteExpiresAt <= now || anonymous.csrfHash !== digest(csrfToken || "")) {
    throw authError("CSRF_INVALID", 403, "The request could not be verified.");
  }

  const emailLower = String(email || "").trim().toLowerCase();
  if (!isAllowedAventureEmail(emailLower)) {
    throw authError("DOMAIN_RESTRICTED", 403, "Please sign in with your Aventure Aviation work account (@aventureaviation.com).");
  }

  const effectiveTenantId = tenantId || "vision71-internal";
  let user = await db.collection("users").findOne({ emailLower, removedAt: { $exists: false } });

  if (!user) {
    const approvalToken = token();
    const newUser = {
      tenantId: effectiveTenantId,
      email: emailLower,
      emailLower,
      name: String(name || "").trim() || emailLower.split("@")[0],
      role: "exhibition_assistant",
      authProvider: "google",
      status: "pending_approval",
      approvalToken,
      emailVerifiedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    const res = await db.collection("users").insertOne(newUser);
    user = { ...newUser, _id: res.insertedId };

    const approverEmails = [
      process.env.HALA_APPROVAL_EMAIL || "hala@aventureaviation.com",
      process.env.OSMAN_APPROVAL_EMAIL || "osman@aventureaviation.com",
    ];
    const baseUrl = process.env.APP_BASE_URL || "https://lead71.com";
    const approvalUrl = `${baseUrl}/approve-user?token=${approvalToken}&email=${encodeURIComponent(user.email)}`;
    for (const adminEmail of approverEmails) {
      await sendApprovalRequestEmail({
        adminEmail,
        userName: user.name,
        userEmail: user.email,
        approvalUrl,
      });
    }

    return { ok: true, status: "pending_approval", message: "Account created and awaiting approval." };
  }

  if (user.role !== "exhibition_assistant") {
    throw authError("GOOGLE_ROLE_FORBIDDEN", 403, "Admin and Reviewer accounts must sign in using email and password.");
  }

  if (user.status === "pending_verification") {
    const approvalToken = token();
    await db.collection("users").updateOne(
      { _id: user._id },
      { $set: { status: "pending_approval", approvalToken, emailVerifiedAt: now, updatedAt: now }, $unset: { otp: "" } }
    );
    return { ok: true, status: "pending_approval" };
  }

  if (user.status === "pending_approval") {
    return { ok: true, status: "pending_approval" };
  }

  if (user.status === "rejected") {
    throw authError("ACCOUNT_REJECTED", 403, "Your account registration was not approved.");
  }

  const newSessionToken = token();
  const newCsrfToken = token();
  await db.collection("sessions").updateOne(
    { _id: anonymous._id },
    {
      $set: {
        tokenHash: digest(newSessionToken),
        csrfHash: digest(newCsrfToken),
        userId: user._id,
        tenantId: user.tenantId,
        createdAt: now,
        lastSeenAt: now,
        absoluteExpiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_MS),
        anonymous: false,
      },
    }
  );

  await db.collection("users").updateOne({ _id: user._id }, { $set: { lastSignedInAt: now } });
  await writeAudit(db, { tenantId: user.tenantId, actor: user, action: "sign_in_google", outcome: "success", now });

  return {
    ok: true,
    status: "active",
    sessionToken: newSessionToken,
    csrfToken: newCsrfToken,
    user: publicUser(user),
  };
}

export async function approveUserByToken(db, { email, token: approvalToken, decision = "approve", now = new Date() }) {
  const emailLower = String(email || "").trim().toLowerCase();
  const user = await db.collection("users").findOne({
    emailLower,
    approvalToken: String(approvalToken || "").trim(),
    removedAt: { $exists: false },
  });

  if (!user) throw authError("INVALID_APPROVAL_TOKEN", 400, "The approval link is invalid or has already been used.");

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
  if (!ObjectId.isValid(userId)) throw authError("USER_NOT_FOUND", 404, "User not found.");
  const id = new ObjectId(userId);
  const user = await db.collection("users").findOne({ _id: id, tenantId: actor.tenantId, removedAt: { $exists: false } });
  if (!user) throw authError("USER_NOT_FOUND", 404, "User not found.");

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
