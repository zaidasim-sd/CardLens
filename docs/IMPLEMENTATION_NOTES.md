# Implementation notes

## Current status

On 2026/09/30, the required fetch, checkout of main and pull completed successfully. The local branch `impl/production-controls` was created from updated main at `b15d41a`.

Steps 1 through 5 are complete. `MONGODB_URI` was provided through the ignored local `.env` file. Atlas integration tests use isolated databases and fake named accounts and contacts. No secret value was printed or written to a tracked file.

Existing untracked documents, data and artifacts were preserved.

## Earlier Constant Contact work

The branch `origin/haroon` was inspected without modification at `d28be30`. It contains a separate pilot application using a SQLite store, workflow and tests, a Constant Contact module, validation scripts and historical validation artifacts. The Constant Contact module provides OAuth authorization, token exchange and refresh, JWT verification, contact lookup, list and custom field discovery, contact creation with list membership and source field mapping, and serialized transfer handling. Existing duplicates currently enter a possible duplicate state. That behavior requires adaptation to the approved duplicate handling requirement in Step 8. Historical artifacts do not establish that the new production flow passes.

The branch has not been merged. The merge belongs to Step 8 only. No manual Constant Contact test was run during this implementation session on 2026/09/30.

## Approved design decisions

Use the official MongoDB driver with a cached client, application encryption using AES 256 GCM, tenant filtering, named accounts, server sessions and server permission checks. Keep request handlers portable. Use GitHub Actions for image sweeps and encrypted backups. Keep demonstration mode enabled and use fake data only. Implement and verify each step in the specified order before committing it.

## Environment variable names

Names explicitly required by the brief are `MONGODB_URI`, `ENCRYPTION_KEY`, `BACKUP_KEY`, `GOOGLE_VISION_API_KEY`, `APP_BASE_URL`, `CRON_SECRET`, `ALLOWED_ORIGINS`, `OCR_SPACE_APPROVED`, `OCR_MONTHLY_CAP`, `SHEET_TARGET_APPROVED`, `CC_ENV`, `CC_REAL_ACCOUNT_APPROVED` and `DEMO_MODE`.

