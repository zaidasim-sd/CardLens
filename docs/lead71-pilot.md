# Lead71 pilot flow and Google Sheet setup

## Current scope: submission only

`config/pilot.json` now sets `submissionOnlyEnabled: true`. Capturers scan/upload
or enter a card, check/edit OCR details and submit directly to the configured
client Sheet. The contact remains encrypted in MongoDB for reliable delivery.
The capturer Review Queue links and success-screen queue action are hidden;
`/submissions` redirects to capture (or account administration for administrators).
The previous queue, reviewer roles, status sync and integration implementations
remain in source behind clearly commented pilot switches.

The client Sheet now has headers in row 1, with contact records starting in row 2.
The former merged section-title row and placeholder-only note row were removed;
existing contact records were preserved. The headers are:
`CardSnap record ID`, `Place/Exhibition`, `Contact Name`, `Company Name`,
`Job Title`, `Email Address`, `Phone Number`, `Short Notes`, `Date Captured`,
`Time(GMT-4)`, `Captured By`. Column order may change; fields match by heading.
No status, reviewer-comment or duplicate-flag column is required. Duplicate
checking still warns inside Lead71 before a separate contact is submitted.

The gateway only writes contact data. It does not create columns, alter headings,
change formatting or configure dropdowns. **Do not run `npm run configure:sheet`**
in this mode; the gateway deliberately refuses that command. Configurable header-row offsets
and the existing record-ID column ensure retries update the same physical record,
even after rows are sorted. Date and time are written separately in fixed GMT-4.

Backend environment variables remain `GOOGLE_SHEET_ID`, `GOOGLE_SHEET_TAB`,
`SHEET_TARGET_APPROVED=true`, `GOOGLE_SERVICE_ACCOUNT_EMAIL` and the matching
`GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`. The complete credential pair takes priority
over `GOOGLE_SERVICE_ACCOUNT_KEY_FILE`. Optional layout overrides are
`GOOGLE_SHEET_HEADER_ROW=1` and `GOOGLE_SHEET_CAPTURE_TIME_ZONE=Etc/GMT+4`.
Share the Sheet with the service account as Editor. Restart the local backend
after edits; Vercel environment changes require a new deployment.

Sheet status polling is paused. Old failed testing-Sheet jobs are not automatically
sent to the client Sheet. New contacts are saved with their destination Sheet;
the administrator retry endpoint only processes failed jobs for that destination.
On delivery failure, the capture confirmation explicitly says delivery is pending
and asks the capturer to contact the administrator rather than create another copy.

Validation: production build and 149 automated tests passed. A temporary contact
was submitted to the configured client Sheet and retried; it appeared once and
the existing headers stayed unchanged. The temporary Sheet row and test-database
records were then removed. See `submissionSheet.integration.test.mjs` for coverage
of row-2 headers, date/time rollover, sorted rows, retry deduplication, untouched
client data, disabled status polling and refusal of schema configuration.

To restore the prior Google Sheet review pilot, set `submissionOnlyEnabled=false`
and select a Sheet with the review-pilot headers described below. The preserved
tests and `scripts/pilot-live-smoke.mjs` explicitly exercise that earlier mode.

## Preserved earlier scope: Google Sheet review pilot

## What changed

Capturers scan, upload, or enter a contact, check/edit the details and submit. The
backend saves the encrypted contact in MongoDB and sends it directly to the
configured Google Sheet as **Pending Review**. No Lead71 approval step is required.

Reviewers work in Google Sheets using **Pending Review**, **Approved**, **Needs
Correction**, or **Rejected**, and can add **Reviewer Comment**. Capturers see the
same status and comment in their queue. Needs Correction opens the correction
form; resubmission changes the same Sheet record back to Pending Review. Rejected
contacts stay visible in history. Existing duplicate detection remains a warning;
it does not prevent the person reviewing in Sheets from approving a flagged row.

The Reviewer account/dashboard and internal approval/duplicate-resolution workflow
are paused. Administrators retain administration and export permissions, without
approval authority. Existing support access remains preserved.

Constant Contact UI, automatic transfers, cron/manual transfers and transfer status
displays are paused. Existing routes, roles, integrations, credentials, tokens,
components and implementations remain in the code/database. `PILOT` comments mark
the disabled branches. Shared switches are in `config/pilot.json`:

```json
{
  "internalReviewEnabled": false,
  "constantContactEnabled": false,
  "historicFieldsEnabled": false,
  "sheetPollIntervalMs": 30000
}
```

Historic fields remain stored and their columns are hidden in the existing Sheet.
New pilot writes do not populate those columns or clear existing historic values.
The original 19-column gateway is retained as `createLegacySheetGateway` and the
original complete mapping remains in `config/sheetMapping.json`. Restoring a
broader workflow requires restoring the corresponding switches, rebuilding, and
configuring a compatible broader Sheet layout; simply enabling a role does not
migrate a new 13-column pilot tab into the old layout.

