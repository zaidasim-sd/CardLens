# Post-Scan Review Staging Test Report

Date: 30 October 2026

## Environment check

- The configured staging URL `https://lead71-staging.vercel.app/api/health` returned `{"status":"ok","timestamp":"2026-10-30T09:46:13.048Z"}`.
- The response did not identify the environment or report database/Sheet configuration. It does not match the staging health response documented in `docs/STAGING_ISOLATION.md`.
- The local `.env` points at `cardsnap_vision71_staging`, but its Sheet configuration uses the main `GOOGLE_SHEET_ID` and `SHEET_TARGET_APPROVED=true`; no `GOOGLE_SHEET_TEST_ID` is configured. The Sheet gateway would therefore accept writes to a destination that is not verified to be an isolated test register.
- No contact submission was attempted, and no data was written to staging or production. Staging deployment health, UI state, and persistence could not be verified safely. The app was not deployed.

## Requested interactive cases

All three cases are **Not tested**: there is no verified isolated staging Sheet and the live health endpoint did not confirm the environment. No interaction count, duration, correction count, or device observation is claimed.

| Case | Result | Tap count / time | Corrections | Viewport | Validation / persistence |
| --- | --- | --- | --- | --- | --- |
| 1. Fast Review; Follow-up No; leave sales fields blank; save | Not tested | Not measured | Not measured | Not tested | Not tested in staging |
| 2. Expand Add Sales Details; leave all optional fields blank; save | Not tested | Not measured | Not measured | Not tested | Not tested in staging |
| 3. Follow-up Yes; validate missing fields, then complete both and save | Not tested | Not measured | Not measured | Not tested | Conditional rules covered by local automated tests; staging save not tested |

No staging screenshots are available because no authenticated staging session or safe isolated save target was verified. Screenshots must be captured after staging isolation is confirmed and the three cases are performed with synthetic `example.test` contacts.

## Automated checks run locally

- `npm run build` — passed (TypeScript and Vite production build).
- `node --import ./scripts/bootstrap-tests.mjs --test shared/reviewValidation.test.mjs` — passed, 2/2.
- Focused `server/integrations/sheetService.test.mjs` selection for contact field mapping, formula escaping, idempotent append, and row updates — passed, 4/4.
- `server/cards/directSubmission.test.mjs` — 5/6 passed, including the new server-side conditional validation case. One existing Mongo privacy guard assertion expects the old error code for the Firebase-only `users` collection and fails before reaching its insert check.
- A broader run that included legacy integration tests had failures unrelated to this change (Firebase/role guard expectation and stale integration fixture assumptions) and one expected column-count assertion, which has since been updated. The broad run was not green and is not evidence of staging behavior.

## Remaining evidence

After the preview deployment is confirmed against an isolated staging database and a dedicated staging Sheet, perform the three synthetic contact saves, reload the staging records/register to confirm persistence, record actual taps and elapsed time, and capture screenshots of Fast Review, collapsed Add Sales Details, and conditional follow-up fields. Do not submit to the configured main Sheet.
