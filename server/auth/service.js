import { readFirebaseDirectory, directoryEmailVisible } from './firebaseDirectory.js';
import { provisionFirebaseUser } from './firebaseProvisioning.js';
import { createHash, randomBytes } from "node:crypto";
import { firebaseIdentity } from "./firebaseIdentity.js";
import { requireAction } from "./permissions.js";
import { writeAudit } from "../audit/service.js";
import { requirePilotRole, pilot } from "../pilot.js";
import {
  sendApprovalRequestEmail,
  sendAccountApprovedEmail,
  sendAccountRejectedEmail,
  sendPendingApprovalEmail,
} from "../notifications/emailService.js";

const SESSION_ABSOLUTE_MS = 8 * 60 * 60 * 1000;
const SESSION_IDLE_MS = 30 * 60 * 1000;
const LOCK_WINDOW_MS = 15 * 60 * 1000;
const SIGN_IN_IP_LIMIT = 20;

function isRevokedAccount(email) {
  return String(process.env.REVOKED_ACCOUNT_EMAILS || '').split(',').map(value=>value.trim().toLowerCase()).filter(Boolean).includes(String(email || '').trim().toLowerCase());
}

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
    process.env.OSMAN_APPROVAL_EMAIL || "zaid.sd@vision71tech.com",
  ].map((e) => e.trim().toLowerCase()).filter(email=>email && !isRevokedAccount(email));
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

  // Built-in Vision71 internal admins are always present on all environments.
  // Aventure client addresses (hala@, osman@) are NOT hardcoded here — they
  // are provided via HALA_APPROVAL_EMAIL / OSMAN_APPROVAL_EMAIL in Vercel
  // Production environment variables only. This prevents staging from ever
  // granting administrator access to client accounts.
  const builtInAdmins = [
    "hmirza.sd@vision71tech.com",
    "zaid.sd@vision71tech.com",
  ];

  return [...new Set([...parsedEnv, ...builtInAdmins])].filter(email=>!isRevokedAccount(email));
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
    // Accept lead71.com (production) and lead71-staging.vercel.app (staging)
    if (trimmed.includes("lead71.com") || trimmed.includes("lead71-staging.vercel.app")) return trimmed;
  }
  return "https://lead71.com";
}

// Default approved emails for fresh deployments with no DB settings document.
// Aventure client addresses are intentionally NOT in this list — they must be
// configured via HALA_APPROVAL_EMAIL / OSMAN_APPROVAL_EMAIL env vars so that
// staging deployments (which should never have those vars set to Aventure
// addresses) do not automatically grant access to client accounts.
const DEFAULT_APPROVED_EMAILS = [
  "hmirza.sd@vision71tech.com",
  "zaid.sd@vision71tech.com",
];

