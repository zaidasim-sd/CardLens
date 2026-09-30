# CardSnap staging setup

1. Keep the separate Vision71 staging project and the `cardsnap_vision71_staging` database limited to fake or consenting Vision71 test data.
2. Restrict the Google Vision key to Cloud Vision only and set `GOOGLE_VISION_API_KEY` in Vercel and the ignored local environment file.
3. Create a Vision71 Google service account for internal testing. Set `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` outside the repository.
4. Share only the Vision71 test Sheet with the service account. Set `GOOGLE_SHEET_ID` and `GOOGLE_SHEET_TEST_ID` to that test Sheet while `SHEET_TARGET_APPROVED` remains false.
5. Set the actual Sheet tab name and numeric tab identifier, then run <code>npm run configure:sheet</code>. This writes the template headings, the four value status dropdown and a basic filter.
6. Before live use, Aventure creates or copies the approved template into its own Drive and shares that Sheet with the Vision71 service account email. Change the target only after written approval.
7. Add `APP_BASE_URL`, `CRON_SECRET`, `MONGODB_URI` and `BACKUP_KEY` to GitHub Actions.
8. Keep `ENCRYPTION_KEY` and `BACKUP_KEY` as different random 32 byte values.
9. Use <code>npm run seed:internal</code> with named email and password environment values to create or refresh internal accounts.
10. Recreate the Vision71 Support account immediately before its test because it expires after 24 hours.
11. Use the Approved CSV download for the agreed manual Constant Contact import. Do not configure an automatic Constant Contact route for Version 1.
12. Confirm the login service, database, image storage, cloud region, retention period, backup method, expected monthly cost and access list with Ali before creating any production resource.
