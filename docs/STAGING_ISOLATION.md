# Staging Isolation & Production Authentication Checklist

**Context:** 28 Oct 2026 — Lead71 incident where staging sent OTP email to a real client
(`@aventureaviation.com`) address. This document records what was fixed in code and what
must be configured in Vercel before staging is used again.

---

## URLs — know which is which

| URL | Purpose | Share with clients? |
|-----|---------|-------------------|
| `https://lead71.com` | Production — the only client-facing URL | ✅ Yes |
| `https://lead71-staging.vercel.app` | Internal staging — Vercel Preview branch | ❌ Never |
| `https://lead71.vercel.app` | Vercel default deployment URL | ❌ Never — redirect to `lead71.com` |

**Redirect `lead71.vercel.app` → `lead71.com`:** In the Vercel project dashboard go to
Settings → Domains, add `lead71.vercel.app` as a redirect to `https://lead71.com`.

---

## What was fixed in code (already deployed to the `staging` branch)

### 1. Email allowlist guard — `server/notifications/emailService.js`

`sendLead71Email()` now calls `assertStagingEmailPermitted(to)` before opening any SMTP
connection. On staging (`VERCEL_ENV=preview` or `APP_ENV=staging`):

- If `STAGING_EMAIL_ALLOWLIST` is **empty** → all outbound email is suppressed and a
  `STAGING_EMAIL_BLOCKED` error is thrown.
- If the recipient is **not** in the allowlist → same hard block.
- Permitted addresses are logged; blocked attempts are logged as warnings.

This means **no email can leave staging to a real client address**, even if someone types
it in manually.

### 2. Sign-in domain block — `server/auth/service.js`

`assertStagingSignInPermitted(email)` is called in both `signIn()` and `registerUser()`
**before** any Firebase token exchange, MongoDB write, or email dispatch:

- `@aventureaviation.com` is **always blocked** on staging, regardless of any env var.
- Any domain not in `STAGING_ALLOWED_DOMAINS` is also blocked.
- `@vision71tech.com` and `@example.test` are always permitted on staging.

The error returned to the browser is:
> "This is an internal staging environment. Client accounts are not permitted here.
> Please use https://lead71.com."

### 3. Startup config validator — `server/index.js`

Every cold start prints a pass/fail checklist of required env vars to the Vercel Function
log. Check Vercel → Functions → Logs immediately after a deploy to confirm all vars are
present. If `FIREBASE_API_KEY` is missing while `VITE_FIREBASE_API_KEY` is set, a specific
warning explains the Vercel runtime stripping issue (see below).

### 4. Enhanced `/api/health` endpoint

`GET https://lead71-staging.vercel.app/api/health` now returns:

```json
{
  "status": "ok",
  "env": "preview",
  "config": {
    "mongodb": true,
    "mongodbDb": true,
    "firebaseApiKey": true,
    "smtp": true,
    "stagingEmailAllowlist": true
  }
}
```

All values should be `true` before testing. Any `false` maps directly to a missing env var.

### 5. Staging banner — `src/components/StagingBanner.tsx`

When `VITE_IS_STAGING=true` is set as a Vercel Preview build var, an amber banner reading:

> ⚠ Internal Staging Environment — Do Not Use for Client Access | Production: lead71.com

appears fixed at the top of every page, including the sign-in page.

---

## Vercel environment variables to set — do this now

Go to: **Vercel → lead71 project → Settings → Environment Variables**

### Preview environment (staging) — set these for Preview only

| Variable | Value | Notes |
|----------|-------|-------|
| `MONGODB_URI` | staging Atlas connection string | Must be a **separate** staging database, NOT the production cluster |
| `MONGODB_DB` | `cardsnap_vision71_staging` | Or another dedicated staging DB name |
| `FIREBASE_API_KEY` | same value as `VITE_FIREBASE_API_KEY` | **Server-side runtime** — Vercel does NOT expose `VITE_` vars to serverless functions. This is the root cause of the 500 error. |
| `VITE_FIREBASE_API_KEY` | Firebase web API key | Build-time only |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain | Build-time only |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID | Build-time only |
| `VITE_FIREBASE_APP_ID` | Firebase app ID | Build-time only |
| `SMTP_HOST` | `smtp.gmail.com` | Can use a separate staging Gmail app password |
| `SMTP_USER` | internal test address only | e.g. `zaid.sd@vision71tech.com` |
| `SMTP_PASS` | app password for staging SMTP user | |
| `STAGING_EMAIL_ALLOWLIST` | `zaid.sd@vision71tech.com,hmirza.sd@vision71tech.com` | Comma-separated. Only these addresses receive staging emails. |
| `STAGING_ALLOWED_DOMAINS` | `vision71tech.com,example.test` | Domains permitted to sign in on staging. |
| `VITE_IS_STAGING` | `true` | Shows the amber staging banner on all pages. |
| `APP_ENV` | `staging` | Server-side environment label (fallback; `VERCEL_ENV=preview` is the primary signal). |
| `APP_BASE_URL` | `https://lead71-staging.vercel.app` | Staging base URL for approval links in emails. |
| `HALA_APPROVAL_EMAIL` | internal Vision71 address only | Must NOT be `hala@aventureaviation.com` on staging. |
| `OSMAN_APPROVAL_EMAIL` | internal Vision71 address only | Must NOT be an Aventure address on staging. |

