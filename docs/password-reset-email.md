# Branded password reset email

The forgot-password page requests a Firebase reset code from the backend. The
backend sends it using Lead71's shared approval-email layout and existing SMTP
configuration. Password verification and password changes still use Firebase;
reset codes and passwords are never stored in MongoDB or returned by this API.

## Enable locally and on Vercel

1. Open the Firebase project used by this website. In Project settings → Service
   accounts, generate a private key for a service account authorized for Firebase
   Authentication. It needs `firebaseauth.users.sendEmail`; the Firebase
   Authentication Admin role includes that permission.
2. Add these server-only variables to your local `.env` and Vercel Production:

   ```env
   FIREBASE_PROJECT_ID=the_project_id_from_the_json
   FIREBASE_SERVICE_ACCOUNT_EMAIL=the_client_email_from_the_json
   FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY="the_private_key_from_the_json"
   ```

   Preserve newlines in the private key, or use literal `\n` between its lines.
   Never add a `VITE_` prefix, commit the credentials, or put them in browser code.
   Use the Firebase Authentication project, not the Google Sheets service account.
3. Keep the existing SMTP settings and set `APP_BASE_URL=https://lead71.com` for
   production. Restart the local backend or redeploy after configuring variables.
4. Request a reset from the website and verify the email and the reset page.

Until these credentials are configured, the frontend retains Firebase's original
email flow so users can still recover their accounts. Once configured, delivery
failures show an error; they never trigger a second email or claim success.

The endpoint verifies CSRF, limits requests per IP and per hashed email address,
and returns the same success response for unknown accounts. Tests mock Firebase
and SMTP: they do not send real email. Production inbox rendering and delivery
must be checked after setup.
