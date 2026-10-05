# CardSnap by Vision71 | Privacy Facts Sheet

**29 September 2026 | First draft | LIVE AVENTURE DATA: NOT APPROVED**

Source: commit `5d4279a` and working tree; live homepage checked; Vercel free tier confirmed by project owner. **C** = code-confirmed; **U** = unconfirmed operational fact; **G** = missing control. Evidence IDs: `05-evidence-and-launch-checklist.md`. Deployed revision is not verified; this is not readiness certification.

| Required fact | Confirmed finding / outstanding confirmation |
|---|---|
| Hosting/database and region | Vercel; owner confirms free tier. Live URL: https://cardsnapbyv71.vercel.app/ (HTTPS 200). Account, function region and deployed revision unconfirmed. **C:** Dexie/IndexedDB `BusinessCardScannerDB` is on each user's browser/device, with no fixed database region. Confirm commercial-plan eligibility. [E1-E2] |
| Card image storage / duration | **C/G:** Saving a reviewed contact persists the submitted image Blob, filename, raw OCR, extracted and reviewed fields in IndexedDB. No expiry; persists until deletion, browser clearing or eviction. Backend uses memory; no image disk/object-storage write found. Provider/host retention is separate. [E2-E4] |
| Automatic image deletion | **C/G:** None after review or transfer. Clearing a preview does not delete a saved record. No live transfer is implemented. [E2-E4,E8] |
| Secured Google backend | **C/G/U:** Server calls Google Vision over HTTPS using a server environment API key. No app authentication, authorization or rate limiter found; production ingress controls and key restrictions unconfirmed. Server-side does not establish a secured pilot. [E3-E6] |
| OCR.space production fallback | **C/U:** Default `both` mode tries Google first, then OCR.space after an exception or missing Google key. Production mode and credentials unconfirmed. Local `.env` contains neither OCR key. Empty successful OCR does not trigger fallback. [E5] |
| Third-party recipients | **C/U:** Vercel (host), Google Cloud Vision, and OCR.space (a9t9 software GmbH) can receive submitted images and visible card details. Hosting/support/log/backup subprocessors and locations require account verification. Constant Contact receives nothing through current code. Device backups and user-shared exports require inventory. [E1,E5,E8-E10] |
| Roles / access | **C/G:** No application roles or tenant isolation. A person using the same browser profile can access its records; duplicate review can display existing details/images. Queue masking is not anonymisation. Infrastructure/support access roster unknown. [E2,E6-E7] |
| Authentication | **C/G/U:** No user login, sessions, MFA or identity provider in app/API. OCR API keys authenticate the server to providers, not users. External deployment protection unconfirmed. [E3,E5-E6] |
| Backup / audit / deletion | **C/G/U:** No active backup/restore workflow or user audit trail found. Timestamps and console errors are not an audit log. A local record-delete helper exists, without a current UI action; archive only changes status. Device/host backups, logs and deletion periods unconfirmed. [E2,E7,E9] |
| Constant Contact | **C:** No OAuth callback, API client, token store or transfer exists. `CC_*` settings alone do not connect it. XLSX helper exists but current Export button is unwired; no data is currently transferred by the application. [E8] |
| Incident reporting | **G/U:** No implemented reporting/response process or confirmed contact. Proposed agreement requires notice without undue delay, within 24 hours of awareness; owners, channels and drill must be approved. [E9; agreement §9] |
| End-of-pilot Vision71 access | **G/U:** No automated offboarding. Require owner-led removal of hosting/cloud/repository/support access, token/key rotation, local-copy deletion and signed evidence; browser data needs device-level action. [E10; agreement §11] |

**Release gate:** confirm regions, commercial hosting eligibility, recipients/contracts, access, retention/deletion, incident owners and offboarding; review/sign the client agreement; reconcile public documents with the deployed build. Until then use only synthetic data. Technical owner: **pending**. Aventure approver: **pending**. Legal reviewer: **pending**.