## Synchronization

The visible review queue requests `/api/cards` when opened, then every **30 seconds
after the previous request finishes**, and when the browser tab becomes visible.
The backend reads Sheets and updates the corresponding MongoDB contacts before
returning queue records. A MongoDB lease throttles Sheet checks per tenant to at
most once every 30 seconds across users/server instances. An ongoing check may
cause another request to return the last saved state; it catches up on the next
poll. There is no Google push subscription or permanent background process.

When nobody has the queue open, polling stops. The next queue visit checks again.
Google credentials and Google API calls stay entirely on the backend. Status and
comment changes, including a changed/cleared comment with unchanged status, sync.
Unknown statuses and blank IDs are not imported; required/duplicate headings or
duplicate IDs produce a visible sync warning instead of overwriting records.

The MongoDB contact ID is the stable identifier. New tabs use a hidden **Contact
ID** column. Existing **CardSnap record ID**, **Lead71 record ID**, and **Record ID**
headings are also supported. Do not edit, duplicate or discard these IDs. Blank-ID
rows entered directly into Sheets are not imported as new Lead71 contacts.

Writes find the ID again instead of trusting cached row numbers. Per-contact
leases prevent concurrent retries from inserting the same contact twice. If an
insertion response is lost, the retry finds the existing ID and updates that row.
Human edits/sorting should be done between sync operations; Sheets has no atomic
"update where Contact ID equals" operation to lock out a simultaneous manual sort.

Failed/outstanding writes stay saved in MongoDB and are retried, up to two per
backend check, while a queue is open. Errors stay visible; the UI does not pretend
a failed write reached Google. Outbound resubmission markers and conditional
database updates prevent a stale poll from undoing corrections. Existing legacy
successful inserts with a `pending` sync marker are read rather than resent over
the person's Sheet review. Reviewer comments are preserved during resubmission.

## Server configuration

```dotenv
MONGODB_URI=<existing MongoDB connection string>
MONGODB_DB=cardsnap
ENCRYPTION_KEY=<keep the existing encryption key>
GOOGLE_SHEET_ID=<spreadsheet ID>
GOOGLE_SHEET_TAB=Contacts
GOOGLE_SERVICE_ACCOUNT_EMAIL=<service account client_email>
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=<matching private_key>
SHEET_TARGET_APPROVED=true
```

Do not rename the MongoDB database or rotate the encryption key for this change.
Existing optional variables remain supported: `MONGODB_DNS_SERVERS`,
`ENCRYPTION_KEY_VERSION`, `GOOGLE_SHEET_TEST_ID`, `APP_TIME_ZONE`, and
`SHEET_REVIEWER_NAME`. The reviewer label is configurable; the Sheets values API
does not identify the individual person who edited a cell.

For local development, `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` can point to an existing
credential JSON **outside the repository**. Its `client_email` and `private_key`
are used when no complete email/key pair is configured. An explicit complete pair
takes precedence over a leftover file path. Vercel never reads the local file.
Do **not** set a local file path on
Vercel. Use the separate email/key variables there. Escaped `\n` in a hosted key is
normalized. Never use `VITE_` variables for Google credentials.

`GOOGLE_SHEET_TAB_ID` is retained for the old workflow; the pilot resolves the tab's
numeric ID using `GOOGLE_SHEET_TAB`, so this number need not be provided. The tab
must exist; configuration creates/repairs headings, not the tab itself.

`GOOGLE_VISION_API_KEY` and existing OCR configuration remain needed for scanning,
but do not change when switching Sheets. No Constant Contact credentials are
required for the pilot. `CC_ENABLED=false` can remain set; the shared pilot switch
also blocks transfers even if legacy credentials exist.

## Exact steps to use a different Google Sheet

1. Create/select the spreadsheet and create a tab, for example **Contacts**.
2. Copy the ID between `/d/` and `/edit` in the URL:
   `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit#gid=0`.
   The `gid` number is the tab ID, not the spreadsheet ID.
3. Share the spreadsheet as **Editor** with the exact service-account
   **client_email** from your JSON credential. This is the value of
   `GOOGLE_SERVICE_ACCOUNT_EMAIL` on Vercel, or `client_email` inside the local
   `GOOGLE_SERVICE_ACCOUNT_KEY_FILE`. Use the service account, not a personal
   Google login. Protected ranges must permit this account to write system fields.
4. Set `GOOGLE_SHEET_ID` to the new ID and `GOOGLE_SHEET_TAB` to the exact tab name,
   including spaces/case. Set `SHEET_TARGET_APPROVED=true` for the authorized live
   register. `GOOGLE_SHEET_TEST_ID` is optional and should identify a test register;
   a configured test target is permitted without the production approval flag.
