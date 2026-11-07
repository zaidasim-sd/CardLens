# Production integration validation

Date: 7 November 2026. Baseline main: `1f49bcfae298d01bad1ddf04ef53f80f99bfb15f`.

## Results

* New integration, shared exhibition and Sheet tests: **69 passed, 0 failed**.
* Broader regression selection: **187 tests, 187 passed, 0 failed**.
* TypeScript and frontend production build: **passed**.
* Targeted lint: **no errors**, with the existing React Hook Form / React Compiler memoisation compatibility warning at `watch()` in the review form.
* No live Google Vision, Gemini, Sheet, Constant Contact or production database calls were made. Provider responses and database state in the integration tests are fixtures.

## Passing checks relevant to this release

Production-only configuration accepts the production credential names and rejects missing values even when staging credential names are present. The callback is pinned to lead71.com. Wrong environment/origin, staging/local test flags, wrong list ID/name and an alternate callback are refused.

OAuth uses only contact_data and offline_access, a Secure HttpOnly nonce cookie, one-time state and an active administrator session. Invalid/denied callbacks perform no token exchange. A failed reconnect cannot keep a former connection's destination verification.

The transport refuses list enumeration, existing-contact lookups, other lists, updates/deletes, imports, campaigns, additional memberships, malformed membership collections and consent escalation before making a request.

Submission tests confirm the Sheet append precedes provider delivery and happens once across repeated submissions. A separate delivery retry requires an already completed original Sheet receipt, does not append another Sheet row and creates at most one provider contact for the reference. Concurrent retries, changed data, wrong capturer/tenant, an uncertain result and restarts do not permit an unsafe repeat.

Saved exhibition, short notes and reviewed core fields must match the unique Sheet reference before transfer. Provider failure preserves the confirmed Sheet result. Phone-only contacts remain eligible for the Sheet without inventing an email or contacting Constant Contact. An existing-email conflict is preserved without account search or update.

Shared exhibition tests cover administrator authority, CSRF, optimistic concurrency, tenant separation, default refresh and preservation of an individual's override. Main's existing exhibition catalogue is retained.

The Vercel configuration disables native automatic main deployments while retaining the existing API function and adding a rewrite for the exact callback. A deliberate deployment by Zaid remains required.

## Authentication checks

Configured administrator roles and Firebase approval settings are covered by the corrected fixtures. Repeated pending registrations preserve the request and send no additional approval emails. Rejected accounts return the intended error with a valid audit event. Sessions without a matching Firebase UID fail closed. Approval tokens are no longer logged. No live identity or account settings were changed.

## Reproduction

Run in a clean checkout with dependencies installed and no live `.env` loaded:

```powershell
node --test server/exhibitions/session.test.mjs server/integrations/productionConstantContact.test.mjs server/integrations/sheetService.test.mjs

node --test server/exhibitions/session.test.mjs server/integrations/productionConstantContact.test.mjs server/integrations/sheetService.test.mjs server/auth/permissions.test.mjs server/auth/passwordReset.test.mjs server/auth/firebaseIdentity.test.mjs server/auth/domainToggle.test.mjs server/auth/administratorAccess.test.mjs server/http/ocrHandler.test.mjs server/services/cardClassification.test.mjs

npm run build
```

Do not blindly run `npm test` or legacy integration tests against the configured local `.env`: some existing integration suites require a database and are outside this isolated validation.

Detailed local logs are under `D:\lead71-cc-main-release\artifacts\qa`. Production OAuth and actual production delivery were not run and remain owner-controlled steps after deployment.
