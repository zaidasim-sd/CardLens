import { createHash, randomBytes } from "node:crypto";
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
    id: String(user.id || user.uid || user._id || user.email),
    uid: String(user.uid || user.id || user._id || user.email),
    tenantId: user.tenantId || "vision71-internal",
    email: user.email,
    name: user.name || user.email?.split("@")[0] || "",
    role: user.role || "exhibition_assistant",
    status: user.status || "active",
    expiresAt: user.expiresAt || null,
  };
}

export function getNotificationApprovers() {
  return [
    process.env.HALA_APPROVAL_EMAIL || "hmirza.sd@vision71tech.com",
    process.env.OSMAN_APPROVAL_EMAIL || "iamalik2005@gmail.com",
  ].map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export function getAdministratorEmails() {
  const envAdmins = [
    process.env.HALA_APPROVAL_EMAIL,
    process.env.OSMAN_APPROVAL_EMAIL,
    process.env.ADMIN_EMAILS,
    process.env.APPROVER_EMAILS,
    process.env.SEED_ADMIN_EMAIL,
  ];

  const parsedEnv = envAdmins
    .flatMap((v) => (v ? v.split(",") : []))
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const builtInAdmins = [
    "hala@aventureaviation.com",
    "osman@aventureaviation.com",
    "hmirza.sd@vision71tech.com",
    "iamalik2005@gmail.com",
    "zaid.sd@vision71tech.com",
  ];

  return [...new Set([...parsedEnv, ...builtInAdmins])];
}

export function isAdministrator(email) {
  const emailLower = String(email || "").trim().toLowerCase();
  if (!emailLower) return false;
  return getAdministratorEmails().includes(emailLower);
}

export const isDesignatedApprover = isAdministrator;
export const getDesignatedApprovers = getAdministratorEmails;

export function getAppPublicUrl() {
  const explicit = process.env.APPROVAL_BASE_URL || process.env.PUBLIC_APP_URL || process.env.APP_BASE_URL;
  if (explicit && explicit.trim()) {
    const trimmed = explicit.trim().replace(/\/+$/, "");
    if (trimmed.includes("lead71.com")) return trimmed;
  }
  return "https://lead71.com";
}

const DEFAULT_APPROVED_EMAILS = [
  "hala@aventureaviation.com",
  "osman@aventureaviation.com",
  "hmirza.sd@vision71tech.com",
  "iamalik2005@gmail.com",
  "zaid.sd@vision71tech.com",
];

async function getApprovalsDoc(db) {
  try {
    const doc = await db.collection("settings").findOne({ key: "account_approvals" });
    if (doc) {
      return {
        approvedEmails: Array.isArray(doc.approvedEmails) ? doc.approvedEmails.map((e) => e.toLowerCase()) : [...DEFAULT_APPROVED_EMAILS],
        pendingApprovals: doc.pendingApprovals || {},
        rejectedEmails: Array.isArray(doc.rejectedEmails) ? doc.rejectedEmails.map((e) => e.toLowerCase()) : [],
      };
    }
  } catch (err) {
    console.error("Error reading account_approvals setting:", err.message);
  }
  return {
    approvedEmails: [...DEFAULT_APPROVED_EMAILS],
    pendingApprovals: {},
    rejectedEmails: [],
  };
}

async function saveApprovalsDoc(db, approvals) {
  await db.collection("settings").updateOne(
    { key: "account_approvals" },
    {
      $set: {
        key: "account_approvals",
        approvedEmails: [...new Set((approvals.approvedEmails || []).map((e) => e.trim().toLowerCase()))],
        pendingApprovals: approvals.pendingApprovals || {},
        rejectedEmails: [...new Set((approvals.rejectedEmails || []).map((e) => e.trim().toLowerCase()))],
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );
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

export async function signIn(db, { tenantId, idToken, ip, sessionToken, csrfToken, now = new Date() }) {
  const anonymous = await db.collection("sessions").findOne({ tokenHash: digest(sessionToken || ""), anonymous: true });
  if (!anonymous || anonymous.absoluteExpiresAt <= now || anonymous.csrfHash !== digest(csrfToken || "")) {
    if (!idToken) {
      throw authError("CSRF_INVALID", 403, "The request could not be verified.");
    }
  }

  // Identity and credentials are authenticated strictly through Firebase
  const identity = await firebaseIdentity(idToken);
  const emailLower = identity.email;
  const effectiveTenantId = tenantId || process.env.AVENTURE_TENANT_ID || "vision71-internal";

  try {
    await consumeIpRateLimit(db, ip, now);
  } catch (error) {
    await writeAudit(db, { tenantId: effectiveTenantId, action: "failed_sign_in", outcome: "refused", now });
    throw error;
  }

  if (!isAllowedAventureEmail(emailLower)) {
    const domainMsg = isVision71EmailAllowed()
      ? "Please use an authorized work email (@aventureaviation.com or @vision71tech.com)."
      : "Please use your Aventure Aviation work email.";
    throw authError("DOMAIN_RESTRICTED", 403, domainMsg);
  }

  // Determine user role and status without storing user accounts in MongoDB
  const isAdmin = isDesignatedApprover(emailLower);
  let role = isAdmin ? "vision71_administrator" : "exhibition_assistant";
  let status = "active";

  if (!isAdmin) {
    const approvals = await getApprovalsDoc(db);
    if (approvals.rejectedEmails.includes(emailLower)) {
      await writeAudit(db, { tenantId: effectiveTenantId, action: "failed_sign_in", outcome: "rejected", now });
      throw authError("ACCOUNT_REJECTED", 403, "Your account registration was not approved.");
    }
    if (!approvals.approvedEmails.includes(emailLower)) {
      throw authError("PENDING_APPROVAL", 403, "Your email is verified, but your account is waiting for approval by an administrator.");
    }
  }

  requirePilotRole(role);

  const authenticatedUser = {
    id: identity.uid,
    uid: identity.uid,
    tenantId: effectiveTenantId,
    email: emailLower,
    name: identity.name || emailLower.split("@")[0],
    role,
    status,
    lastSignedInAt: now,
  };

  const newSessionToken = token();
  const newCsrfToken = token();

  if (anonymous) {
    await db.collection("sessions").updateOne(
      { _id: anonymous._id },
      {
        $set: {
          tokenHash: digest(newSessionToken),
          csrfHash: digest(newCsrfToken),
          userId: authenticatedUser.id,
          user: authenticatedUser,
          tenantId: effectiveTenantId,
          createdAt: now,
          lastSeenAt: now,
          absoluteExpiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_MS),
          anonymous: false,
        },
      }
    );
  } else {
    await db.collection("sessions").insertOne({
      tokenHash: digest(newSessionToken),
      csrfHash: digest(newCsrfToken),
      userId: authenticatedUser.id,
      user: authenticatedUser,
      tenantId: effectiveTenantId,
      createdAt: now,
      lastSeenAt: now,
      absoluteExpiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_MS),
      anonymous: false,
    });
  }

  await writeAudit(db, { tenantId: effectiveTenantId, actor: authenticatedUser, action: "sign_in", outcome: "success", now });
  return { sessionToken: newSessionToken, csrfToken: newCsrfToken, user: publicUser(authenticatedUser) };
}

export async function authenticate(db, sessionToken, now = new Date(), touch = true) {
  const session = await db.collection("sessions").findOne({ tokenHash: digest(sessionToken || ""), anonymous: false });
  if (!session || session.absoluteExpiresAt <= now || session.lastSeenAt <= new Date(now.getTime() - SESSION_IDLE_MS)) {
    if (session) await db.collection("sessions").deleteOne({ _id: session._id });
    throw authError("UNAUTHENTICATED", 401, "Please sign in.");
  }

  const user = session.user;
  if (!user || user.status !== "active") {
    await db.collection("sessions").deleteOne({ _id: session._id });
    throw authError("UNAUTHENTICATED", 401, "Please sign in.");
  }

  if (touch) await db.collection("sessions").updateOne({ _id: session._id }, { $set: { lastSeenAt: now } });
  requirePilotRole(user.role);
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
  throw authError("FIREBASE_PROVISIONING_REQUIRED", 409, "User accounts are created and authenticated directly through Firebase.");
}

export async function removeUser(db, actor, idOrEmail, now = new Date()) {
  requireAction(actor, "manage_users");
  const target = String(idOrEmail || "").trim().toLowerCase();
  if (!target) throw authError("USER_NOT_FOUND", 404, "Account not found.");
  if (target === String(actor.email).toLowerCase() || target === String(actor.id)) {
    throw authError("CANNOT_DELETE_SELF", 400, "You cannot delete your own account.");
  }

  const approvals = await getApprovalsDoc(db);
  approvals.approvedEmails = approvals.approvedEmails.filter((e) => e !== target);
  delete approvals.pendingApprovals[target];
  await saveApprovalsDoc(db, approvals);

  await db.collection("sessions").deleteMany({ $or: [{ userId: idOrEmail }, { "user.email": target }] });
  await writeAudit(db, { tenantId: actor.tenantId, actor, action: "user_removed", recordRef: target, outcome: "success", now });
}

export async function listUsers(db, actor) {
  requireAction(actor, "manage_users");
  const approvals = await getApprovalsDoc(db);
  const users = [];

  // Admins
  for (const adminEmail of getDesignatedApprovers()) {
    users.push({
      id: adminEmail,
      uid: adminEmail,
      email: adminEmail,
      name: adminEmail.split("@")[0],
      role: "vision71_administrator",
      status: "active",
      tenantId: actor.tenantId,
    });
  }

  // Approved Assistants
  for (const email of approvals.approvedEmails) {
    if (!users.some((u) => u.email === email)) {
      users.push({
        id: email,
        uid: email,
        email,
        name: email.split("@")[0],
        role: "exhibition_assistant",
        status: "active",
        tenantId: actor.tenantId,
      });
    }
  }

  // Pending Assistants
  for (const [email, info] of Object.entries(approvals.pendingApprovals || {})) {
    if (!users.some((u) => u.email === email)) {
      users.push({
        id: email,
        uid: email,
        email,
        name: info?.name || email.split("@")[0],
        role: "exhibition_assistant",
        status: "pending_approval",
        tenantId: actor.tenantId,
      });
    }
  }

  return users.map(publicUser);
}

export async function seedAdministrator() {
  throw authError("FIREBASE_PROVISIONING_REQUIRED", 409, "User accounts are created and authenticated directly through Firebase.");
}

export async function registerUser(db, { idToken, now = new Date() }, { notify = sendApprovalRequestEmail } = {}) {
  const identity = await firebaseIdentity(idToken);
  const emailLower = identity.email;

  if (!isAllowedAventureEmail(emailLower)) {
    const domainMsg = isVision71EmailAllowed()
      ? "Please use an authorized work email (@aventureaviation.com or @vision71tech.com)."
      : "Please use your Aventure Aviation work email.";
    throw authError("DOMAIN_RESTRICTED", 403, domainMsg);
  }

  // Administrators never need to authorize their own accounts
  if (isAdministrator(emailLower)) {
    console.log(`[AUTH] User ${emailLower} is an administrator. Auto-activated without requiring approval.`);
    return { ok: true, email: emailLower, status: "active", role: "vision71_administrator" };
  }

  const approvals = await getApprovalsDoc(db);

  // If already approved
  if (approvals.approvedEmails.includes(emailLower)) {
    return { ok: true, email: emailLower, status: "active" };
  }

  // If already rejected
  if (approvals.rejectedEmails.includes(emailLower)) {
    throw authError("ACCOUNT_REJECTED", 403, "Your account registration was not approved.");
  }

  // Non-admin needs admin approval: generate approval token
  const approvalToken = approvals.pendingApprovals[emailLower]?.token || token();
  approvals.pendingApprovals[emailLower] = {
    token: approvalToken,
    name: identity.name || emailLower.split("@")[0],
    requestedAt: now,
  };
  await saveApprovalsDoc(db, approvals);
  console.log(`[AUTH] User ${emailLower} requires admin approval. Approval token: ${approvalToken}`);

  // Send notification email to the designated administrators
  const baseUrl = getAppPublicUrl();
  const approvalUrl = `${baseUrl}/approve-user?token=${approvalToken}&email=${encodeURIComponent(emailLower)}`;
  const approvers = getNotificationApprovers();
  console.log(`[AUTH] Designated approvers to notify: ${approvers.join(", ")}`);

  for (const adminEmail of approvers) {
    if (adminEmail && adminEmail.trim()) {
      try {
        console.log(`[AUTH] Dispatching approval email to: ${adminEmail.trim()}`);
        await notify({
          adminEmail: adminEmail.trim(),
          userName: identity.name || emailLower.split("@")[0],
          userEmail: emailLower,
          approvalUrl,
        });
        console.log(`[AUTH] Approval email successfully delivered to: ${adminEmail.trim()}`);
      } catch (err) {
        console.error(`[AUTH] Error sending approval email to ${adminEmail}:`, err.message || err);
      }
    }
  }

  return { ok: true, email: emailLower, status: "pending_approval" };
}

export async function verifyUserOtp(db, input) {
  return registerUser(db, input);
}

export async function resendUserOtp() {
  throw authError("FIREBASE_VERIFICATION_REQUIRED", 400, "Request a verification link through Firebase.");
}

export async function authenticateGoogleUser(db, input) {
  const result = await registerUser(db, input);
  if (result.status !== "active") {
    return {
      ok: true,
      email: result.email,
      status: result.status,
      message: result.status === "pending_approval"
        ? "Your email is verified, but your account is waiting for approval by an administrator."
        : undefined,
    };
  }
  const signedIn = await signIn(db, input);
  return { ok: true, status: "active", email: result.email, ...signedIn };
}

export async function approveUserByToken(db, { email, token: approvalToken, decision = "approve", now = new Date() }) {
  const emailLower = String(email || "").trim().toLowerCase();
  const approvals = await getApprovalsDoc(db);
  const pending = approvals.pendingApprovals[emailLower];

  if (!pending || pending.token !== String(approvalToken || "").trim()) {
    throw authError("INVALID_APPROVAL_TOKEN", 400, "The approval link is invalid or has already been used.");
  }

  const userName = pending.name || emailLower.split("@")[0];

  if (decision === "reject") {
    delete approvals.pendingApprovals[emailLower];
    if (!approvals.rejectedEmails.includes(emailLower)) {
      approvals.rejectedEmails.push(emailLower);
    }
    await saveApprovalsDoc(db, approvals);
    return { ok: true, status: "rejected", message: `Account request for ${userName} (${emailLower}) has been declined.` };
  }

  delete approvals.pendingApprovals[emailLower];
  if (!approvals.approvedEmails.includes(emailLower)) {
    approvals.approvedEmails.push(emailLower);
  }
  await saveApprovalsDoc(db, approvals);

  const baseUrl = getAppPublicUrl();
  try {
    await sendAccountApprovedEmail({
      toEmail: emailLower,
      name: userName,
      loginUrl: `${baseUrl}/sign-in`,
    });
  } catch (err) {
    console.error(`Failed to send account approved email to ${emailLower}:`, err.message);
  }

  return { ok: true, status: "approved", message: `Account for ${userName} (${emailLower}) has been approved successfully.` };
}

export async function approveUserByAdmin(db, actor, userIdOrEmail, now = new Date()) {
  requireAction(actor, "manage_users");
  if (!isDesignatedApprover(actor.email)) {
    throw authError("FORBIDDEN", 403, "Only designated approvers can approve accounts.");
  }

  const emailLower = String(userIdOrEmail || "").trim().toLowerCase();
  const approvals = await getApprovalsDoc(db);
  const pending = approvals.pendingApprovals[emailLower];

  if (!pending && !approvals.approvedEmails.includes(emailLower)) {
    throw authError("USER_NOT_FOUND", 404, "Pending account not found.");
  }

  const userName = pending?.name || emailLower.split("@")[0];
  delete approvals.pendingApprovals[emailLower];
  if (!approvals.approvedEmails.includes(emailLower)) {
    approvals.approvedEmails.push(emailLower);
  }
  await saveApprovalsDoc(db, approvals);

  const adminBaseUrl = getAppPublicUrl();
  try {
    await sendAccountApprovedEmail({
      toEmail: emailLower,
      name: userName,
      loginUrl: `${adminBaseUrl}/sign-in`,
    });
  } catch (err) {
    console.error(`Failed to send account approved email to ${emailLower}:`, err.message);
  }

  await writeAudit(db, { tenantId: actor.tenantId, actor, action: "user_approved", recordRef: emailLower, outcome: "success", now });
  return publicUser({ email: emailLower, name: userName, role: "exhibition_assistant", status: "active", tenantId: actor.tenantId });
}