5. Keep the existing service-account email/private key if the same account is used.
   Only replace the email and key (as a matching pair) if switching service accounts.
   Clear `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` on Vercel so it cannot override the pair.
6. Run **`npm run configure:sheet`** from the project folder with backend environment
   values for the new target. It writes/repairs row-one headers, adds the dropdown,
   freezes the header row, protects system fields, and hides internal/historic
   columns. An empty tab receives the headers automatically. Existing headers/data
   are preserved, with missing pilot headers added at the end. It rejects ambiguous
   duplicate headings. Normal submissions do not silently create or repair headers.
7. Restart the local backend after changing `.env`. On Vercel, update the Production
   environment values and redeploy so the new values reach the deployed functions.
8. Submit a sample contact, then change its Record Status and Reviewer Comment in
   Sheets and open the Lead71 queue to verify the connection.

Required row-one headers (column order does **not** matter):

- Exhibition / Source
- Contact Name
- Company Name
- Job Title
- Email Address
- Phone Number
- Short Notes
- Date Captured
- Captured By
- Record Status
- Reviewer Comment
- Possible Duplicate Flag
- Contact ID (hidden; one of the existing ID aliases above is also accepted)

Header matching ignores surrounding spaces and case. Avoid renaming headings into
unrecognized labels. Column positions are found by heading, not a fixed letter.
Possible Duplicate Flag is retained because duplicate checking already exists.

Changing Sheets does **not** automatically copy all historical contacts into the
new spreadsheet. If historical rows need to continue being reviewed, copy their
data **including the original Contact IDs** into the new tab before switching.
New submissions and corrected/resubmitted contacts then use the new target. A
missing contact in the new target is inserted once with its existing ID; unrelated
rows are not matched by email or guessed from row position.

No Google Cloud change is needed when keeping the same enabled Sheets API and
service account. For a new Cloud project/account, enable **Google Sheets API**,
create/configure the service account's credentials, and grant the new account
Editor access. Vision configuration is separate and can remain unchanged.

The currently configured local service account is
`cardsnap@cardsnap-510210.iam.gserviceaccount.com`. The name can stay unchanged
after the Lead71 rebrand. If Production uses a different account, share with the
Production account's configured email instead.

## Verification and deployment

`npm run test:pilot` exercises the real backend with a dedicated MongoDB test
database and simulated Google responses: all statuses, same-status comments,
correction/resubmission, sorted rows, duplicate warnings, lost insertion responses,
concurrent retries, polling throttle, paused roles and paused Constant Contact.
Legacy tests explicitly enable the preserved broader features in isolated test
processes to keep regression coverage.

For an explicit live smoke test, set `RUN_LIVE_PILOT_TEST=true` and run
`node scripts/pilot-live-smoke.mjs`. This requires `GOOGLE_SHEET_TEST_ID` and a
MongoDB database whose name includes `test`. It creates its own temporary tab,
uses fictional contacts, tests real Google insertion and review/resubmission,
then cleans up only that tab and its own tenant's test records.

Code changes are local until pushed/deployed. Production needs the correct Sheet
configuration and sharing, then deployment and a pilot account smoke check.

## Files changed

- `.env.example`
- `config/pilot.json`
- `docs/lead71-pilot.md`
- `package.json`
- `scripts/bootstrap-tests.mjs`
- `scripts/pilot-live-smoke.mjs`
- `server/audit/service.integration.test.mjs`
- `server/auth/permissions.js`
- `server/auth/permissions.test.mjs`
- `server/auth/service.integration.test.mjs`
- `server/auth/service.js`
- `server/cards/duplicateReview.integration.test.mjs`
- `server/cards/duplicateReview.js`
- `server/cards/service.integration.test.mjs`
- `server/cards/service.js`
- `server/export/service.js`
- `server/http/cardHandlers.js`
- `server/http/constantContactCron.js`
- `server/http/constantContactHandler.js`
- `server/index.js`
- `server/integrations/constantContact.js`
- `server/integrations/constantContact.test.mjs`
- `server/integrations/pilotFlow.integration.test.mjs`
- `server/integrations/sheetService.js`
- `server/integrations/sheetService.test.mjs`
- `server/pilot.js`
- `server/retention/service.integration.test.mjs`
- `src/components/auth/ProtectedRoute.tsx`
- `src/components/layout/Header.tsx`
- `src/components/layout/MobileNav.tsx`
- `src/components/scanner/OCRReviewModal.tsx`
- `src/components/verified/EditContactModal.tsx`
- `src/config/pilot.ts`
- `src/lib/api/contacts.ts`
- `src/pages/HomePage.tsx`
- `src/pages/SignInPage.tsx`
- `src/pages/UserAdminPage.tsx`
- `src/pages/VerifiedQueuePage.tsx`
