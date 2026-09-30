# Implementation notes

## Current status

The work is on the `haroon` branch. `main` remains unchanged at `b15d41a`. The earlier `origin/haroon` history was merged and its Constant Contact behavior was reviewed. The duplicate SQLite pilot and historical image corpus were excluded from the current MongoDB application.

The current Version 1 workflow is CardSnap capture, protected Google Sheet review, sender status display, Approved CSV export, then a manual import into the agreed Constant Contact list. There is no automatic Constant Contact route in Version 1.

The separate staging project is `cardsnap-vision71-staging`. It contains fake internal test data only. Named internal account records were created in the staging database. Their passwords are stored outside the repository in a local handoff file.

## Design decisions

1. MongoDB Atlas stores users, sessions, encrypted card records, encrypted images, settings, rate limits, transfer references and append only audits.
2. Contact fields, raw OCR text and images use AES 256 GCM with a random IV and key version.
3. Google Cloud Vision is the only OCR provider. Temporary failures receive two secure retries before the approved failure message appears.
4. The travelling user does not select a reviewer.
5. New submissions enter the Sheet as Pending Review with capture time and captured by values supplied by the server.
6. Hala reviews in the Sheet with Pending Review, Approved, Return for Correction or Rejected. The optional reviewer comment is read back by CardSnap.
7. The sender dashboard shows the latest Sheet status.
8. The CSV route exports Approved records only and protects every value against spreadsheet formula execution.
9. Constant Contact import is manual for Version 1. Direct integration requires a later review and approval.
10. Vision71 manages initial accounts and fixed form configuration. The internal administrator role does not represent an Aventure administrator.
11. Demonstration mode remains enabled and real Aventure data is prohibited.

## Environment variable names

