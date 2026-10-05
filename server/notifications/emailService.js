import nodemailer from "nodemailer";
import fs from "node:fs";
import path from "node:path";

export function getAppPublicUrl() {
  const envUrl = process.env.APP_BASE_URL || process.env.APPROVAL_BASE_URL || process.env.PUBLIC_APP_URL;
  if (envUrl && envUrl.trim()) {
    const trimmed = envUrl.trim().replace(/\/+$/, "");
    if (!trimmed.includes("localhost") && !trimmed.includes("cardlens") && !trimmed.includes("cardsnap-vision71-staging")) {
      return trimmed;
    }
    // Allow localhost/staging in explicit test/dev if requested
    if (process.env.APP_ENV === "development" && (trimmed.includes("localhost") || trimmed.includes("127.0.0.1"))) {
      return trimmed;
    }
  }
  return "https://lead71.com";
}

export function getTransporter() {
  const host = (process.env.SMTP_HOST || "smtp.gmail.com").trim();
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = (process.env.SMTP_USER || "zaid.sd@vision71tech.com").trim();
  const pass = (process.env.SMTP_PASS || "").trim();
  const secure = process.env.SMTP_SECURE === "true" || port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

export function getFromAddress() {
  const fromEnv = process.env.SMTP_FROM?.trim();
  const user = process.env.SMTP_USER?.trim() || "zaid.sd@vision71tech.com";
  if (fromEnv) {
    if (fromEnv.includes("<") && fromEnv.includes(">")) return fromEnv;
    return `"${fromEnv.replace(/"/g, "")}" <${user}>`;
  }
  return `"Lead71 by Vision71" <${user}>`;
}

export function getReplyToAddress() {
  return process.env.SMTP_REPLY_TO?.trim() || undefined;
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Centralized email sending function for all Lead71 communications.
 * Enforces dynamic from and replyTo addresses from environment variables.
 */
export async function sendLead71Email({ to, subject, html, text }) {
  const transporter = getTransporter();
  const from = getFromAddress();
  const replyTo = getReplyToAddress();

  const mailOptions = {
    from,
    to,
    subject,
    text,
    html,
  };

  if (replyTo) {
    mailOptions.replyTo = replyTo;
  }

  const info = await transporter.sendMail(mailOptions);
  return { success: true, messageId: info.messageId };
}

/**
 * Unified Lead71 Email Design System Layout
 * Ensures all authentication and transactional emails share a consistent,
 * professional visual identity aligned with the Lead71 platform.
 */
function renderLead71Layout({
  title,
  preheader,
  badgeText = "Lead71 Notification",
  badgeBg = "#f0fdfa",
  badgeColor = "#0f766e",
  badgeBorder = "#99f6e4",
  bodyHtml,
  ctaText,
  ctaUrl,
  secondaryHtml = "",
  footerNote = "",
  baseUrl = getAppPublicUrl(),
}) {
  const currentYear = new Date().getFullYear();
  const logoUrl = `${baseUrl}/lead71-logo.svg`;
  const supportEmail = process.env.SMTP_REPLY_TO?.trim() || "az@vision71tech.com";

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escapeHtml(title)}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td, p, a { font-family: Arial, Helvetica, sans-serif !important; }
  </style>
  <![endif]-->
  <style type="text/css">
    body, table, td, p, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    body { margin: 0; padding: 0; width: 100% !important; min-width: 100%; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    .email-container { width: 100%; max-width: 560px; margin: 0 auto; }
    @media only screen and (max-width: 600px) {
      .email-card { padding: 26px 20px !important; border-radius: 12px !important; }
      .email-header { padding: 24px 16px 18px !important; }
      .email-cta-btn { display: block !important; width: 100% !important; text-align: center !important; box-sizing: border-box !important; }
      .email-otp { font-size: 30px !important; letter-spacing: 6px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; color: #1e293b;">
  <!-- Preheader text for inbox preview -->
  <div style="display: none; font-size: 1px; color: #f8fafc; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden; mso-hide: all;">
    ${escapeHtml(preheader || title)}
  </div>

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f8fafc; width: 100%; table-layout: fixed;">
    <tr>
      <td align="center" style="padding: 40px 16px 48px;">
        <table role="presentation" class="email-container" cellspacing="0" cellpadding="0" border="0" style="width: 100%; max-width: 560px; margin: 0 auto;">
          
          <!-- Header Branding -->
          <tr>
            <td class="email-header" align="center" style="padding: 0 0 28px; text-align: center;">
              <a href="${baseUrl}" target="_blank" rel="noopener noreferrer" style="text-decoration: none; display: inline-block;">
                <!-- Lead71 Logo Image with fallback -->
                <img src="${logoUrl}" alt="Lead71 by Vision71" width="144" height="48" style="display: block; border: 0; margin: 0 auto 6px auto; max-width: 144px; height: auto;" />
              </a>
              <div style="font-size: 11px; font-weight: 600; letter-spacing: 0.8px; text-transform: uppercase; color: #64748b; margin-top: 4px;">
                Exhibition Capture Platform
              </div>
            </td>
          </tr>

          <!-- Main Content Card -->
          <tr>
            <td class="email-card" style="background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; padding: 36px 32px; box-shadow: 0 4px 6px -1px rgba(15, 23, 42, 0.04);">
              
              <!-- Badge -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 20px;">
                <tr>
                  <td style="background-color: ${badgeBg}; border: 1px solid ${badgeBorder}; border-radius: 9999px; padding: 4px 12px; font-size: 11px; font-weight: 600; color: ${badgeColor}; text-transform: uppercase; letter-spacing: 0.5px;">
                    ${escapeHtml(badgeText)}
                  </td>
                </tr>
              </table>

              <!-- Title -->
              <h1 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 700; color: #0f172a; line-height: 28px; letter-spacing: -0.3px;">
                ${escapeHtml(title)}
              </h1>

              <!-- Dynamic Body HTML -->
              <div style="font-size: 14px; line-height: 22px; color: #334155;">
                ${bodyHtml}
              </div>

              <!-- Primary Call To Action Button -->
              ${ctaText && ctaUrl ? `
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 28px 0 20px;">
                <tr>
                  <td align="center">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td align="center" style="border-radius: 10px; background-color: #0f766e;">
                          <a href="${ctaUrl}" target="_blank" rel="noopener noreferrer" class="email-cta-btn" style="background-color: #0f766e; border: 1px solid #0f766e; border-radius: 10px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; padding: 13px 30px; display: inline-block; letter-spacing: 0.2px;">
                            ${escapeHtml(ctaText)}
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              ` : ""}

              <!-- Secondary HTML Content -->
              ${secondaryHtml ? `<div style="margin-top: 16px;">${secondaryHtml}</div>` : ""}

              <!-- Optional Context Note -->
              ${footerNote ? `
              <div style="margin-top: 24px; padding-top: 18px; border-top: 1px solid #f1f5f9; font-size: 12px; line-height: 18px; color: #94a3b8;">
                ${footerNote}
              </div>` : ""}
            </td>
          </tr>

          <!-- Footer Area -->
          <tr>
            <td style="padding: 28px 24px 0; text-align: center; font-size: 12px; line-height: 20px; color: #94a3b8;">
              <p style="margin: 0 0 6px 0; font-weight: 500; color: #64748b;">
                Lead71 by Vision71 · Exhibition Platform
              </p>
              <p style="margin: 0 0 8px 0; font-size: 11px;">
                Secure Exhibition Card Capture &amp; Onboarding System
              </p>
              <p style="margin: 0; font-size: 11px; color: #94a3b8;">
                Need help? Contact support at <a href="mailto:${supportEmail}" style="color: #0f766e; text-decoration: underline;">${supportEmail}</a>
              </p>
              <p style="margin: 10px 0 0 0; font-size: 11px; color: #cbd5e1;">
                © ${currentYear} Vision71 Technologies. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ============================================================================
// 1. EMAIL VERIFICATION / OTP TEMPLATE
// ============================================================================
export async function sendOtpEmail({ toEmail, otpCode, name = "Team Member" }) {
  console.log("\n============================================================");
  console.log("       [Lead71 Email Verification OTP - Nodemailer]         ");
  console.log(`Recipient : ${toEmail} (${name})`);
  console.log(`OTP Code  : ${otpCode}`);
  console.log("Valid for : 10 minutes");
  console.log("============================================================\n");

  try {
    fs.writeFileSync(
      path.resolve(process.cwd(), "latest-otp.txt"),
      `============================================================\n` +
      `       [Lead71 Email Verification OTP - Nodemailer]         \n` +
      `Recipient : ${toEmail} (${name})\n` +
      `OTP Code  : ${otpCode}\n` +
      `Generated : ${new Date().toLocaleString()}\n` +
      `Valid for : 10 minutes\n` +
      `============================================================\n`
    );
  } catch {}

  const baseUrl = getAppPublicUrl();

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello <strong>${escapeHtml(name)}</strong>,</p>
    <p style="margin: 0 0 20px 0;">
      Please use the following 6-digit verification code to confirm your email address and proceed with your Lead71 Exhibition Assistant registration:
    </p>

    <div style="background-color: #f0fdfa; border: 1.5px solid #99f6e4; border-radius: 12px; padding: 22px; text-align: center; margin: 20px 0 24px;">
      <span class="email-otp" style="font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 34px; font-weight: 700; letter-spacing: 8px; color: #0f766e; display: inline-block;">
        ${escapeHtml(otpCode)}
      </span>
      <p style="margin: 8px 0 0 0; font-size: 12px; font-weight: 500; color: #115e59;">This code expires in 10 minutes</p>
    </div>

    <p style="margin: 0 0 12px 0; font-size: 13px; line-height: 20px; color: #64748b;">
      Once verified, your account request will be submitted to designated administrators (Hala and Osman) for authorization before access is activated.
    </p>
  `;

  const html = renderLead71Layout({
    title: "Verify your work email",
    preheader: `Your Lead71 verification code is ${otpCode}. Valid for 10 minutes.`,
    badgeText: "Account Verification",
    bodyHtml,
    footerNote: "If you did not request this verification code, no further action is required. Your account remains protected.",
    baseUrl,
  });

  const text = `Hello ${name},\n\nYour Lead71 verification code is: ${otpCode}\n\nThis code expires in 10 minutes.\n\nOnce verified, your account request will be submitted to administrators for authorization.\n\nLead71 by Vision71`;

  try {
    const res = await sendLead71Email({
      to: toEmail,
      subject: `Your Lead71 Verification Code: ${otpCode}`,
      html,
      text,
    });
    return res;
  } catch (error) {
    console.error("Failed to send OTP email via Nodemailer:", error.message);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// 2. ADMIN APPROVAL REQUEST EMAIL (EXHIBITION ASSISTANT ACCESS REQUEST)
// ============================================================================
export async function sendApprovalRequestEmail({ adminEmail, userName, userEmail, approvalUrl }) {
  console.log("\n============================================================");
  console.log("       [Lead71 Account Approval Request - Nodemailer]       ");
  console.log(`Approver     : ${adminEmail}`);
  console.log(`New User     : ${userName} (${userEmail})`);
  console.log(`Approval URL : ${approvalUrl}`);
  console.log("============================================================\n");

  const baseUrl = getAppPublicUrl();

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">
      A new team member has completed email verification and is requesting access to the Lead71 exhibition capture workspace:
    </p>

    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px 20px; margin: 20px 0;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="font-size: 13px;">
        <tr>
          <td style="padding: 6px 0; color: #64748b; font-weight: 500; width: 38%;">Candidate Name:</td>
          <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${escapeHtml(userName)}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748b; font-weight: 500;">Work Email:</td>
          <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${escapeHtml(userEmail)}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748b; font-weight: 500;">Requested Role:</td>
          <td style="padding: 6px 0; color: #0f766e; font-weight: 600;">Exhibition Assistant</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748b; font-weight: 500;">Event Scope:</td>
          <td style="padding: 6px 0; color: #0f172a; font-weight: 500;">Aero-Engines Americas 2026</td>
        </tr>
      </table>
    </div>

    <p style="margin: 0 0 8px 0; font-size: 13px; line-height: 20px; color: #475569;">
      Click the button below to review the request, grant access, or decline the application:
    </p>
  `;

  const html = renderLead71Layout({
    title: "New Exhibition Assistant Access Request",
    preheader: `Access request from ${userName} (${userEmail}) for Lead71.`,
    badgeText: "Admin Approval Required",
    badgeBg: "#fef3c7",
    badgeColor: "#b45309",
    badgeBorder: "#fde68a",
    bodyHtml,
    ctaText: "Review Access Request",
    ctaUrl: approvalUrl,
    footerNote: "This authorization request is restricted to designated administrators.",
    baseUrl,
  });

  const text = `New Exhibition Assistant Access Request\n\nCandidate: ${userName}\nEmail: ${userEmail}\nRole: Exhibition Assistant\nEvent: Aero-Engines Americas 2026\n\nPlease review and authorize access at:\n${approvalUrl}\n\nLead71 by Vision71`;

  try {
    const info = await sendLead71Email({
      to: adminEmail,
      subject: `Lead71: New Exhibition Assistant Access Request (${userName})`,
      text,
      html,
    });
    console.log(`[Approval Email Sent Successfully] To: ${adminEmail} | MsgID: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error("Failed to send approval request email:", err.message);
    return { success: false, error: err.message };
  }
}

// ============================================================================
// 3. ACCOUNT APPROVAL CONFIRMATION EMAIL
// ============================================================================
export async function sendAccountApprovedEmail({ toEmail, name, loginUrl }) {
  console.log("\n============================================================");
  console.log("       [Lead71 Account Approved Email - Nodemailer]         ");
  console.log(`User      : ${toEmail} (${name})`);
  console.log(`Login URL : ${loginUrl}`);
  console.log("============================================================\n");

  const baseUrl = getAppPublicUrl();
  const effectiveLoginUrl = loginUrl || `${baseUrl}/sign-in`;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello <strong>${escapeHtml(name)}</strong>,</p>
    <p style="margin: 0 0 16px 0;">
      Your Lead71 Exhibition Assistant account has been approved by administrators.
    </p>
    <p style="margin: 0 0 20px 0;">
      Your workspace is now active. You can sign in to begin capturing business cards, running OCR recognition, and submitting contacts directly to the review register.
    </p>

    <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 16px 18px; margin: 16px 0;">
      <p style="margin: 0; font-size: 13px; line-height: 20px; color: #166534; font-weight: 500;">
        ✓ Account Status: <strong>Active &amp; Authorized</strong><br>
        ✓ Assigned Event: <strong>Aero-Engines Americas 2026</strong>
      </p>
    </div>
  `;

  const html = renderLead71Layout({
    title: "Your Lead71 Account is Approved",
    preheader: "Your Lead71 Exhibition Assistant account has been approved. Sign in now.",
    badgeText: "Access Authorized",
    badgeBg: "#f0fdf4",
    badgeColor: "#15803d",
    badgeBorder: "#bbf7d0",
    bodyHtml,
    ctaText: "Sign In to Lead71",
    ctaUrl: effectiveLoginUrl,
    footerNote: "Welcome to the team! If you have any questions during the exhibition, contact your team lead.",
    baseUrl,
  });

  const text = `Hello ${name},\n\nYour Lead71 Exhibition Assistant account has been approved.\n\nYou can sign in at: ${effectiveLoginUrl}\n\nLead71 by Vision71`;

  try {
    const res = await sendLead71Email({
      to: toEmail,
      subject: "Your Lead71 Account Has Been Approved",
      text,
      html,
    });
    return res;
  } catch (err) {
    console.error("Failed to send account approved email:", err.message);
    return { success: false, error: err.message };
  }
}

// ============================================================================
// 4. ACCOUNT REJECTION NOTIFICATION EMAIL
// ============================================================================
export async function sendAccountRejectedEmail({ toEmail, name, reason = "" }) {
  console.log("\n============================================================");
  console.log("       [Lead71 Account Rejection Email - Nodemailer]       ");
  console.log(`User   : ${toEmail} (${name})`);
  console.log("============================================================\n");

  const baseUrl = getAppPublicUrl();
  const supportEmail = process.env.SMTP_REPLY_TO?.trim() || "az@vision71tech.com";

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello <strong>${escapeHtml(name)}</strong>,</p>
    <p style="margin: 0 0 16px 0;">
      Thank you for registering for Lead71. At this time, your request for Exhibition Assistant access could not be approved.
    </p>
    ${reason ? `<div style="background-color: #fff1f2; border: 1px solid #fecdd3; border-radius: 10px; padding: 14px 18px; margin: 16px 0; font-size: 13px; color: #9f1239;"><strong>Note:</strong> ${escapeHtml(reason)}</div>` : ""}
    <p style="margin: 0 0 12px 0; font-size: 13px; line-height: 20px; color: #64748b;">
      If you believe this decision is in error or if you require access for an upcoming event, please contact your team administrator or email support at <a href="mailto:${supportEmail}" style="color: #0f766e; text-decoration: underline;">${supportEmail}</a>.
    </p>
  `;

  const html = renderLead71Layout({
    title: "Lead71 Account Request Update",
    preheader: "An update regarding your Lead71 account request.",
    badgeText: "Request Update",
    badgeBg: "#fff1f2",
    badgeColor: "#be123c",
    badgeBorder: "#fecdd3",
    bodyHtml,
    ctaText: "Return to Lead71",
    ctaUrl: `${baseUrl}/welcome`,
    baseUrl,
  });

  const text = `Hello ${name},\n\nThank you for registering for Lead71. At this time, your request for Exhibition Assistant access could not be approved.\n\nIf you believe this is in error, contact support at ${supportEmail}.\n\nLead71 by Vision71`;

  try {
    return await sendLead71Email({
      to: toEmail,
      subject: "Update Regarding Your Lead71 Account Request",
      text,
      html,
    });
  } catch (err) {
    console.error("Failed to send account rejection email:", err.message);
    return { success: false, error: err.message };
  }
}

// ============================================================================
// 5. PENDING APPROVAL NOTIFICATION EMAIL
// ============================================================================
export async function sendPendingApprovalEmail({ toEmail, name, statusUrl }) {
  const baseUrl = getAppPublicUrl();
  const effectiveStatusUrl = statusUrl || `${baseUrl}/pending-approval?email=${encodeURIComponent(toEmail)}`;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello <strong>${escapeHtml(name)}</strong>,</p>
    <p style="margin: 0 0 16px 0;">
      Your work email address has been verified successfully.
    </p>
    <p style="margin: 0 0 16px 0;">
      Your account registration has been placed in <strong>Pending Approval</strong> and queued for authorization by designated administrators.
    </p>

    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px 18px; margin: 20px 0;">
      <p style="margin: 0 0 6px 0; font-size: 13px; font-weight: 600; color: #0f172a;">What happens next?</p>
      <ul style="margin: 0; padding-left: 20px; font-size: 13px; line-height: 20px; color: #475569;">
        <li>An administrator reviews your registration.</li>
        <li>You will receive an email confirmation once approved.</li>
        <li>You do not need to create another account.</li>
      </ul>
    </div>
  `;

  const html = renderLead71Layout({
    title: "Your Account is Awaiting Approval",
    preheader: "Your Lead71 registration has been received and is pending administrator authorization.",
    badgeText: "Pending Approval",
    badgeBg: "#fef3c7",
    badgeColor: "#b45309",
    badgeBorder: "#fde68a",
    bodyHtml,
    ctaText: "Check Approval Status",
    ctaUrl: effectiveStatusUrl,
    footerNote: "You do not need to resubmit your application. We will notify you promptly upon review.",
    baseUrl,
  });

  const text = `Hello ${name},\n\nYour Lead71 account registration is received and pending administrator approval.\n\nYou do not need to register again. You will receive an email confirmation once authorized.\n\nCheck status: ${effectiveStatusUrl}\n\nLead71 by Vision71`;

  try {
    return await sendLead71Email({
      to: toEmail,
      subject: "Lead71: Your Registration is Pending Administrator Approval",
      text,
      html,
    });
  } catch (err) {
    console.error("Failed to send pending approval email:", err.message);
    return { success: false, error: err.message };
  }
}

// ============================================================================
// 6. FORGOT PASSWORD / PASSWORD RESET REQUEST EMAIL
// ============================================================================
export async function sendPasswordResetEmailTemplate({ toEmail, name = "Team Member", resetUrl }) {
  console.log("\n============================================================");
  console.log("       [Lead71 Password Reset Email - Nodemailer]           ");
  console.log(`User      : ${toEmail} (${name})`);
  console.log(`Reset URL : ${resetUrl}`);
  console.log("============================================================\n");

  const baseUrl = getAppPublicUrl();

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello <strong>${escapeHtml(name)}</strong>,</p>
    <p style="margin: 0 0 20px 0;">
      We received a request to reset the password associated with your Lead71 account (<strong>${escapeHtml(toEmail)}</strong>).
    </p>
    <p style="margin: 0 0 8px 0;">
      Select the button below to choose a new password:
    </p>
  `;

  const html = renderLead71Layout({
    title: "Reset your Lead71 password",
    preheader: "Choose a new password for your Lead71 account.",
    badgeText: "Password Reset",
    badgeBg: "#f1f5f9",
    badgeColor: "#334155",
    badgeBorder: "#cbd5e1",
    bodyHtml,
    ctaText: "Reset Password",
    ctaUrl: resetUrl,
    footerNote: "This password reset link is valid for 1 hour. If you did not request a password reset, you can safely ignore this email — your password will remain unchanged.",
    baseUrl,
  });

  const text = `Hello ${name},\n\nWe received a request to reset your Lead71 password.\n\nReset your password here:\n${resetUrl}\n\nThis link is valid for 1 hour. If you did not request this, please ignore this email.\n\nLead71 by Vision71`;

  try {
    return await sendLead71Email({
      to: toEmail,
      subject: "Reset your Lead71 Password",
      text,
      html,
    });
  } catch (err) {
    console.error("Failed to send password reset email:", err.message);
    return { success: false, error: err.message };
  }
}

// ============================================================================
// 7. PASSWORD RESET SUCCESS CONFIRMATION EMAIL
// ============================================================================
export async function sendPasswordResetSuccessEmail({ toEmail, name = "Team Member" }) {
  const baseUrl = getAppPublicUrl();
  const loginUrl = `${baseUrl}/sign-in`;
  const supportEmail = process.env.SMTP_REPLY_TO?.trim() || "az@vision71tech.com";

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello <strong>${escapeHtml(name)}</strong>,</p>
    <p style="margin: 0 0 16px 0;">
      The password for your Lead71 account (<strong>${escapeHtml(toEmail)}</strong>) was changed successfully.
    </p>
    <p style="margin: 0 0 20px 0;">
      You can now sign in using your new credentials.
    </p>

    <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 14px 18px; margin: 16px 0; font-size: 13px; color: #92400e;">
      <strong>Security notice:</strong> If you did not make this change, please contact support immediately at <a href="mailto:${supportEmail}" style="color: #0f766e; text-decoration: underline;">${supportEmail}</a> to secure your account.
    </div>
  `;

  const html = renderLead71Layout({
    title: "Password Changed Successfully",
    preheader: "Your Lead71 account password has been updated successfully.",
    badgeText: "Security Notice",
    badgeBg: "#f0fdf4",
    badgeColor: "#15803d",
    badgeBorder: "#bbf7d0",
    bodyHtml,
    ctaText: "Sign In to Lead71",
    ctaUrl: loginUrl,
    footerNote: "This notification was sent to keep your account secure.",
    baseUrl,
  });

  const text = `Hello ${name},\n\nYour Lead71 account password was changed successfully.\n\nSign in at: ${loginUrl}\n\nIf you did not make this change, contact ${supportEmail} immediately.\n\nLead71 by Vision71`;

  try {
    return await sendLead71Email({
      to: toEmail,
      subject: "Your Lead71 Password Was Successfully Reset",
      text,
      html,
    });
  } catch (err) {
    console.error("Failed to send password reset success email:", err.message);
    return { success: false, error: err.message };
  }
}

// ============================================================================
// 8. SECURITY / SYSTEM NOTIFICATION EMAIL
// ============================================================================
export async function sendSecurityNotificationEmail({ toEmail, name = "Team Member", title, details }) {
  const baseUrl = getAppPublicUrl();

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello <strong>${escapeHtml(name)}</strong>,</p>
    <p style="margin: 0 0 16px 0;">${escapeHtml(details)}</p>
  `;

  const html = renderLead71Layout({
    title,
    preheader: title,
    badgeText: "Security Notification",
    badgeBg: "#f8fafc",
    badgeColor: "#475569",
    badgeBorder: "#e2e8f0",
    bodyHtml,
    baseUrl,
  });

  const text = `Hello ${name},\n\n${details}\n\nLead71 by Vision71`;

  try {
    return await sendLead71Email({
      to: toEmail,
      subject: `Lead71: ${title}`,
      text,
      html,
    });
  } catch (err) {
    console.error("Failed to send security notification email:", err.message);
    return { success: false, error: err.message };
  }
}