async function getApprovalsDoc(db, {strict=false} = {}) {
  try {
    const doc = await db.collection("settings").findOne({ key: "account_approvals" });
    if (doc) {
      return {
        approvedEmails: Array.isArray(doc.approvedEmails) ? doc.approvedEmails.map((e) => e.toLowerCase()) : [...DEFAULT_APPROVED_EMAILS],
        pendingApprovals: doc.pendingApprovals || {},
        rejectedEmails: Array.isArray(doc.rejectedEmails) ? doc.rejectedEmails.map((e) => e.toLowerCase()) : [],
        roleAssignments: doc.roleAssignments || {},
      };
    }
  } catch (err) {
    if(strict)throw authError('APPROVALS_UNAVAILABLE',503,'Account settings could not be read. No Firebase account was created.');
    console.error("Error reading account_approvals setting:", err.message);
  }
  return {
    approvedEmails: [...DEFAULT_APPROVED_EMAILS],
    pendingApprovals: {},
    rejectedEmails: [],
    roleAssignments: {},
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
        roleAssignments: approvals.roleAssignments || {},
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
  if (isRevokedAccount(emailLower)) throw authError('ACCOUNT_REJECTED',403,'This account no longer has access.');

  const effectiveTenantId = tenantId || process.env.AVENTURE_TENANT_ID || "vision71-internal";

  try {
    await consumeIpRateLimit(db, ip, now);
  } catch (error) {
    await writeAudit(db, { tenantId: effectiveTenantId, action: "failed_sign_in", outcome: "refused", now });
    throw error;
  }

  if (!isAllowedAventureEmail(emailLower)) {
    const domainMsg = "Please use an authorized corporate work email.";
    throw authError("DOMAIN_RESTRICTED", 403, domainMsg);
  }

  // Determine user role and status without storing user accounts in MongoDB
  const approvals = await getApprovalsDoc(db);
  const assignment = approvals.roleAssignments[emailLower];
  if(assignment?.expiresAt && new Date(assignment.expiresAt)<=now)throw authError('ACCOUNT_EXPIRED',403,'This temporary account has expired. Contact an administrator.');
  const isAdmin = isDesignatedApprover(emailLower) || assignment?.role === 'vision71_administrator';
  let role = isAdmin ? "vision71_administrator" : assignment?.role || "exhibition_assistant";
  let status = "active";

  if (!isAdmin) {
    if (approvals.rejectedEmails.includes(emailLower)) {
      await writeAudit(db, { tenantId: effectiveTenantId, action: "failed_sign_in", outcome: "refused", now });
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
    expiresAt:assignment?.expiresAt || null,
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

  if (!session.user || isRevokedAccount(session.user.email) || (session.user.expiresAt && new Date(session.user.expiresAt)<=now) || session.user.status !== "active" || typeof session.user.uid !== 'string' || !session.user.uid || session.user.uid !== String(session.user.id)) {
    await db.collection("sessions").deleteOne({ _id: session._id });
    throw authError("UNAUTHENTICATED", 401, "Please sign in.");
  }

  // Designated admins with older capturer sessions gain access immediately.
  // Preserve all other existing roles and administrator accounts.
  const user = {
    ...session.user,
    role: isAdministrator(session.user.email)
      ? "vision71_administrator"
      : session.user.role,
  };
  const updates = touch ? { lastSeenAt: now } : {};
  if (user.role !== session.user.role) updates["user.role"] = user.role;
  if (Object.keys(updates).length) await db.collection("sessions").updateOne({ _id: session._id }, { $set: updates });
  requirePilotRole(user.role);
  return { session: { ...session, user }, user: publicUser(user) };
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

export async function createUser(db,actor,input,now=new Date(),{directory=readFirebaseDirectory,provision=provisionFirebaseUser}={}) {
  requireAction(actor,'manage_users');
  const email=String(input?.email||'').trim().toLowerCase(),name=String(input?.name||'').trim(),role=input?.role||'exhibition_assistant';
  if(!name||name.length>100||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw authError('USER_INVALID',400,'Enter a full name and valid work email address.');
  if(isRevokedAccount(email)||!directoryEmailVisible(email)||!isAllowedEmail(email))throw authError('DOMAIN_RESTRICTED',403,'This email is not permitted in this environment.');
  if(!['exhibition_assistant','vision71_administrator','vision71_support','aventure_reviewer'].includes(role))throw authError('ROLE_INVALID',400,'Choose a supported access role.');
  requirePilotRole(role);
  if(typeof input.password!=='string'||input.password.length<12||input.password.length>128)throw authError('PASSWORD_INVALID',400,'Use a temporary password of 12 to 128 characters.');
  const approvals=await getApprovalsDoc(db,{strict:true});
  const previouslyApproved=approvals.approvedEmails.includes(email);
  let account=(await directory()).find(user=>user.email===email);
  if(account?.disabled||approvals.rejectedEmails.includes(email))throw authError('ACCOUNT_RESTRICTED',409,'This account has disabled or removed access. Review it separately before restoring access.');
  if(account&&(isAdministrator(email)||approvals.roleAssignments[email]?.role==='vision71_administrator'||await db.collection('sessions').findOne({tenantId:actor.tenantId,'user.email':email,'user.role':'vision71_administrator'})))throw authError('ADMIN_PROTECTED',409,'This administrator account already exists. Its password and access were not changed.');
  if(account&&previouslyApproved&&role!==(approvals.roleAssignments[email]?.role||'exhibition_assistant'))throw authError('ACCOUNT_EXISTS',409,'This account already exists. Its password and role were not changed.');
  if(!account){try{account=await provision({name,email,password:input.password});}catch(error){if(error.code!=='ACCOUNT_EXISTS')throw error;throw authError('ACCOUNT_EXISTS',409,'This account was just registered. Refresh and try with the same email to check its status. Its password was not changed.');}}
  approvals.approvedEmails=[...new Set([...approvals.approvedEmails,email])];delete approvals.pendingApprovals[email];
  if(account.created||!previouslyApproved)approvals.roleAssignments[email]={role,...(role==='vision71_support'?{expiresAt:new Date(now.getTime()+86400000).toISOString()}:{})};
  try{await saveApprovalsDoc(db,approvals);await writeAudit(db,{tenantId:actor.tenantId,actor,action:account.created?'user_created':'user_approved',recordRef:account.uid,outcome:'success',now});}
  catch{throw authError('ACCOUNT_APPROVAL_UNCONFIRMED',503,'The Firebase account exists, but administrator approval could not be confirmed. Retry with the same email; its password will not be changed.');}
  const verificationRequired=!account.emailVerified;
  const message=account.created
    ? `Account created and approved. ${account.verificationSent?'A verification email was sent.':'The member must request an email verification link from sign in.'} It appears in Team members after email verification.${account.profileUpdated===false?' The display name could not be confirmed.':''}`
    : `Existing account approved. Its password was not changed.${verificationRequired?' The member must verify their email before signing in and appearing in Team members.':''}`;
  return {...publicUser({id:account.uid,uid:account.uid,email,name:account.name||name,role,status:verificationRequired?'pending_verification':'active',tenantId:actor.tenantId}),created:Boolean(account.created),verificationRequired,message};
}

export async function removeUser(db, actor, idOrEmail, now = new Date(), {directory = readFirebaseDirectory} = {}) {
  requireAction(actor, "manage_users");
  const target = String(idOrEmail || "").trim();
  if (!target) throw authError("USER_NOT_FOUND", 404, "Account not found.");
  if (target === String(actor.id) || target.toLowerCase() === String(actor.email).toLowerCase())
    throw authError("CANNOT_DELETE_SELF", 400, "You cannot remove your own access.");
  if (isAdministrator(target)) throw authError("ADMIN_PROTECTED", 403, "Administrator accounts cannot be removed.");

  const accounts = await directory();
  const account = accounts.find(item => item.uid === target || item.email === target.toLowerCase());
  if (!account || !directoryEmailVisible(account.email, process.env, getAdministratorEmails()))
    throw authError("USER_NOT_FOUND", 404, "Account not found.");
  if (isAdministrator(account.email)) throw authError("ADMIN_PROTECTED", 403, "Administrator accounts cannot be removed.");
  if (account.uid === String(actor.id) || account.email === String(actor.email).toLowerCase())
    throw authError("CANNOT_DELETE_SELF", 400, "You cannot remove your own access.");
  const administratorSession = await db.collection("sessions").findOne({tenantId:actor.tenantId, "user.email":account.email, "user.role":"vision71_administrator"});
  if (administratorSession) throw authError("ADMIN_PROTECTED", 403, "Administrator accounts cannot be removed.");

  const approvals = await getApprovalsDoc(db);
  if(approvals.roleAssignments[account.email]?.role==='vision71_administrator')throw authError('ADMIN_PROTECTED',403,'Administrator accounts cannot be removed.');
  approvals.approvedEmails = approvals.approvedEmails.filter(email => email !== account.email);
  delete approvals.pendingApprovals[account.email];
  approvals.rejectedEmails = [...new Set([...approvals.rejectedEmails, account.email])];
  await saveApprovalsDoc(db, approvals);
  await db.collection("sessions").deleteMany({tenantId:actor.tenantId, $or:[{userId:account.uid}, {"user.email":account.email}]});
  await writeAudit(db, {tenantId:actor.tenantId, actor, action:"user_removed", recordRef:account.email, outcome:"success", now});
}

export async function listUsers(db, actor, {directory = readFirebaseDirectory} = {}) {
  requireAction(actor, "manage_users");
  const [approvals, accounts] = await Promise.all([getApprovalsDoc(db), directory()]);
  const administrators = getAdministratorEmails();
  const administratorSessions = await db.collection("sessions").find(
    {tenantId:actor.tenantId, "user.role":"vision71_administrator"},
    {projection:{"user.email":1, _id:0}},
  ).toArray();
  const protectedEmails = new Set([...administrators, ...administratorSessions.map(item => String(item.user?.email || '').toLowerCase())]);
  const unique = new Map();
  for (const account of accounts) {
    if (isRevokedAccount(account.email)) continue;
    if (!directoryEmailVisible(account.email, process.env, administrators)) continue;
    const assignment=approvals.roleAssignments[account.email];
    if(assignment?.expiresAt&&new Date(assignment.expiresAt)<=new Date())continue;
    const administrator = protectedEmails.has(account.email)||assignment?.role==='vision71_administrator';
    let status = administrator || approvals.approvedEmails.includes(account.email) ? "active" : "pending_approval";
    if (!account.emailVerified) status = "pending_verification";
    if (!administrator && !isAllowedEmail(account.email)) status = "domain_restricted";
    if (approvals.rejectedEmails.includes(account.email) && !administrator) status = "access_removed";
    if (account.disabled) status = "disabled";
    if (status !== 'active') continue;
    const user = publicUser({id:account.email, uid:account.uid, email:account.email,
      name:account.name || approvals.pendingApprovals[account.email]?.name || account.email.split("@")[0],
      role:administrator ? "vision71_administrator" : assignment?.role || "exhibition_assistant", status, tenantId:actor.tenantId,expiresAt:assignment?.expiresAt||null});
    unique.set(account.email, {...user, canRemove:!administrator && account.email !== String(actor.email).toLowerCase() && status !== "access_removed"});
  }
  return [...unique.values()].sort((a,b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email));
}

export async function seedAdministrator() {
  throw authError("FIREBASE_PROVISIONING_REQUIRED", 409, "User accounts are created and authenticated directly through Firebase.");
}

export async function registerUser(db, { idToken, now = new Date() }, { notify = sendApprovalRequestEmail, notifyCandidate = sendPendingApprovalEmail } = {}) {
  const identity = await firebaseIdentity(idToken);
  const emailLower = identity.email;
  if (isRevokedAccount(emailLower)) throw authError('ACCOUNT_REJECTED',403,'This account no longer has access.');

  if (!isAllowedAventureEmail(emailLower)) {
    const domainMsg = "Please use an authorized corporate work email.";
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

  // Repeated verified sign-ins must not dispatch approval email again.
  if (approvals.pendingApprovals[emailLower]) return {ok:true,email:emailLower,status:'pending_approval'};

  // Non-admin needs admin approval: generate approval token
  const approvalToken = approvals.pendingApprovals[emailLower]?.token || token();
  approvals.pendingApprovals[emailLower] = {
    token: approvalToken,
    name: identity.name || emailLower.split("@")[0],
    requestedAt: now,
  };
  await saveApprovalsDoc(db, approvals);
  console.log(`[AUTH] User ${emailLower} requires admin approval. Approval request recorded.`);

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

  // Notify candidate that registration is pending approval
  try {
    await notifyCandidate({
      toEmail: emailLower,
      name: identity.name || emailLower.split("@")[0],
      statusUrl: `${baseUrl}/pending-approval?email=${encodeURIComponent(emailLower)}`,
    });
  } catch (userNoticeErr) {
    console.warn(`[AUTH] Notice email to candidate ${emailLower} skipped:`, userNoticeErr.message);
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
    try {
      await sendAccountRejectedEmail({
        toEmail: emailLower,
        name: userName,
      });
    } catch (err) {
      console.error(`Failed to send account rejection email to ${emailLower}:`, err.message);
    }
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

export async function approveUserByAdmin(db, actor, userIdOrEmail, now = new Date(), {directory = readFirebaseDirectory} = {}) {
  requireAction(actor, "manage_users");
  if (!isDesignatedApprover(actor.email)) {
    throw authError("FORBIDDEN", 403, "Only designated approvers can approve accounts.");
  }

  const emailLower = String(userIdOrEmail || "").trim().toLowerCase();
  const approvals = await getApprovalsDoc(db);
  const pending = approvals.pendingApprovals[emailLower];

  if (!directoryEmailVisible(emailLower, process.env, getAdministratorEmails()))
    throw authError("USER_NOT_FOUND", 404, "Account not found.");
  if (!pending && !approvals.approvedEmails.includes(emailLower)) {
    const account = (await directory()).find(item => item.email === emailLower);
    if (!account || !account.emailVerified || account.disabled || approvals.rejectedEmails.includes(emailLower))
      throw authError("USER_NOT_FOUND", 404, "A verified pending account was not found.");
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