`MONGODB_URI`, `MONGODB_DB`, `MONGODB_TEST_DB`, `ENCRYPTION_KEY`, `ENCRYPTION_KEY_VERSION`, `BACKUP_KEY`, `BACKUP_OUTPUT`, `RESTORE_MONGODB_URI`, `RESTORE_DB`, `APP_BASE_URL`, `ALLOWED_ORIGINS`, `CRON_SECRET`, `GOOGLE_VISION_API_KEY`, `OCR_MONTHLY_CAP`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, `GOOGLE_SHEET_ID`, `GOOGLE_SHEET_TEST_ID`, `GOOGLE_SHEET_TAB`, `GOOGLE_SHEET_TAB_ID`, `SHEET_TARGET_APPROVED`, `SHEET_REVIEWER_NAME`, `DEMO_MODE`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME`, `SEED_TENANT_ID`, `INTERNAL_TEST_TENANT_ID`, `INTERNAL_ALI_EMAIL`, `INTERNAL_ALI_PASSWORD`, `INTERNAL_ZAID_EMAIL`, `INTERNAL_ZAID_PASSWORD`, `INTERNAL_IBRAHIM_EMAIL`, `INTERNAL_IBRAHIM_PASSWORD`, `INTERNAL_HAROON_EMAIL`, `INTERNAL_HAROON_PASSWORD`, `INTERNAL_HASSAN_EMAIL` and `INTERNAL_HASSAN_PASSWORD`.

No secret value is stored in the repository.

## Verification results

<table>
<tr><th>Item</th><th>Done when</th><th>Test name</th><th>Result</th></tr>
<tr><td>Login</td><td>Named accounts, lockout, expiry, session revocation and CSRF work</td><td>Authentication integration suite</td><td>Pass against Atlas</td></tr>
<tr><td>Roles</td><td>Each role can perform only its Version 1 actions</td><td>Generated role and action checks</td><td>Pass</td></tr>
<tr><td>Storage</td><td>Encrypted central records save and load with tenant separation</td><td>Card storage integration suite</td><td>Pass against Atlas</td></tr>
<tr><td>Browser storage</td><td>No card data remains in IndexedDB or localStorage</td><td>Browser source persistence scan</td><td>Pass</td></tr>
<tr><td>Audit</td><td>Controlled actions create reference only entries</td><td>Audit integration suite</td><td>Pass against Atlas</td></tr>
<tr><td>Retention</td><td>Expiry, zero retention and record deletion work</td><td>Retention integration suite</td><td>Pass against Atlas</td></tr>
<tr><td>Backup</td><td>Encrypted backup and empty database restore match counts</td><td>Backup and restore integration suite</td><td>Pass against Atlas</td></tr>
<tr><td>OCR</td><td>Session, CSRF, origin, limits, Google only calls, header key and retry work</td><td>OCR handler and provider suites</td><td>Pass</td></tr>
<tr><td>Sheet</td><td>Pending rows are idempotent, formula safe and Sheet status updates the sender record</td><td>Google Sheet integration unit suite</td><td>Pass with mocked Google responses</td></tr>
<tr><td>CSV</td><td>Only Approved rows export and formula values are safe</td><td>Approved CSV export suite</td><td>Pass</td></tr>
<tr><td>Build</td><td>The production client compiles</td><td><code>npm run build</code></td><td>Pass</td></tr>
</table>

The detailed dated evidence is in `TEST_REPORT.md`. The verified restore counts are in `docs/RESTORE_TEST.md`.

## Assumptions to confirm

1. The address written as `ibrahim@vision71tech,com` was treated as `ibrahim@vision71tech.com` because the comma appears to be a typing error.
2. Muhammad Ali Zakaria is the Vision71 Administrator, Zaid and Ibrahim are Capturers, Haroon is the internal Reviewer account, and Hassan is Vision71 Support. These internal roles can be changed by Vision71.
3. Hala does not need a CardSnap login for Version 1 because review takes place in the Aventure owned Sheet.
4. `Hala` is the default reviewed by value when CardSnap first reads a changed Sheet status.
5. The Sheet tab name and the final Aventure owned Sheet identifier will be confirmed before live pilot use.
6. Security verification means named password authentication and server session checks for Version 1. No separate second factor behavior was specified for application users.
7. Vision71 Support expires 24 hours after account creation and must be recreated for a later test session.
8. The test database is reserved for fake or consenting Vision71 data.

## Open items

1. Ali must resolve the Vercel Hobby restriction to non commercial use before any commercial pilot.
2. The Atlas network allowlist needs to permit Vercel because Vercel has no fixed outbound addresses. A person must review this exposure.
3. Atlas Free has 512 MB total storage, limited connections, no automatic backups and no database audit.
4. MongoDB TTL image deletion is a safety net and is not written to the application audit. The application sweeper is the audited path.
5. A person must confirm the Google Vision free quota and whether the chosen account can remain free without a payment card. The application cap defaults to 900 requests each month.
6. `GOOGLE_VISION_API_KEY` is not currently available for staging.
7. The Google service account email and private key are not currently available. The test Sheet therefore has not received a live API row and its dropdown has not been configured by the backend script.
8. Aventure must create or copy the approved template into its own Drive and share only that Sheet with the Vision71 service account before live use.
9. GitHub Actions still need `APP_BASE_URL`, `CRON_SECRET`, `MONGODB_URI` and `BACKUP_KEY`.
10. The Vercel GitHub application could not attach the private repository to the new staging project. Deployment through the authenticated CLI works, but automatic deployment on each `haroon` push remains pending.
11. Mobile capture and review need a manual device run after the corrected staging deployment.
12. The short demonstration video remains pending until Google Vision and Sheet service account values are supplied.

## Document differences for review

1. The existing Privacy Notice describes browser storage. The implementation now uses encrypted central MongoDB storage.
2. The existing Privacy Notice describes Google Vision with an OCR.space fallback. The implementation uses Google Cloud Vision only.
3. The existing Privacy Notice says there is no application login or role control. Named accounts, server sessions and role checks now exist.
4. The existing Terms describe local duplicate checking. Duplicate checking now runs across the tenant on the server.
5. The existing documents say no manager approval workflow exists. Version 1 now uses the protected Google Sheet as the review place.
6. The existing documents describe no automatic retention. Image retention, an audited sweeper and a TTL safety net now exist.
7. The existing documents say Constant Contact is not connected. That remains accurate for Version 1. Approved contacts are exported to CSV for manual import.
8. The existing agreement draft describes the earlier browser prototype and unauthenticated OCR routes. Those descriptions are no longer accurate.