Step 1 adds `MONGODB_DB`, `MONGODB_TEST_DB`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME` and `SEED_TENANT_ID`. Step 2 adds `ENCRYPTION_KEY` and `ENCRYPTION_KEY_VERSION`. Step 4 adds `APP_BASE_URL` and `CRON_SECRET`. Step 5 adds `BACKUP_KEY`, `BACKUP_OUTPUT`, `RESTORE_MONGODB_URI` and `RESTORE_DB`.

Existing configuration names include `PORT`, `APP_ENV`, `APP_ORIGIN`, `OCR_PROVIDER_MODE`, `OCR_SPACE_API_KEY`, `CC_CLIENT_ID`, `CC_CLIENT_SECRET`, `CC_REDIRECT_URI`, `CC_LIST_NAME`, `CC_CUSTOM_FIELD_LABEL`, `CC_FROM_EMAIL`, `CC_FROM_NAME` and `DATA_KEY`. These names are inventory only and do not imply production approval. Sheets variable names remain to be defined during Step 7. No values are recorded here.

## Verification results

<table>
<tr><th>Item</th><th>Done when</th><th>Test name</th><th>Result</th></tr>
<tr><td>Step 1</td><td>Every role can perform only its allowed actions</td><td>One generated test for every role and action in <code>permissions.test.mjs</code></td><td>Pass, 64 role and action checks</td></tr>
<tr><td>Step 1</td><td>An assistant can access only its own drafts and tenant checks are enforced</td><td><code>assistant access is limited to a draft captured by that assistant</code> and <code>record checks reject another tenant</code></td><td>Pass</td></tr>
<tr><td>Step 1</td><td>A reviewer cannot approve a record captured by that reviewer</td><td><code>reviewer cannot approve a record captured by that reviewer</code></td><td>Pass</td></tr>
<tr><td>Step 1</td><td>A removed account cannot sign in and open sessions stop working</td><td><code>removed account cannot sign in and its open session stops working</code></td><td>Pass against Atlas</td></tr>
<tr><td>Step 1</td><td>A locked account cannot sign in with the correct password</td><td><code>locked account cannot sign in with the correct password</code></td><td>Pass against Atlas</td></tr>
<tr><td>Step 1</td><td>A Vision71 Support account stops working after 24 hours</td><td><code>Vision71 Support account stops working after 24 hours</code></td><td>Pass against Atlas</td></tr>
<tr><td>Step 1</td><td>Sessions enforce the approved lifetime and idle limit</td><td><code>session absolute and idle limits are enforced</code></td><td>Pass against Atlas</td></tr>
<tr><td>Step 1</td><td>CSRF tokens are tied to server sessions</td><td><code>CSRF token is tied to its server session</code></td><td>Pass against Atlas</td></tr>
<tr><td>Step 2</td><td>Records save and load from central storage</td><td><code>records save and load from central storage</code></td><td>Pass against Atlas</td></tr>
<tr><td>Step 2</td><td>No card data remains in browser persistence</td><td><code>browser source has no persistent card storage</code></td><td>Pass. IndexedDB packages and browser database code are removed.</td></tr>
<tr><td>Step 2</td><td>Stored contact and image values are unreadable ciphertext</td><td><code>stored contact and image values are unreadable ciphertext</code></td><td>Pass against direct MongoDB reads</td></tr>
<tr><td>Step 2</td><td>Every encryption uses a random IV and records a key version</td><td><code>encryption uses a random IV and records its key version</code></td><td>Pass</td></tr>
<tr><td>Step 2</td><td>One tenant cannot read another tenant record</td><td><code>tenant separation prevents reads from another tenant</code></td><td>Pass against Atlas</td></tr>
<tr><td>Step 2</td><td>Duplicate checks cover email, phone with at least 7 digits, and name with company across the tenant</td><td><code>duplicate checking covers tenant email phone and name with company</code></td><td>Pass against Atlas</td></tr>
<tr><td>Step 2</td><td>Administrator storage health reports use against the 512 MB limit and warns at 80 percent</td><td><code>storage health reports the free cluster limit to administrators</code></td><td>Pass against Atlas</td></tr>
<tr><td>Step 3</td><td>Every implemented action appends exactly one audit entry</td><td><code>implemented actions each append exactly one audit entry</code></td><td>Pass against Atlas</td></tr>
<tr><td>Step 3</td><td>Future controlled actions use the same append only writer</td><td><code>future controlled actions use the same append only audit writer</code></td><td>Pass for transfer, deletion, retention change, export and image deletion</td></tr>
<tr><td>Step 3</td><td>Audit entries never contain contact or card details</td><td><code>audit entries contain references and never contact details</code></td><td>Pass across every test audit entry</td></tr>
<tr><td>Step 4</td><td>An expired image is deleted on schedule and the deletion is logged</td><td><code>expired image is deleted by the sweep and logged</code></td><td>Pass against Atlas</td></tr>
<tr><td>Step 4</td><td>Retention 0 never stores an image</td><td><code>retention 0 never stores an image</code></td><td>Pass against Atlas</td></tr>
<tr><td>Step 4</td><td>Deleting a record removes its image and contact fields</td><td><code>administrator deletion removes image and contact fields and is logged</code></td><td>Pass against Atlas</td></tr>
<tr><td>Step 4</td><td>Retention limits, cron secret and TTL safety index are enforced</td><td><code>retention bounds and protected sweep secret are enforced</code></td><td>Pass</td></tr>
<tr><td>Step 5</td><td>A restore into a separate empty test database succeeds and counts match</td><td><code>restore into a separate empty database matches collection counts</code></td><td>Pass against Atlas with 1 card, 1 user, 1 list and 1 setting</td></tr>
<tr><td>Step 5</td><td>The encrypted backup contains no readable card text</td><td><code>backup file contains no readable card or user text</code></td><td>Pass</td></tr>
<tr><td>Step 5</td><td>Excluded collections and password hashes are absent</td><td><code>backup excludes images sessions attempts limits and password hashes</code></td><td>Pass</td></tr>
<tr><td>Step 5</td><td>Restore refuses a database that contains records</td><td><code>restore refuses a database that is not empty</code></td><td>Pass</td></tr>
</table>

The Step 1 suite passed 72 tests on 2026/09/30. The Step 2 suite passed 7 tests on 2026/09/30. The Step 3 suite passed 3 tests on 2026/09/30. The Step 4 suite passed 4 tests on 2026/09/30. The Step 5 suite passed 4 tests on 2026/09/30. The TypeScript build passed after these steps. Lint completed with warnings and no errors. Steps 6 through 9 have not started. The verified restore result is recorded in `docs/RESTORE_TEST.md`.

## Assumptions to confirm

1. The database named by `MONGODB_TEST_DB`, defaulting to `cardsnap_step1_test`, is reserved for automated tests with fake records. A separate empty database is required for the Step 5 restore test.
2. The existing untracked privacy documents remain untouched. Their contents will be compared with the implementation during Step 9.
3. Named accounts use an email address plus a tenant identifier at sign in because the brief does not define a separate account name field.
4. The sign in IP limit is 20 attempts in 15 minutes because the brief requires a per IP limit without specifying the count.
5. Removing an account is a soft removal so references remain valid. The account is excluded from authentication and all its sessions are deleted immediately.
6. The setup file records Sheets configuration as pending because its exact variable names are not specified in the brief.
7. Restored user records intentionally omit password hashes as required. A person must seed or recreate administrator credentials and reset named accounts after a disaster restore.

## Open items

1. Ali must resolve the Vercel Hobby restriction to non commercial use. The hosting plan has not been changed.
2. The Atlas network allowlist needs to be open under the proposed Vercel arrangement because Vercel has no fixed outbound addresses. A person must review this deployment requirement.
3. Atlas Free provides 512 MB total storage, limited connections, no automatic backups and no database audit. The planned application controls and backup workflow are not implemented yet.
4. MongoDB TTL image deletions are not written to the application audit log. The planned sweeper is the primary audited deletion mechanism.
5. A person must check the Google Vision free monthly quota and any payment card requirement before enabling it. The planned default monthly request cap is 900.
6. Move local secret configuration to `.env.local` before deployment setup is finalized. The current ignored `.env` file was accepted for Step 1 verification.
7. Sheets mapping and destination, Constant Contact mapping and destination, and any OCR.space use require the approvals described in the brief. Real destination approval flags must remain false.
8. A person must generate and configure the production `ENCRYPTION_KEY`. Step 2 tests generate an unrecorded temporary key at run time.
9. A person must add `APP_BASE_URL` and `CRON_SECRET` to GitHub Actions and Vercel before the hourly image sweep can run outside tests.
10. A person must generate `BACKUP_KEY` separately from `ENCRYPTION_KEY` and add `MONGODB_URI` and `BACKUP_KEY` to GitHub Actions before scheduled backups can run.
