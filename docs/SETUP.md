# CardSnap setup

1. Create a MongoDB Atlas account and one Free cluster without a payment card. Choose a region and create a database user with access to the CardSnap database only. Provide `MONGODB_URI` in the ignored `.env.local` file. The connection was provided in `.env` and verified for Step 1. Move it to `.env.local` before deployment setup is finalized.
2. In Google Cloud, restrict the Vision API key to the Cloud Vision API only and provide `GOOGLE_VISION_API_KEY`.
3. Create a Google service account and a fake test sheet owned by Vision71. Share the sheet with the service account. The exact environment variable names for the Sheets implementation will be recorded in Step 7 before configuration is required.
4. Add the GitHub Actions secrets `APP_BASE_URL`, `CRON_SECRET`, `MONGODB_URI` and `BACKUP_KEY`.
5. Set all implementation environment variables in Vercel and in an ignored local `.env.local` file. Never send secret values through repository files or chat.
6. Generate `ENCRYPTION_KEY` and `BACKUP_KEY` as two different random 32 byte values. Their encoding will be documented when encryption is implemented.

Only free services requiring no payment card may be used. Stop if a setup action requires payment or a payment card.