### Production environment — verify these are set correctly

| Variable | Requirement |
|----------|------------|
| `MONGODB_URI` | Production Atlas cluster |
| `MONGODB_DB` | Production database name |
| `FIREBASE_API_KEY` | Same value as `VITE_FIREBASE_API_KEY` — must be set explicitly |
| `VITE_IS_STAGING` | Must be `false` or absent |
| `STAGING_EMAIL_ALLOWLIST` | Must be absent or empty |
| `STAGING_ALLOWED_DOMAINS` | Must be absent or empty |
| `APP_BASE_URL` | `https://lead71.com` |
| `HALA_APPROVAL_EMAIL` | `hala@aventureaviation.com` |
| `OSMAN_APPROVAL_EMAIL` | correct Aventure email for Osman |

---

## Root cause of the 500 on `/api/auth?action=session`

**Short answer:** `MONGODB_URI` and/or `FIREBASE_API_KEY` were missing from the Vercel
Preview environment variables.

**Why `VITE_FIREBASE_API_KEY` alone is not enough:**
Vite inlines `VITE_` vars into the browser bundle at build time. Vercel does NOT make
`VITE_` vars available to serverless function runtimes. The server calls
`process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY` — if neither is set in
the Vercel runtime, every `sign_in` and `google_auth` call throws `FIREBASE_NOT_CONFIGURED`
(503), which surfaces as a 500 in the caller.

**Why `?action=session` returns 500 even without Firebase:**
`session` does not use Firebase at all. Its 500 means `getDb()` failed — MongoDB is
unreachable. This is caused by a missing or wrong `MONGODB_URI` in the Preview env vars,
or by the staging deployment sharing the production `MONGODB_URI` and the production cluster
rejecting the connection (IP allowlist, wrong credentials, etc.).

**How to confirm the fix after deploying:**
```
curl https://lead71-staging.vercel.app/api/health
```
All config flags must be `true`. Then check Vercel Function logs for the startup config
checklist printed by `server/index.js`.

---

## Removing Hala and Osman from staging data

These steps must be done manually once staging has the correct `MONGODB_URI` pointing at
the staging database (not production):

1. Sign in to staging with an internal `@vision71tech.com` administrator account.
2. Go to Users → find any entry for `hala@aventureaviation.com` or
   `osman@aventureaviation.com` → delete.
3. In MongoDB Atlas (staging cluster), open the `settings` collection, find the
   `account_approvals` document, and remove both Aventure addresses from
   `approvedEmails`, `pendingApprovals`, and `rejectedEmails`.
4. In the `sessions` collection, delete any session with `user.email` matching either
   Aventure address.
5. Confirm by calling `GET /api/users` from an admin session — neither Aventure address
   should appear.

> If staging was sharing the production database these steps must be deferred until
> `MONGODB_URI` is corrected to point at a separate staging DB. Never run cleanup against
> production data to fix a staging issue.

---

## Tonight's Hala call — production checklist

Before Ali's 10pm call, verify the following on **production** (`https://lead71.com`)
from an incognito browser on a mobile network (not office WiFi):

- [ ] Page loads without errors in incognito / mobile data
- [ ] "Continue with Google" works with `hala@aventureaviation.com` Google account
- [ ] Email sign-in sends OTP from the approved Lead71 sender identity (not a personal Gmail)
- [ ] Hala's production role is `vision71_administrator` after sign-in
- [ ] `GET /api/health` on production returns all config flags `true`
- [ ] No 500 errors in Vercel Production Function logs

Send Ali a written confirmation covering: staging email block status, production auth paths
available, Hala's production role, sender identity, and result of desktop + mobile checks.
