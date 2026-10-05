import "dotenv/config";
import {
  getTransporter,
  getFromAddress,
  getReplyToAddress,
  getAppPublicUrl,
  sendOtpEmail,
  sendApprovalRequestEmail,
  sendAccountApprovedEmail,
  sendAccountRejectedEmail,
  sendPendingApprovalEmail,
  sendPasswordResetEmailTemplate,
  sendPasswordResetSuccessEmail,
} from "../server/notifications/emailService.js";

async function run() {
  console.log("=================================================");
  console.log("   Lead71 Email System Verification & Audit      ");
  console.log("=================================================");

  const from = getFromAddress();
  const replyTo = getReplyToAddress();
  const baseUrl = getAppPublicUrl();

  console.log(`From Address     : ${from}`);
  console.log(`Reply-To Address : ${replyTo}`);
  console.log(`App Base URL     : ${baseUrl}`);

  // Assert required sender and reply-to
  if (!from.includes("zaid.sd@vision71tech.com") || !from.includes("Lead71 by Vision71")) {
    console.error("FAIL: From does not match 'Lead71 by Vision71 <zaid.sd@vision71tech.com>'");
    process.exit(1);
  }

  if (replyTo !== "az@vision71tech.com") {
    console.error("FAIL: Reply-To does not match 'az@vision71tech.com'");
    process.exit(1);
  }

  console.log("PASS: Sender & Reply-To configuration validated.\n");

  // Verify SMTP Connection
  console.log("Verifying SMTP Transporter connection...");
  const transporter = getTransporter();
  try {
    await transporter.verify();
    console.log("PASS: SMTP Transporter verified successfully with Gmail servers.\n");
  } catch (err) {
    console.warn("WARN: SMTP Transporter verify error:", err.message);
  }

  // Test sending actual OTP verification email to authenticated test account
  console.log("Testing actual OTP email delivery to zaid.sd@vision71tech.com...");
  const otpRes = await sendOtpEmail({
    toEmail: "zaid.sd@vision71tech.com",
    otpCode: "718293",
    name: "Zaid Asim",
  });
  console.log("OTP Email Result:", otpRes);

  // Test sending Approval Request email
  console.log("\nTesting Approval Request email delivery...");
  const approvalRes = await sendApprovalRequestEmail({
    adminEmail: "zaid.sd@vision71tech.com",
    userName: "Ibrahim Test Assistant",
    userEmail: "ibrahim@aventureaviation.com",
    approvalUrl: "https://lead71.com/approve-user?token=test-token-7182&email=ibrahim%40aventureaviation.com",
  });
  console.log("Approval Request Result:", approvalRes);

  // Test sending Account Approved email
  console.log("\nTesting Account Approved email delivery...");
  const approvedRes = await sendAccountApprovedEmail({
    toEmail: "zaid.sd@vision71tech.com",
    name: "Ibrahim Test Assistant",
    loginUrl: "https://lead71.com/sign-in",
  });
  console.log("Account Approved Result:", approvedRes);

  // Test sending Pending Approval email
  console.log("\nTesting Pending Approval notification email delivery...");
  const pendingRes = await sendPendingApprovalEmail({
    toEmail: "zaid.sd@vision71tech.com",
    name: "Ibrahim Test Assistant",
    statusUrl: "https://lead71.com/pending-approval?email=ibrahim%40aventureaviation.com",
  });
  console.log("Pending Approval Result:", pendingRes);

  console.log("\n=================================================");
  console.log("ALL EMAIL FLOW CHECKS COMPLETE");
  console.log("=================================================");
}

run().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
