# Lead71 Constant Contact controlled staging integration

## Current operating mode

After the successful single-contact test, the owner requested ongoing delivery of reviewed staging submissions. Set `CC_STAGING_ALLOW_REVIEWED_CONTACTS=true` with `CC_WRITES_ENABLED_PRODUCTION=true` for that mode. The designated single-email gate is then inactive. All other guards remain: exact staging origin, exact staging Sheet, separate application credentials, approved sole list membership, Sheet verification before delivery, idempotent submission references, and no existing-contact search or update. No campaign or consent change is permitted. An existing email conflict remains a visible delivery stop, not an upsert. The procedures below describe the initial controlled test and the available pause/cleanup process; ongoing delivery stays enabled until explicitly paused by the owner.

## Deployment and boundaries

Application URL: https://lead71-cc-staging.vercel.app/

OAuth callback: https://lead71-cc-staging.vercel.app/api/constantcontact?action=callback

This is an OAuth callback, not a webhook. A callback without valid parameters returns HTTP 400 and does not access the database or Constant Contact. Callback POST requests return HTTP 405.

The separate application credentials use `CC_API_KEY_STAGING_PRODUCTION` and `CC_CLIENT_SECRET_STAGING_PRODUCTION`. Hosted staging never falls back to production or legacy personal application credentials. Encrypted tokens use a separate application-specific staging namespace. New credentials must be entered only in protected staging settings.

Allowed destination: `dac5ef72-d908-11f1-a1dc-02420a320002`, named `Lead71_MasterSheet_CreatedOn:5thNov2026`. Both ID and name must match. OAuth scopes are exactly `contact_data offline_access`. OAuth grants account-level capabilities; the code restricts permitted operations independently.

Only one list metadata GET and new-contact creation into that list are permitted. Account-wide list enumeration, existing-contact lookup, updates, merges, deletion, campaign access and imports are refused. A provider conflict preserves the existing contact. No marketing consent is inferred.

Staging Sheet ID: `1ztzQ61buLJ4kCgxH2oHn9pXqIl36mQGTx4TVANL10sM`, tab `Sheet1`. The hosted adapter refuses a different Sheet, non-testing database name, wrong callback or wrong application origin. No production Sheet test is authorised.

## Required protected staging settings

```text
APP_ENV=staging
APP_BASE_URL=https://lead71-cc-staging.vercel.app
CC_STAGING_TEST_MODE=true
CC_ENABLED_PRODUCTION=true
CC_WRITES_ENABLED_PRODUCTION=false
CC_LOCAL_TEST_MODE_PRODUCTION=false
CC_API_KEY_STAGING_PRODUCTION=<separate application client ID>
CC_CLIENT_SECRET_STAGING_PRODUCTION=<separate application secret>
CC_REDIRECT_URI_PRODUCTION=https://lead71-cc-staging.vercel.app/api/constantcontact?action=callback
CC_LIST_ID_PRODUCTION=dac5ef72-d908-11f1-a1dc-02420a320002
CC_LIST_NAME_PRODUCTION=Lead71_MasterSheet_CreatedOn:5thNov2026
STAGING_INTEGRATION_ENABLED=false
VITE_IS_STAGING=true
```

Existing staging database, encryption key, Sheet service credentials and email isolation remain required. Old generic Constant Contact client credentials must not remain in the staging active deployment settings. No refresh token is entered manually; the server obtains and encrypts it after supervised authorisation. Do not change the encryption key while tokens or receipts remain.

`CC_STAGING_TEST_CONTACT_EMAIL` must identify the single designated internal contact before writes are enabled. Its absence blocks all Constant Contact contact creation. The separate write switch is initially false. Do not enable it before owner authorisation and designation of that contact. Background Constant Contact processing is disabled.

## Workflow and exhibition session

An administrator sets a shared exhibition default in Team and settings. Scanners receive that default on new review forms and may override it for an individual contact. The override does not change the shared session. Session changes preserve edited contact details and short notes. The server stores the reviewed exhibition rather than forcing an old browser session value.

Submission saves to the staging Sheet first. The server checks that the saved reference and reviewed core fields match before Constant Contact delivery. A separate delivery state is returned; provider failure never becomes a claim of delivery success. Core contact fields are sent to Constant Contact. Short notes and exhibition traceability remain in the Sheet and submission evidence; custom provider fields are not created by this integration.

Stable submission references, leases and delivery receipts block repeat delivery. A completed submission retry reuses its Sheet result. An uncertain provider timeout or response blocks automatic resend and requires reconciliation. An existing-email conflict does not trigger lookup or update.

## Supervised test

1. Verify the exact public callback returns 400 for missing or invalid parameters and 405 for POST. This is safe rejection, not completed authorisation.
2. Ali signs in to the staging app using an approved internal administrator account and opens Team and settings, then Connect Constant Contact.
3. Ali signs in to Constant Contact himself. Pause sharing for credentials. Confirm the separate staging application and only the two approved scopes.
4. Successful authorisation returns to the staging administration page. Confirm Connected and the exact approved list. Token exchange and list verification are the first authorised provider operations.
5. Agree on one designated internal contact, set its exact email in the protected staging setting, then enable the write switch and redeploy staging only. Confirm the list has no sending automation, as already checked by the owner.
6. Scan, review and submit that contact once. Record its submission reference, staging Sheet row and provider delivery reference. Do not use public or client cards.
7. Replay the same submission reference. Expect no additional Sheet append or provider contact creation. Do not generate a fresh reference for the duplicate test.
8. Test provider failures using mocks. If a live transfer becomes uncertain, stop rather than resend. Never inspect unrelated contacts to reconcile it.

## Cleanup and revocation

Pause writes immediately after the controlled test. Record the single test row, contact reference and result before any cleanup. The account owner must approve and perform any provider-side cleanup of only the newly created test contact; no existing contact may be deleted. Remove only the identified staging Sheet test row after approval.

Disable the staging integration, remove its encrypted staging token record through an authorised maintenance procedure, and have the owner revoke the staging application's account access through Constant Contact. Do not claim provider revocation merely because the local token was deleted or writes were paused. Record disable, cleanup and revocation separately as completed or outstanding. Production authorisation and deployment require separate written approval.

## Verification

Run `npm run build` and `node --test server/exhibitions/session.test.mjs server/integrations/stagingApplication.test.mjs server/integrations/sheetService.test.mjs server/notifications/stagingIsolation.test.mjs server/integrations/stagingWorkflow.test.mjs server/integrations/stagingScanSubmission.test.mjs`.

These automated tests use fixtures and mocked providers. They do not prove the live OAuth consent or real contact delivery. Those remain pending the supervised session. Client-domain email, registration and reset tests assert rejection before provider or SMTP access, including Vercel's active deployment slot with explicit staging identity.
