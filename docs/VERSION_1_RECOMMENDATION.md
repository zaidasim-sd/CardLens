# CardSnap Version 1 one page recommendation

**Decision owner:** Ali Bhai  
**Scope:** Internal testing followed by the first Aventure exhibition  
**Status:** Recommendation only. No production resource should be created until written approval.

| Area | Recommendation |
|---|---|
| Login and authentication | Use the CardSnap named account system already implemented. It uses Node `scrypt` password hashes, server stored sessions, Secure and SameSite Strict cookies, CSRF protection, sign in rate limits, account lockout, eight hour maximum sessions, thirty minute idle expiry and immediate session revocation when an account is removed. Vision71 creates the initial named accounts. Hala reviews in the Sheet and does not need a CardSnap login for Version 1. |
| Database | Use a dedicated MongoDB Atlas Free database for internal testing. Keep every tenant separate and encrypt contact fields, OCR text and images in the application with AES 256 GCM. Use a database user restricted to the CardSnap database. Atlas Free has a 512 MB limit, no automatic backups and no database audit, so usage monitoring, application audit records and external encrypted backups are required. |
| Image storage | Store compressed images temporarily in the encrypted MongoDB `cardImages` collection for Version 1. Do not create Google Cloud Storage or another production storage resource until Ali approves it. Images must not remain in browser storage. |
| Cloud provider and region | Keep the application in a separate Vercel staging project. For the live pilot, propose a region near the operating team, with Mumbai as the first choice if it is available for both application compute and Atlas. Keep the application and database in the same geographic area where possible. Ali and Aventure must approve the final region and data residency position before live data is used. |
| Retention and deletion | Use a default card image retention period of 24 hours, configurable from 0 to 168 hours by Vision71 administration. A value of 0 prevents image storage. Run the audited deletion sweep every hour and use the MongoDB TTL index as a two hour safety net. Contact records remain until an approved deletion request or the agreed end of pilot deletion. |
| Backup method | Run the Node backup script daily through GitHub Actions. Export cards, users without password hashes, lists and settings. Exclude images, sessions, login attempts, rate limits and tokens. Compress and encrypt each backup with a separate 32 byte backup key, retain the encrypted artifact for 30 days and perform a documented restore test after material storage changes. |
| Expected monthly cost | Expected internal test cost is **0 USD** while usage remains inside approved free allowances. This assumes MongoDB Atlas Free, existing GitHub Actions allowance and Google Vision usage within its approved allowance. Vercel Hobby is restricted to non commercial use, so it must not be treated as an approved commercial production plan. Google Cloud billing requirements and the live hosting cost must be confirmed before the pilot. Stop before enabling any resource that requires an unapproved payment method or charge. |
| Who can access the data | Capturers can submit contacts and view or correct only their own records. Hala can view and update the protected Aventure owned Sheet. Vision71 Administrators can manage named users, retention, deletion and Approved CSV export. Vision71 Support can view aggregate counts only, cannot browse contact details or images and expires after 24 hours. The backend service account can access only the approved Sheet. Constant Contact receives data only through the approved manual CSV import in Version 1. |

## Approval points

Ali and Aventure must approve the final cloud region, live hosting plan, Atlas network access, image retention period, Google service account access, Aventure owned Sheet and any expected charge before real Aventure data is used.
