# Lead71 production Constant Contact release

Prepared 7 November 2026 for Haroon, Zaid and Ali. Main baseline: `1f49bcfae298d01bad1ddf04ef53f80f99bfb15f`.

## What this change includes

The existing main single card capture, Vision OCR, Gemini/baseline mapping and editable review form stay in use. This change adds:

1. A shared exhibition default that an administrator can set, change or end. Each scanner may override it for an individual contact without changing the shared default or losing edited fields and short notes.
2. Google Sheet first submission, followed by a verified transfer to one Constant Contact list. The existing production Sheet schema and field mapping are unchanged. No tabs, headers, custom provider fields or migrations are introduced.
3. A separate production Constant Contact connection screen and OAuth callback.
4. Independent Sheet and Constant Contact delivery status. A provider failure preserves the confirmed Sheet record.
5. Receipt-based duplicate protection, safe retries with the original reference and a stop for uncertain provider creation.

The new adapter is off until `CC_ENABLED_PRODUCTION=true` is configured. A separate write gate supports authorisation before contact delivery. The existing second-person review queue remains disabled by the pilot configuration; the person's review and Submit action triggers this adapter. This is not marketing consent.

Batch capture, compression/comparison screens, staging qualification experiments, staging account/role settings and staging credentials are not included. Main's exhibition catalogue is preserved.

## Exact destination and permitted operations

Name: `Lead71_MasterSheet_CreatedOn:5thNov2026`

ID: `dac5ef72-d908-11f1-a1dc-02420a320002`

Both are fixed in code and checked against configured values and the provider's metadata. The allowed provider operations are:

* GET metadata for that exact list ID.
* POST a new contact with that sole list membership, `create_source=Account` and `permission_to_send=not_set`.

All other list IDs, account-wide list/contact searches, existing-contact reads, updates, deletes, imports, extra memberships, consent escalation and campaign endpoints are refused before a provider request. The application never uses a search or upsert to work around an existing email conflict.

OAuth itself is not list-scoped. The application code enforces the restriction. A new contact is necessarily created in Constant Contact's normal account contact directory, but its sole explicit list membership is the approved list. No campaign or automation send is requested by this code.

## Production environment settings to add or update

Haroon supplies the existing production application values through protected Vercel settings. Do not paste secret values into Git, screenshots, messages or this document.

In the **Production environment of the live `sd-5acd/lead71` Vercel project**, use:

```dotenv
APP_ENV=production
APP_BASE_URL=https://lead71.com

CC_ENABLED_PRODUCTION=true
CC_WRITES_ENABLED_PRODUCTION=false

CC_API_KEY_PRODUCTION=<existing production application's client ID>
CC_CLIENT_SECRET_PRODUCTION=<existing production application's client secret>
CC_LIST_NAME_PRODUCTION=Lead71_MasterSheet_CreatedOn:5thNov2026
CC_LIST_ID_PRODUCTION=dac5ef72-d908-11f1-a1dc-02420a320002
CC_REDIRECT_URI_PRODUCTION=https://lead71.com/api/constantcontact?action=callback

VITE_IS_STAGING=false
```

The two credential placeholders above must be replaced with the production application's actual values. The adapter reads only `CC_API_KEY_PRODUCTION` and `CC_CLIENT_SECRET_PRODUCTION`, never `_STAGING_PRODUCTION` or generic legacy credentials. It refuses missing production credentials even if staging credentials are present.

Leave `CC_WRITES_ENABLED_PRODUCTION=false` for the first deployment and authorisation. After Ali connects the production application successfully and confirms the approved destination, change it to `true` and redeploy that production project to activate delivery.

Remove or keep unset in the live project:

```text
CC_API_KEY_STAGING_PRODUCTION
CC_CLIENT_SECRET_STAGING_PRODUCTION
CC_STAGING_TEST_MODE
CC_LOCAL_TEST_MODE_PRODUCTION
CC_STAGING_ALLOW_REVIEWED_CONTACTS
CC_STAGING_TEST_CONTACT_EMAIL
STAGING_INTEGRATION_ENABLED
STAGING_ADMIN_EMAILS
```

The new adapter refuses staging/local test modes if explicitly enabled. No staging application tokens or refresh tokens should be copied into production. The production connection uses its own encrypted namespace keyed by production client ID, tenant and approved list ID.

## Existing production settings to retain and verify

Do not copy the local `.env` into production. It contains testing targets. Keep the current production values for:

* `GOOGLE_SHEET_ID`, `GOOGLE_SHEET_TAB`, existing header/timezone settings and `SHEET_TARGET_APPROVED=true` for the already approved production register.
* `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`. Hosted operation uses the complete server-side credential pair, not a workstation file path.
* `MONGODB_URI` and `MONGODB_DB` for production operational state.
* Firebase configuration, notification/SMTP configuration and the existing authorised production administrator settings. This change does not alter production users or passwords.
* A stable `ENCRYPTION_KEY` (or the existing supported `DATA_KEY` fallback). It must decode to 32 bytes. Do not rotate an existing key during this release: it protects encrypted tokens and receipt digests.
* The existing Vision key and Gemini key/model settings. To use the AI path on main, ensure `ENABLE_AI_MAPPING=true` with the already validated production Gemini credentials/model and appropriate quotas. Those values were not changed or tested with live provider calls in this port.
* `ALLOWED_ORIGINS` must include `https://lead71.com`; retain other explicitly approved production origins rather than replacing the setting blindly.

