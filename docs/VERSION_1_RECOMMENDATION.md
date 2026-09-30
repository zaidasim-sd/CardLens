# CardSnap Version 1 recommendation for Ali

## Login and authentication

Use the CardSnap named account system with Node scrypt password hashes, server stored sessions, Secure and SameSite Strict cookies, CSRF checks, lockout and immediate session revocation. Vision71 creates the initial accounts. Hala reviews in the Sheet and does not need a CardSnap account for Version 1.

## Database

Use MongoDB Atlas Free for the internal test and pilot only if the commercial terms and network allowlist are accepted. Each record carries a tenant identifier. Contact content and images are encrypted by CardSnap before storage.

## Image storage

Keep encrypted images in the separate MongoDB `cardImages` collection for Version 1. Do not create Google Cloud Storage or another paid production resource until approved. Browser images are compressed below 500 KB before upload.

## Cloud provider and region

The staging application uses a separate Vercel project. The observed build region is Washington, D.C., USA. The MongoDB Atlas region must be recorded from the Atlas project before live use. Google Vision processing location and account terms must also be confirmed.

## Retention and deletion

Use 24 hours as the default image retention period. Administrators can choose 0 through 168 hours. The application sweeper is the audited deletion path. MongoDB TTL provides a two hour safety grace and does not create an audit entry.

## Backup

Run the Node backup script each day through GitHub Actions. It exports the required collections, omits images and credentials, compresses the data, encrypts it with a separate backup key and keeps the encrypted artifact for 30 days. A restore to a separate empty database has passed.

## Expected monthly cost

The design targets zero monthly service cost during internal testing by using MongoDB Atlas Free, Vercel Hobby, Google Vision within the configured free allowance and GitHub Actions allowances. This estimate needs provider account confirmation. Vercel Hobby has a non commercial restriction, and Google Cloud may require billing setup even when usage remains within a free allowance.

## Access

Capturers can submit and see their own records. Vision71 Administrators manage internal accounts, retention and Approved CSV export. Vision71 Support can see aggregate counts only and expires after 24 hours. Hala sees the Aventure owned review Sheet shared to the controlled service account. CardSnap has no automatic Constant Contact access in Version 1.
