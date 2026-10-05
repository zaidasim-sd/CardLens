import nodemailer from "nodemailer";

function getTransporter() {
  const host = (process.env.SMTP_HOST || "smtp.gmail.com").trim();
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = (process.env.SMTP_USER || "zaid.sd@vision71tech.com").trim();
  const pass = (process.env.SMTP_PASS || "gune ymuk aajq rnsg").trim();
  const secure = process.env.SMTP_SECURE === "true" || port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

function getFromAddress() {
  return process.env.SMTP_FROM?.trim() || (process.env.SMTP_USER ? `"Lead71 Authorization" <${process.env.SMTP_USER.trim()}>` : "Lead71 <no-reply@lead71.com>");
}
const FROM_ADDRESS = getFromAddress();

import fs from "node:fs";
import path from "node:path";

export async function sendOtpEmail({ toEmail, otpCode, name = "Aventure Team Member" }) {
  // Always log OTP to server console for Ali Bhai and internal testing
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

  const transporter = getTransporter();

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Verification Code</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f8fafc; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" max-width="520px" cellspacing="0" cellpadding="0" border="0" style="max-width: 520px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center; border-bottom: 1px solid #f1f5f9;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #0f172a; letter-spacing: -0.5px;">Lead<span style="color: #248da3;">71</span></h1>
              <p style="margin: 4px 0 0; font-size: 13px; color: #64748b; font-weight: 500;">Exhibition Contact Platform · Aventure Aviation</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <h2 style="margin: 0 0 12px; font-size: 18px; font-weight: 600; color: #0f172a;">Verify your email address</h2>
              <p style="margin: 0 0 24px; font-size: 14px; line-height: 22px; color: #475569;">
                Hello <strong>${name}</strong>,<br>
                Please use the following 6-digit verification code to complete your Aventure Aviation Exhibition Assistant registration on Lead71:
              </p>
              
              <!-- OTP Box -->
              <div style="background-color: #f0fdfa; border: 1.5px solid #99f6e4; border-radius: 12px; padding: 20px; text-align: center; margin: 0 0 24px;">
                <span style="font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #0f766e; display: inline-block;">
                  ${otpCode}
                </span>
                <p style="margin: 8px 0 0; font-size: 12px; color: #115e59;">This code expires in 10 minutes</p>
              </div>

              <p style="margin: 0 0 16px; font-size: 13px; line-height: 20px; color: #64748b;">
                After verifying your email, your account will be placed in <strong>Pending Approval</strong> until confirmed by Hala or Osman.
              </p>
              <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                If you did not request this account, please ignore this email.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #f8fafc; border-top: 1px solid #f1f5f9; text-align: center; font-size: 12px; color: #94a3b8;">
              © ${new Date().getFullYear()} Vision71 Technologies for Aventure Aviation.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  try {
    const info = await transporter.sendMail({
      from: FROM_ADDRESS,
      to: toEmail,
      subject: `Your Lead71 Verification Code: ${otpCode}`,
      text: `Your Lead71 verification code is ${otpCode}. It expires in 10 minutes.`,
      html: htmlContent,
    });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Failed to send OTP email via Nodemailer:", error.message);
    // Don't throw fatal error in development if SMTP is unconfigured; console log succeeded
    return { success: false, error: error.message };
  }
}

export async function sendApprovalRequestEmail({ adminEmail, userName, userEmail, approvalUrl }) {
  console.log("\n============================================================");
  console.log("       [Lead71 Account Approval Request - Nodemailer]       ");
  console.log(`Approver     : ${adminEmail}`);
  console.log(`New User     : ${userName} (${userEmail})`);
  console.log(`Approval URL : ${approvalUrl}`);
  console.log("============================================================\n");

  const transporter = getTransporter();

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>New User Approval Request</title>
</head>
<body style="font-family: sans-serif; background-color: #f8fafc; padding: 24px; color: #1e293b;">
  <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 24px;">
    <h2 style="color: #0f172a; margin-top: 0;">New Account Approval Request</h2>
    <p>A new team member has registered for Lead71 and verified their work email:</p>
    <ul style="background: #f1f5f9; padding: 16px 28px; border-radius: 8px;">
      <li><strong>Name:</strong> ${userName}</li>
      <li><strong>Email:</strong> ${userEmail}</li>
      <li><strong>Requested Role:</strong> Exhibition Assistant (Card Capturer)</li>
    </ul>
    <p style="margin: 24px 0;">Please review and approve their access below:</p>
    <a href="${approvalUrl}" style="display: inline-block; background-color: #0284c7; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600;">
      Authorize &amp; Approve User on Lead71
    </a>
    <p style="font-size: 12px; color: #64748b; margin-top: 24px;">
      Or open this link: <br><a href="${approvalUrl}">${approvalUrl}</a>
    </p>
  </div>
</body>
</html>
  `;

  try {
    const info = await transporter.sendMail({
      from: getFromAddress(),
      to: adminEmail,
      subject: `Lead71: New Exhibition Assistant Access Request (${userName})`,
      text: `New user registration from ${userName} (${userEmail}). Approve at: ${approvalUrl}`,
      html: htmlContent,
    });
    console.log(`[Approval Email Sent Successfully] To: ${adminEmail} | MsgID: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error("Failed to send approval request email:", err.message);
    return { success: false, error: err.message };
  }
}

export async function sendAccountApprovedEmail({ toEmail, name, loginUrl }) {
  console.log("\n============================================================");
  console.log("       [Lead71 Account Approved Email - Nodemailer]         ");
  console.log(`User      : ${toEmail} (${name})`);
  console.log(`Login URL : ${loginUrl}`);
  console.log("============================================================\n");

  const transporter = getTransporter();

  const htmlContent = `
<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; background-color: #f8fafc; padding: 24px; color: #1e293b;">
  <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 24px;">
    <h2 style="color: #0f766e; margin-top: 0;">Account Approved</h2>
    <p>Hello <strong>${name}</strong>,</p>
    <p>Your Lead71 Exhibition Assistant account has been approved by Aventure Aviation.</p>
    <p>You can now sign in and begin capturing exhibition cards:</p>
    <a href="${loginUrl}" style="display: inline-block; background-color: #0f766e; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; margin: 16px 0;">
      Sign In to Lead71
    </a>
  </div>
</body>
</html>
  `;

  try {
    await transporter.sendMail({
      from: FROM_ADDRESS,
      to: toEmail,
      subject: "Your Lead71 Account has been Approved",
      text: `Hello ${name}, your Lead71 account is approved. Sign in at: ${loginUrl}`,
      html: htmlContent,
    });
  } catch (err) {
    console.error("Failed to send account approved email:", err.message);
  }
}
