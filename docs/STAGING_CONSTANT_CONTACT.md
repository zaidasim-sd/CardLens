# Staging scan integration

Use the existing `/scan` page. There is no separate integration workbench.

1. Sign in with an internal staging account.
2. Select an approved exhibition in the inline session section and start the session once.
3. Scan or upload a synthetic card, or use the existing manual-entry option.
4. Review the extracted fields. Use an address beginning `l71-test-` at `example.com`.
5. Submit through the existing review form. The operational Google Sheet saves first, followed by the protected register and Constant Contact.
6. Read both delivery statuses in the existing success dialog. Retry a failed provider delivery using the same reference.

The exact provider list is `Lead71 - Internal Integration Test - DO NOT SEND`. New contacts use `not_set` email permission. Existing unmatched provider contacts are preserved; no signup-form endpoint, campaign send or schedule is used.

The latest user instruction makes review-and-submit the explicit **staging** transfer approval. Production remains disabled and retains the requirement for separately agreed reviewer and permission rules.

## Isolation

`STAGING_INTEGRATION_ENABLED=true` is allowed only with `APP_ENV=staging`, the exact staging app base URL, a staging/test database, the dedicated register ID and a pinned hash of the user-confirmed internal Constant Contact OAuth subject. No client contacts are allowed by the synthetic-email guard.

`CC_STAGING_REGISTER_ID` identifies the staging workbook. `CC_STAGING_SUBJECT_HASH` pins the existing internal OAuth connection. Secrets remain in server settings; the existing rotating OAuth tokens are encrypted in staging MongoDB. Contact data stays in Google Sheets.

Eight protected master tabs store contacts, exhibitions, sessions, encounter links, responses, changes, sync logs and campaign references. The existing operational `Sheet1` remains the full capture destination. Two explicitly configured provider text fields retain event and capture provenance. No field or list is created during a scan.

## Verification

- `node --test server/integrations/stagingWorkflow.test.mjs server/integrations/stagingScanSubmission.test.mjs`
- `RUN_STAGING_LIVE_TEST=true node scripts/test-staging-scan-live.mjs` writes synthetic fixtures to real staging services and saves sanitised evidence under `artifacts/qa`.
- `RUN_STAGING_LIVE_TEST=true node scripts/test-staging-integration-live.mjs` verifies approved corrections, rollback, duplicate prevention and six response categories.

Campaign preparation through the API remains blocked by missing `campaign_data` scope. The application has no campaign-send path. Aventure account audit and production approval are not completed by staging tests.

To stop new staging transfers, set `STAGING_INTEGRATION_ENABLED=false` in the **staging project** and redeploy. This restores the existing submission-only Sheets path. No production project is changed.
