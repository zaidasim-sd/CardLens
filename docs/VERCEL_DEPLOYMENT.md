# Vercel deployment setup

The application uses twelve API functions. Constant Contact background processing and retention share one deployed cron function, with a rewrite preserving `/api/cron/constant-contact`. The local Express routes remain separate. Do not add another standalone API function on a Hobby project without consolidating a route.

In the owning Vercel project, set the following server-only variables for the intended environment and redeploy. Never prefix credentials with `VITE_`.

| Variable | Configuration |
| --- | --- |
| `MONGODB_URI` | Existing Atlas connection string |
| `MONGODB_DB` | Same database as the intended existing records |
| `ENCRYPTION_KEY` | Same encryption key used to save those records and OAuth tokens; changing it makes them unreadable |
| `GOOGLE_VISION_API_KEY` | Existing OCR API key |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `client_email` from the private service-account JSON |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | `private_key` from that JSON; literal `\n` escapes or actual newlines are supported |
| `GOOGLE_SHEET_ID` | Approved Exhibition Contact Review Register spreadsheet ID |
| `GOOGLE_SHEET_TAB` | `Sheet1` for the currently configured register |
| `GOOGLE_SHEET_TAB_ID` | `0` for the currently configured register |
| `SHEET_TARGET_APPROVED` | `true` for the authorized production register |
| `APP_TIME_ZONE` | `Asia/Karachi` for current capture-date configuration |
| `CC_CLIENT_ID` | Client ID of the existing Constant Contact application |
| `CC_CLIENT_SECRET` | Corresponding client secret |
| `CC_REDIRECT_URI` | `https://YOUR-DOMAIN/api/constant-contact?action=callback` |
| `CC_APP_RETURN_URL` | `https://YOUR-DOMAIN/users` |
| `CC_LIST_NAME` | `General Interest` for current list configuration |
| `CC_CUSTOM_FIELD_LABEL` | `Lead Source` for current field configuration |
| `CRON_SECRET` | Existing strong secret for protected background endpoints |

Do not copy the Windows `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` path to Vercel. Remove it from hosted environment variables and supply the email/private-key pair above. The local file is not part of a deployment. Do not upload the credential JSON to Git.

`CC_FROM_EMAIL` and `CC_FROM_NAME` are unused for contact transfer. OAuth access/refresh tokens live encrypted in MongoDB, not in environment variables. Keep `VITE_API_BASE_URL` unset for the same-origin deployment so the browser uses `/api`; never point the deployed browser to localhost.

Register the exact deployed `CC_REDIRECT_URI` in the Constant Contact application's allowed redirect URIs. If the deployment uses the same database, tenant and encryption key as the connected local app, its saved connection may already be available. Otherwise, connect from the deployed Users page. Inspect the connection status before reconnecting.

The local server's interval does not run on Vercel. Approval still attempts transfer immediately. For automatic retry, an external scheduler must send `POST /api/cron/constant-contact` with `x-cron-secret: <CRON_SECRET>`. Vercel's native cron calls use GET and are not configured for this POST endpoint. The administrator's Process pending transfers button also processes a batch.

After deployment, verify sign-in, a test capture appearing in the Sheet and review queue, duplicate review, approval, actual Constant Contact list membership and matching transfer status. Never mark live delivery verified based only on a successful frontend build.
