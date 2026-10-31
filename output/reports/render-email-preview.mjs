import nodemailer from 'nodemailer';
import { writeFileSync } from 'node:fs';
let captured;
nodemailer.createTransport = () => ({sendMail: async message => {captured=message;return {messageId:'offline-preview-no-email-sent'};}});
const {sendApprovalRequestEmail}=await import('../../server/notifications/emailService.js');
await sendApprovalRequestEmail({adminEmail:'approver@vision71tech.com',userName:'Vision71 Test User',userEmail:'test.user@vision71tech.com',approvalUrl:'https://lead71.com/approve-user?token=OFFLINE-PREVIEW-NOT-VALID&email=test.user%40vision71tech.com'});
writeFileSync('output/reports/lead71-current-approval-email-preview.html',captured.html);
writeFileSync('output/reports/lead71-current-approval-email-preview.txt',`OFFLINE RENDER ONLY — NO EMAIL SENT\nSubject: ${captured.subject}\n\n${captured.text}`);
console.log('Saved current template preview using an intercepted transport. No SMTP connection.');
