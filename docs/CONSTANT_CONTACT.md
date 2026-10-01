# Constant Contact approval integration

This replaces the previous manual-only Constant Contact workflow. Capturers submit contacts to MongoDB, the reviewer portal and the Aventure Google Sheet. Only authenticated reviewer decisions enqueue Constant Contact transfers. Client credentials remain in the ignored server `.env`; access and refresh tokens are encrypted with `ENCRYPTION_KEY` in tenant-scoped MongoDB settings.

Connect from the administrator Users page once. Choose Process pending transfers to retry a queued batch. Approval also attempts transfer immediately, and the local server processes pending batches every minute. For hosted serverless operation, schedule the secret-protected endpoint documented in SETUP.md. Configure provider functions with sufficient execution time for external API calls.

Transfers use the configured list name or the first active list, as requested by the configuration. A configured text custom field carries the source, location and internal record marker. Core contact fields include email, name, company, title and phone; the complete business record and notes remain in the review register. Existing provider contacts are preserved without updates or resubscriptions. Successful records are never blindly transferred twice. An uncertain create is checked by email and the record marker; if success cannot be confirmed, it remains flagged for an administrator to investigate.

OAuth requires `contact_data` and `offline_access`, binds the one-time callback to an administrator session and a separate HTTP-only nonce cookie, and stores encrypted rotating refresh tokens. Account-source contact creation is used; no campaign API or welcome-email send is implemented. Do not enable a capture-time export harness against this workflow.

Validation: `node --test server/integrations/constantContact.test.mjs` tests provider calls using mocked responses, including approved-only gating, duplicate preservation, uncertain creation, stale snapshots and confirmed success. Real account authorization and live delivery require the account owner to complete Connect Constant Contact.