No values for these existing secrets were read into a report or committed. No production environment setting was changed by this implementation.

## Zaid deployment handoff

The user requested code first and a later deployment by Zaid. Therefore `vercel.json` contains:

```json
"git": { "deploymentEnabled": { "main": false } }
```

This prevents Vercel's native Git integration from automatically deploying a main push. It does not change the staging branch configuration. Future automatic main deployments remain disabled until this setting is deliberately changed. Reference: https://vercel.com/docs/project-configuration/git-configuration

After the protected production settings above are added, Zaid should use a clean checkout of the pushed main commit and his authorised Vercel account. Verify the linked project before any deployment. An explicit manual CLI deployment can be performed from that clean checkout:

```powershell
git fetch origin main
git checkout main
git pull --ff-only origin main
vercel link --scope sd-5acd --project lead71
# Confirm this is the live lead71 project, not the staging project.
vercel deploy --prod --scope sd-5acd
```

Do not run these Git checkout commands in the dirty `D:\CardLens` working copy. Use a clean release checkout. Do not blindly redeploy an older deployment and assume it contains the new commit or environment values.

The main code implements only the approved single card flow. Do not enable the old global Constant Contact pilot flag to activate this adapter. The new flag delegates the existing function to the restricted adapter, and the legacy background transfer cron is blocked while it is active.

## Production authorisation

1. Verify the production application is the separate production registration, with Authorization Code Flow and rotating refresh tokens.
2. Verify its registered redirect URI is exactly `https://lead71.com/api/constantcontact?action=callback`. Do not add or reuse the staging redirect for this registration.
3. After the new deployment and with writes still paused, a callback GET without parameters must return HTTP 400. Callback POST must return HTTP 405. An unauthenticated status request must require sign in. These checks do not write contacts or Sheets.
4. Ali signs in to Lead71 with an authorised production administrator account, opens Team and settings, and selects Connect Constant Contact.
5. Ali signs in privately to the intended Constant Contact account and approves only `contact_data offline_access`. He should use the same browser flow so state and nonce cookies are preserved.
6. The callback consumes one-time state, checks the active administrator session, exchanges the code, encrypts tokens and verifies only the approved list metadata. A failed reconnect clears stale list verification so an older account's status is not reused.
7. Confirm Connected and the exact approved list ID. Then set `CC_WRITES_ENABLED_PRODUCTION=true` and have Zaid redeploy to activate contact delivery.
8. No production Sheet test row or live provider contact creation was performed by this implementation. Any first business submission or final live test requires the existing owner approval and must use only the approved list. Do not use dummy writes to the production Sheet merely to validate this code.

The callback is an OAuth endpoint, not a contact ingestion webhook. Missing/invalid parameters and provider access denial are handled without token exchange. No campaign permission is requested.

## Failure behaviour and operational limits

* If the new feature is disabled, the original Sheet-only flow continues.
* If Sheet delivery fails or is unconfirmed, no Constant Contact delivery is attempted.
* Before delivery, the unique saved reference, exhibition, name, company, title, email, phone, short notes and captured-by value are matched to the reviewed record.
* A provider failure never rolls back a confirmed Sheet save. The UI reports the separate provider state.
* No email means Sheet-only eligibility, with email required for Constant Contact. No fake email is generated.
* Existing email conflict preserves that existing contact and stops delivery. It does not search, update, move or add an existing contact to the list.
* Completed submission and delivery receipts prevent repeated Sheet append and contact creation for the same reference. Changed details cannot reuse a completed delivery reference.
* A definite retryable provider failure can use Retry Constant Contact only. The original capturer, session, CSRF token and completed Sheet receipt are required.
* A timeout, provider server error or malformed successful create response can be uncertain. Automatic resend is blocked for administrator reconciliation, including after restart.
* There is no automatic Sheet watcher, backfill worker, offline queue or sync of later manual Sheet edits.
* Core name/company/title payload components are limited to 50 characters and phone to 25 by the existing adapter. The Sheet retains the reviewed full fields. Short notes and exhibition context are preserved in the Sheet rather than automatically added as Constant Contact custom fields.
* Current delivery state is returned to the UI and stored as metadata receipts. This change does not add or update a Sheet transfer-status column after the provider response.

Emergency rollback is `CC_WRITES_ENABLED_PRODUCTION=false` and an owner-controlled redeployment. Sheet capture continues. Do not resend uncertain creates or modify any existing client contact to reconcile them without explicit approval.

## Validation

All live transports in these tests use fixtures/mocks. No production Sheet, database or Constant Contact account was contacted for validation.

The targeted suite covers production-only credential selection, exact callback and scopes, malformed callbacks, other-list/operation refusal, verified Sheet-first delivery, provider failures, notes and exhibition preservation, concurrency, existing-email conflicts, token refresh, failed reconnect, original-reference retry and shared exhibition permissions/version conflicts.

Commands and final test totals are recorded in `docs/PRODUCTION_CONSTANT_CONTACT_VALIDATION.md`. The build passes. Lint reports no new errors; an existing React Hook Form / React Compiler compatibility warning remains.

Authentication checks now use explicit administrator configuration and Firebase approval-settings fixtures. Registration keeps an existing pending approval without sending repeat notifications, approval tokens are excluded from logs, rejected sign-ins use a valid audit outcome, and sessions require a matching Firebase UID. No live user, password or role settings were changed. Older sessions without Firebase identity must sign in again.
