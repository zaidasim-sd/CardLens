# Lead71 Production Status, Incident Report & Morocco Event Readiness

Prepared for Ali — internal review, 7 October 2026. All times Pakistan time (UTC+05:00). Task deadline: 15:30. Live checks below occurred after that deadline.

**Status: interim evidence-backed report; final production sign-off blocked by explicitly identified missing evidence. No client readiness certification.**

Repository: https://github.com/zaidasim-sd/CardLens. Reviewed revision: `09f52a884ffd6b3cc44abf16415f44a7e75f1ed7`, matching remote HEAD during this review and independently retrieved through GitHub.

## 1. Current production status

The public production API is reachable. At approximately 15:40, `https://lead71.com/api/health` returned HTTP 200 and `https://lead71.com/api/config/exhibitions` returned **Morocco Airshow 2026**. These establish API availability and that event option only, not successful authentication, OCR, submission, approval or delivery.

**Production ownership:** Haroon confirmed during this investigation that Lead71 is deployed from **Zaid's Vercel account**. The connected CLI account exposes Haroon's older staging project. Zaid must supply the production deployment identity, SHA and sanitized runtime configuration. Repository HEAD must not be represented as the deployed production SHA.

The locally configured primary Sheet is **Lead71 x Aventure Pilot October 2026**. At **15:40:52**, a read-only query of `Sheet1!A1:AZ10000` returned eleven headers and **zero nonempty data rows**. No row was removed during this investigation. This verifies the inspected range was empty then; it does not prove deletion actor/time, incident provenance or production's current target mapping.

Current source supports Hala and Osman as administrators with capture, OCR, submission and account approval. Their actual production sessions and independent Google sharing permissions remain unverified. A signed-in approval page exists, but an unauthenticated token decision endpoint also remains in source. Environment separation and test-data blocking are not demonstrated. Overall readiness is **AMBER with RED control gaps**.

No production variables, email settings, recipients, connections, permissions, records or deployments were changed. No email was sent. Local report files and an offline email preview were created; tests used mocks.

| Capability | Implementation in reviewed source | Production evidence / completion state |
|---|---|---|
| Public API/event selection | Health and shared exhibition list | Observed live; Morocco option available |
| Login/sign-up | Firebase identity, verified-email registration, Google sign-in, backend sessions | Implemented; end-to-end production acceptance unverified; no registration tests during freeze |
| Exhibition-user access | Verified non-admins wait for administrator approval | Implemented; actual approved user/session inventory unavailable |
| Account approval | Signed-in `/users` with permission checks, CSRF and audit; alternate token route | Partial: secure-only flow unfinished |
| Administrator scan | Frontend and backend include administrator capture permissions | Implemented; Hala/Osman individual live sessions unverified |
| Mobile capture/upload | Front scan, optional back scan, cropping/mobile navigation | Implemented; event device/browser acceptance outstanding |
| OCR | Backend provider, parsing/classification | Implemented; live provider/quota/result evidence outstanding |
| Submission | Direct Sheet write with reference counters/receipts in MongoDB and retry deduplication | Mock-verified; live write not exercised under freeze |
| Review register | Review directly in Google Sheets; app queue hidden in submission-only pilot | Sheet exists; human ACL unverified |
| Notifications | Access-request/pending/approved/rejected/reset templates | Partial: active configuration unknown, wrong hardcoded event, no exact-flow staging evidence |
| Constant Contact | Shared switch disables integration/cron/manual/automatic paths | Paused in source; runtime inactivity unverified |
| Staging separation | Dedicated test variable and guarded legacy smoke script | Incomplete: local dev targets client Sheet, test Sheet read denied |
| Test-data blocking | Target approval flag exists | Incomplete: internal domain allowed; demo flag does not block direct append |

Source flags: `submissionOnlyEnabled=true`, `internalReviewEnabled=false`, `constantContactEnabled=false`, `historicFieldsEnabled=false`, `allowVision71Emails=true`, `sheetPollIntervalMs=30000`.

**Staging-only / unavailable to Aventure:** `https://cardsnap-vision71-staging.vercel.app`, its deployment URLs, internal fixtures/test accounts, offline email previews and testing scripts. Older reviewer/Constant Contact workflows are disabled preserved implementations, not ready client features. Staging health returned 200, but its exhibition endpoint returned 404; it is not an acceptance environment for today's revision.

**Documentation discrepancy:** `docs/lead71-pilot.md` describes encrypted MongoDB contact storage and historical test results. Current `submitDirect` keeps contact data in request memory and Sheets, with reference/lease metadata in MongoDB. Historic documentation is not current production proof.

## 2. Hala and Osman access

| Question | Hala — hala@aventureaviation.com | Osman — osman@aventureaviation.com |
|---|---|---|
| Can scan today? | Administrator capture/OCR/submission granted in source; production session unverified | Same source grant; production session unverified |
| Can approve users today? | Designated administrator in source; signed-in approval implemented; live account unverified | Same source grant; live account unverified |
| Can access review register? | Requires separate Google sharing permission; ACL unverified | Requires separate Google sharing permission; ACL unverified |
| Receives access-request email? | Depends on deployed recipient setting, not administrator status | Depends on deployed recipient setting, not administrator status |

Being an email recipient is **not required** to scan, submit or approve from the signed-in administration page. The proposed `HALA_APPROVAL_EMAIL` / `OSMAN_APPROVAL_EMAIL` change concerns **new-user access approval requests**, not contact-submission notifications. No email call was found in the direct Sheet submission path.

Those variables also feed the administrator-email list; they are not purely delivery settings. Built-in administrators include Hala, Osman, `hmirza.sd@vision71tech.com`, `iamalik2005@gmail.com` and `zaid.sd@vision71tech.com`. Removing Google sharing does not remove application administrator privileges or the ability to submit via the service account.

Administrators can review pending users at `/users` after signing in without receiving a new notification. Do not create production test registrations: registration itself sends messages. Any access or recipient change remains frozen pending Ali's written approval.

## 3. Current email and approval flow

**Current subject:** `Lead71: New Exhibition Assistant Access Request ([Name])`

> A new team member has completed email verification and is requesting access to the Lead71 exhibition capture workspace:
>
> Candidate Name: [Name]  
> Work Email: [Email]  
> Requested Role: Exhibition Assistant  
> Event Scope: Aero-Engines Americas 2026
>
> Click the button below to review the request, grant access, or decline the application:
>
> **Review Access Request**
>
> This authorization request is restricted to designated administrators.

The email still hardcodes **Aero-Engines Americas 2026** despite the Morocco option now appearing live. It is not a finalized Morocco template.

The email button opens `/approve-user?token=…&email=…`. Merely opening that page does not approve; separate page buttons submit a decision. However, `authHandlers.js` accepts `action=approve_user` without administrator sign-in and without a POST-only restriction. The default decision is approval. A token-bearing GET request to that API can therefore change account approval. No expiry check was found in `approveUserByToken`; decisions remove the pending token. Approval URLs are logged. The visible page behavior does not make the API secure or sign-in-required.

**Recommended flow, not deployed:** notification → `/users` → sign-in → designated administrator reviews → explicit decision → audit. Disable the unauthenticated token decision route and invalidate outstanding links as a specifically approved change.

**Proposed wording for approval:**

> **Subject: Lead71: New user awaiting approval — [Name]**
>
> A new user has verified their work email and requested Lead71 access.
>
> Name: [Name]  
> Work email: [Email]  
> Requested role: Exhibition Assistant
>
> Their account remains pending until a designated administrator approves it. Sign in to Lead71 to review the request. Opening this email or its button does not approve the user.
>
> **Sign in to review pending users**

Current-template HTML/text preview files are attached alongside this report. They were rendered offline by intercepting Nodemailer's transport, using dummy Vision71 details and an invalid preview token. No SMTP connection occurred. They are not a final approved template, delivery test or email-client screenshot. Final screenshot and exact-flow staging delivery evidence remain outstanding. There is no evidence sufficient to confirm this exact flow has passed staging using Vision71-only addresses.

## 4. Timeline, authorship and communication failure

Appendix A records **all reachable commits from 30 September 00:00 PKT through reviewed HEAD**, including full SHA, author, committer, timestamps and changed files. These identify recorded code authorship, not production deployment actor/time or written authorization.

Key changes:

| PKT date/time | Recorded author | Commit / contribution |
|---|---|---|
| 1 Oct 14:09:30 | Ibrahim Ahmed | `754f25a43e87f0091c727b047b3effdaa1a4f56e`: Sheet/Constant Contact integration and UI; message refers to Haroon's Sheet |
| 3 Oct 12:31:49 | Ibrahim Ahmed | `868c2353a381063bb2ea4cf1c0ff07a35b8727bd`: submission-only pilot, official-Sheet transition described, app review/Constant Contact paused |
| 5 Oct 11:03:29 | vision71tech | `d5a27f7d384f6be75d6445ce8e890e7d867199d1`: signup/email verification/Google sign-in |
| 5 Oct 11:38:50 | Operator unrecorded | Stored `legacy-sheet-verification.json`: 113 cards, 91 matches, 21 missing rows, 1 different target; historical artifact only |
| 5 Oct 11:50:41 | HaroonMirza002 | `a5a7ec12a90d0cd362806e2ef8340a5fadf1cec0`: direct Sheet submission, Firebase identity/privacy changes, legacy tools/docs |
| 5 Oct 12:46:31 | mhassan-04 | `28f0631636f648b4cabc9774c570d66fa6a3b955`: Vision71-domain testing allowance |
| 5 Oct 13:09:24 | mhassan-04 | `298ba5594e81350bee1bfce84577ffd39387c62f`: test approvers and pending approval UI |
| 5 Oct 14:49:03 | mhassan-04 | `7d334468120850a8e8fb6e8b64e0718cc12791ef`: Firebase-only user identity and storage/auth changes |
| 5 Oct 16:09:38 | zaidasim-sd | `147efb49236e6be71387de5caf4ef2c8607ebf33`: email formatting, reply-to example, approval interfaces/test-email script |
| 5 Oct 18:27:22 | ibrahim-v71 | `44bca598a2b7e26331b7da03ac763b896abb7585`: administrator capture/OCR/submission permissions, capture routes and session role upgrade |
| 5 Oct 18:39:17 | ibrahim-v71 | `453ec01be0e20a83731aa14b7dd747374e46bac0`: further administrator scan/navigation fix |
| 6 Oct 17:16:07 | ibrahim-v71 | `63a4cd3458769123587fae5c067e22b3e2040f98`: dark mode, password-reset/auth email changes |
| 6 Oct 17:46:33 | zaidasim-sd | `11d3479821604be57644da6ff7f988871a9891e1`: pending UI/email wording |
| 7 Oct 12:12:09 | ibrahim-v71 | `43dbda4700714f96169e93c767b12fcbc3729d65`: optional reverse-side capture/mobile navigation |
| 7 Oct 13:03:39 | ibrahim-v71 | `09f52a884ffd6b3cc44abf16415f44a7e75f1ed7`: shared Morocco event list; independently fetched through GitHub |
| 7 Oct approximately 15:40 | This investigation | Read-only production/staging HTTP observations |
| 7 Oct 15:40:52 | This investigation | Client-named Sheet has headers and zero rows in inspected range |

**Who worked on what:** recorded Haroon identities authored direct-submission/privacy/Firebase integration and earlier backend workflow work; `mhassan-04` authored test-domain/approver and Firebase authentication changes; `zaidasim-sd` authored email/UI/crop/submit fixes; Ibrahim's recorded identities authored pilot/integration/UI work, administrator capture fixes and Morocco selection. `vision71tech` uses Zaid's alternate email in Git metadata, but real-person attribution beyond recorded accounts requires team confirmation. Exact part-by-part files and all commits appear in Appendix A.

### Incident questions — factual answers

**First discovery that admins could not scan:** not established. The capture permission was missing before `44bca598…`; it was fixed in source by 5 October 18:27:22, followed at 18:39:17. Those times establish fixes, not first discovery or production availability. Obtain first issue/chat and deployment logs.

**Why Ali was not immediately informed:** the supplied conversation conflates scanning capability and notification handover readiness. Internal escalation times and individual reasons are absent. Haroon should provide a dated explanation with original messages. Do not invent intent or an admission on another person's behalf.

**When/why variables, Sheet links, recipients or permissions changed:** commits show source/config-example changes and intended integration transitions. Zaid's Vercel audit/deploy records and the Google owner's sharing/activity history are needed for actual hosted changes, actors and reasons. `.env.example` edits do not prove production edits.

**Client email without approval:** reported in the assigned task but not independently verified here. The app sends registration messages automatically; `scripts/test-emails.js` can send real email when invoked. No execution/SMTP record identifies either as the disputed send. Obtain exact message ID, recipients, time, trigger/request, actor and written approval history. Responsible sender remains unverified.

**Test records reappearing:** exact cause unresolved. Current source permits eligible internal identities and demo-marked inputs; local dev targets the client Sheet. Historical docs describe a temporary live client-Sheet test; batch tooling offers explicit live Sheet writes. These are possible routes, not incident attribution. An uncertain prior append with an incomplete receipt can be retried after a row is deleted and append again; a completed direct-submission receipt returns without appending. Correlate row IDs/version history with receipt/request/script logs before identifying source.

## 5. Configuration inventory — no credentials

Local values below are **not certified deployed values**. No passwords, keys, tokens, private keys or credential URIs are included.

| Item | Production/client evidence | Staging/local evidence |
|---|---|---|
| URL | `https://lead71.com`; API observed | `https://cardsnap-vision71-staging.vercel.app`; health 200, event endpoint 404 |
| Sheet name/ID/tab | Accessible client-named Sheet: `Lead71 x Aventure Pilot October 2026`; `1RpPgLUTtpkP8x4KgDCxXlDc7aTRl0LCku0S57XY4710`; `Sheet1`. Production mapping requires Zaid's runtime values | Local test ID `1N8wgl21xTvgL3tNzXrTKvDzpNVaSSO3lKun7WHpCsb8`; name unavailable/read denied. Local primary points to client-named Sheet |
| Google Cloud project | Deployed project/display name unverified | Local SA project ID `cardsnap-ocr`; Google error gives project number `218999477251`; display name unverified |
| Firebase project | Production identity project unverified | Local frontend project ID `lead71-16275`; deployed staging identity config unverified |
| Service account/access | Production account unverified | `lead71-ocr@cardsnap-ocr.iam.gserviceaccount.com` read client Sheet; test Sheet read denied. Read success does not establish Editor role or exclusive access |
| Legacy documented SA | Current use unverified | `cardsnap@cardsnap-510210.iam.gserviceaccount.com` in older docs; present ACL unverified |
| Database | Active production DB name requires Zaid | Local `cardsnap_vision71_staging`; hosted staging value hidden/unverified |
| Deployment/environment | Zaid's Vercel, per Haroon; project name, environment and deployed SHA unverified | `haroonmirza02s-projects/cardsnap-vision71-staging`; hosted target is named `production` despite staging project name |
| Latest visible staging deployment | Not production evidence | `cardsnap-vision71-staging-g7nmregss-haroonmirza02s-projects.vercel.app`, READY; metadata SHA `f22c8b58d4e26b5f909c81dd13b9d88fbe58153f`, creator `haroonmirza02`, `gitDirty=1` |
| Local mode/target | Runtime production values unknown | `APP_ENV=development`, `SHEET_TARGET_APPROVED=true`, primary client Sheet: concrete isolation risk |
| Sender | Active production sender unknown | Local `Lead71 by Vision71 <no-reply@lead71.com>`; SMTP user `zaid.sd@vision71tech.com`. Source/example default sender uses Zaid's address |
| Reply-to | Active production header unknown | Local `.env` has no `SMTP_REPLY_TO`; helper returns undefined unless supplied by process env. Example uses `az@vision71tech.com`; footer fallback is not a Reply-To header |
| Approval recipients | Active values require Zaid | Empty local Hala variable falls back to `hmirza.sd@vision71tech.com`; local Osman variable is `iamalik2005@gmail.com` |
| Human Google access/roles | Full list unavailable; no removals confirmed | Google Drive permission/list calls returned 403 because Drive API disabled; nothing enabled or changed |

Linked staging Vercel environment-name listing shows hidden Production-scoped Sheet, service-account email, MongoDB, OCR and encryption settings. Listing does not establish values. Inspecting `lead71.com` failed in Haroon's context, consistent with the user-confirmed Zaid ownership.

### Email triggers and rules in current source

| Trigger | Recipients | Qualification |
|---|---|---|
| Verified non-admin registration | Resolved Hala/Osman variables with internal fallbacks | New-user access request, not contact alert |
| Pending registration | Candidate | Automatic; production sign-up test can contact client |
| Account approved, either path | Candidate | Approval confirmation |
| Account rejected through token path | Candidate | Rejection notice |
| Password reset | Validated/requested address | Real delivery possible; no Aventure testing |
| OTP/verification | Current registration uses Firebase identity; legacy OTP sender remains | Template presence does not prove active OTP delivery; inspect Firebase action settings |
| Password-changed/security helper | Caller-supplied address | Functions exist; active server caller not established |
| Contact submitted | No email call in direct submit | Do not describe approval recipients as sales-contact notification recipients |

`sendLead71Email` sends to supplied recipients without a central Vision71-only test allowlist or client-domain block. Base-URL helpers can fall back to production `https://lead71.com`, including from staging-like inputs. Test delivery destinations and link destinations both require isolation evidence.

## 6. Client Sheet incident and access confirmations

| Requirement | Finding | Closure evidence |
|---|---|---|
| Exact test-record source | Unresolved | Retained deleted row IDs; Sheet history; request/session actor; receipt; runtime target; script logs |
| Test records removed | Current inspected range empty; deletion event unverified | Owner's full used-range check/version history and clean Sheet screenshot |
| No test user can write | Cannot confirm; code permits eligible internal users/demo inputs | Approved identity restrictions, isolated negative tests, authorized session revocation evidence |
| Haroon/Ibrahim/non-essential Vision71 sharing removed | Unverified; no changes made | Final human/group/link/inherited ACL and change history |
| Only approved steward and required SA remain | Unverified; steward not named in supplied evidence | Ali's named approval and final ACL screenshot/export |
| SA limited to designated Sheet, not wider Drive | Unverified | Owner/admin review of shared files/groups/shared drives, delegation and IAM |
| Clean Sheet screenshot | Outstanding; API row count available | Owner screenshot showing title, headers and current rows |
| Final sharing screenshot | Outstanding | Owner sharing-dialog capture with permission levels |

The API returned only `Sheet1` in spreadsheet metadata. Its read range had zero rows beyond headers at 15:40:52. This is current-state evidence, not proof of historic source or deletion responsibility. Do not classify records as tests solely because they say Aero-Engines. Preserve evidence and obtain approval before narrowly scoped removals. Checklist removal requests do not override the explicit production freeze.

## 7. Morocco event readiness

GREEN = demonstrated ready in the relevant environment. AMBER = implemented/partly observed with acceptance evidence missing. RED = known control gap or blocked required verification. Owners are proposed accountable owners, not confirmed assignments; historical authorship appears in Appendix A.

| Feature | Status | Proposed owner | Evidence | Safe for client use today? |
|---|---|---|---|---|
| Login/sign-up | AMBER | Hassan | Firebase flow; no live acceptance | Not certified; no test sign-ups under freeze |
| Account approval | RED | Hassan | Signed-in path plus unauthenticated token/GET decision route | Secure-only flow not certified |
| Hala/Osman administrator access | AMBER | Ibrahim | Admin fixes; mocked admin tests pass | Individual production sessions need evidence |
| Exhibition-user access | AMBER | Hassan | Pending/approved gate in source | Actual production accounts need confirmation |
| Mobile camera capture | AMBER | Ibrahim | Mobile/crop/back-side changes; offline checks | Device/browser acceptance outstanding |
| OCR extraction | AMBER | Ibrahim | Source parser/classifier; no live provider/quota check | Not certified |
| Google Sheet submission | AMBER | Haroon | Direct-submit mocks; client Sheet readable | Write path not exercised; no test writes permitted |
| Google Sheet review | AMBER | Ali-named Production Steward | Sheet exists; ACL unavailable | Owner-confirmed sharing required |
| Email notifications | RED | Zaid | Wrong hardcoded event; config unknown; no exact staging proof | No tests/client notifications before approval |
| Constant Contact activity | AMBER | Ibrahim | Source switch false | Keep paused; runtime inactivity proof outstanding |
| Staging separation | RED | Haroon | Local dev client target; test Sheet denied; staging old | Aventure must not use staging |
| Test-data blocking | RED | Hassan | Internal domain enabled/demo flag not rejected | Blocking cannot be claimed effective |

## 8. Required action and decision plan

Deadline 15:30 has passed. Deadlines below are proposed commitments relative to **T0 = Ali's written authorization**, not accepted assignments. Haroon coordinates one consolidated update. Mutation deadlines begin only after the particular change is authorized.

| Priority/action | Proposed accountable owner | Deadline | Approval/dependency | Exact evidence after completion |
|---|---|---|---|---|
| Obtain deployed production/config evidence | Zaid | T0 + 30 min | Read access in Zaid's Vercel | Project/environment/deployment screenshot; full SHA; sanitized active-values matrix with timestamp |
| Preserve/correlate incident and email evidence | Haroon | Preserve T0 + 30 min; initial findings +2 h | SMTP/request/Google history from owners | Message ID, recipients, UTC/PKT timestamp, trigger/actor; row/version/receipt correlation |
| Verify Sheet/access without changes | Ali-approved steward | T0 + 30 min | Ali names steward and Google owner | Clean Sheet and sharing screenshots, group/link roles, capture time |
| Remove confirmed test rows/non-essential sharing if needed | Steward | +60 min after specific approval | Approved exact rows/principals; evidence retained first | Before/after, exact IDs, audit actor/time, client records preserved |
| Isolate staging and repair test-target access | Haroon | T0 + 60 min | Approved target/credential/ACL plan | Separate Sheet/DB/project matrix; runtime target; test-target write/read; staging identity cannot reach client target |
| Block internal/test/demo production submissions | Hassan | T0 + 90 min | Ali defines permitted production identities/session plan | Demo/internal/test negative tests reject before Sheet call; authorized success in approved acceptance context; session inventory |
| Require signed-in account approval; retire token route | Hassan | T0 + 90 min | Ali approves workflow | Unauthorized GET/POST/token denied; role/CSRF tests; signed-in approval screenshot/audit; old links invalidated |
| Finalize notification wording and recipients | Zaid | Draft +30 min; staging proof +90 min | Ali signs subject/body/button/recipients before production | Final rendered screenshot; Vision71-only message IDs/headers; staging links; pending/decision screenshots; zero Aventure test recipients |
| Verify Hala and Osman separately | Ibrahim | +45 min after approved deployment | No unapproved account/access change | Each account's role/capture-page evidence and Google owner access confirmation; no test client records/email |
| Mobile/OCR/direct-submit acceptance | Ibrahim | +60 min after isolation | Staging-only approved test plan | Device/browser list, front/back captures, OCR fields, one Sheet row/same-reference retry/error evidence |
| Verify Constant Contact inactive | Ibrahim | T0 + 30 min | Read-only provider/deployment access | Runtime flags/revision and provider activity log |
| Correct privacy-guard test mismatch | Hassan | Before next release | Local fix review; deployment approval separate | Correct error-contract assertion and fresh test result |
| Update stale architecture/pilot docs | Haroon | Within 1 business day after exhibition | Confirm final design | Docs aligned to direct Sheet design/config ownership |
| UI polish, broader legacy features or CC restoration | Ibrahim | Within 2 business days after exhibition, if requested | Separate scope approval | Reviewed change plan and isolated acceptance; no event-time activation |

**Immediate priorities:** establish actual runtime configuration, preserve incident evidence, verify ACL, close test-data/environment separation gaps and token approval/email controls before another readiness claim.

**Can wait until after exhibition:** UI polish, broader review/history functionality, Constant Contact restoration and nonblocking documentation polish. Failed mandatory release checks must be resolved before a release, not waived as cosmetic.

**Ali's decisions:** name sole Production Steward and Google owner; confirm legitimate event/admin identities; approve signed-in-only flow and final template/recipients; authorize enumerated access/environment changes; decide go/no-go after evidence. Report approval should specify authorized changes; it is not blanket permission.

## 9. Validation and limits

- Local Git history, remote HEAD and independent GitHub commit retrieval.
- Read-only Vercel deployment and variable-name listing. Staging metadata has `gitDirty=1`; SHA alone does not fully identify uploaded content. Zaid's production project remains inaccessible from connected context.
- Public health/exhibition GETs only; no registration, approval, password-reset or session-changing endpoints exercised.
- Read-only Sheet metadata/range. No contact values exported; Drive metadata/ACL requests failed due disabled API. No API was enabled.
- Offline mocked tests: **111 total, 110 passed, 1 failed**. Log: `lead71-offline-checks-2026-10-07.txt`. Failure at `server/cards/directSubmission.test.mjs:67`: privacy guard test expects `MONGO_PRIVACY_REFUSED` on users collection; current guard throws `FIREBASE_AUTH_ONLY`. This observed error-contract mismatch does not show an allowed database write. No fix or deployment made.
- Current email rendered using intercepted transport; no SMTP delivery. Historical stored 112/149-test claims are not current acceptance proof.

## 10. Freeze and completion gate

Until Ali approves in writing: no client-Sheet test data; no test email to Aventure; no production environment/recipient/connection/permission changes; no client-facing readiness statements. This review complied with that freeze.

Every requested topic is covered, but final factual confirmations remain open: exact active production/staging values, deployed production SHA, individual live access, complete ACL/approved steward, wider service-account scope, historical incident source/actor, escalation chronology, disputed email evidence, final screenshots and exact-flow staging acceptance. These require Zaid, the Google owner and original records. They must not be marked complete based on assumptions.

## Appendix A — complete reachable Git change ledger

Window: 30 September 2026 00:00 PKT through reviewed HEAD. Git timestamps identify source history, not deployment/configuration changes. Recorded accounts and emails are attribution evidence; identity aliases and authorization require team confirmation. Changed files identify each contribution. No completeness claim is made for unreachable commits, other branches or external changes.


### 2026-09-30T10:28:46+05:00 — Step 1: add named login and roles

- Commit: [c5f321698a09ded0a7d6636af0e19ae5f9489058](https://github.com/zaidasim-sd/CardLens/commit/c5f321698a09ded0a7d6636af0e19ae5f9489058)
- Author: HaroonMirza02 <haroon.mirza040602@gmail.com>
- Committer: HaroonMirza02 <haroon.mirza040602@gmail.com>; committed 2026-09-30T10:28:46+05:00
- Changed files: .env.example, api/auth.js, api/users.js, docs/IMPLEMENTATION_NOTES.md, docs/SETUP.md, package-lock.json, package.json, scripts/seed-admin.mjs, server/auth/cookies.js, server/auth/password.js, server/auth/permissions.js, server/auth/permissions.test.mjs, server/auth/service.integration.test.mjs, server/auth/service.js, server/db.js, server/http/authHandlers.js, server/index.js, src/App.tsx, src/auth/AuthContext.tsx, src/components/auth/ProtectedRoute.tsx, src/components/layout/AppLayout.tsx, src/components/layout/Header.tsx, src/components/layout/MobileNav.tsx, src/main.tsx, src/pages/HomePage.tsx, src/pages/SignInPage.tsx, src/pages/UserAdminPage.tsx



### 2026-09-30T10:40:33+05:00 — Step 2: add encrypted central card storage

- Commit: [aa99cdd2a02f34273452570232a1c27e3cebe7ed](https://github.com/zaidasim-sd/CardLens/commit/aa99cdd2a02f34273452570232a1c27e3cebe7ed)
- Author: HaroonMirza02 <haroon.mirza040602@gmail.com>
- Committer: HaroonMirza02 <haroon.mirza040602@gmail.com>; committed 2026-09-30T10:40:33+05:00
- Changed files: .env.example, api/cards.js, api/storage-health.js, docs/IMPLEMENTATION_NOTES.md, package-lock.json, package.json, server/cards/browser-persistence.test.mjs, server/cards/service.integration.test.mjs, server/cards/service.js, server/db.js, server/http/cardHandlers.js, server/index.js, server/security/encryption.js, src/auth/AuthContext.tsx, src/components/scanner/DuplicateWarningModal.tsx, src/components/scanner/OCRReviewModal.tsx, src/components/verified/EditContactModal.tsx, src/components/verified/ViewCardModal.tsx, src/lib/api.ts, src/lib/cardApi.ts, src/lib/db.ts, src/lib/duplicateChecker.ts, src/lib/imageCompression.ts, src/pages/VerifiedQueuePage.tsx, src/types/index.ts



### 2026-09-30T10:51:11+05:00 — Step 3: add access audits

- Commit: [4f21bc2228ce11aa69ad8a13f57e752e451ac9f5](https://github.com/zaidasim-sd/CardLens/commit/4f21bc2228ce11aa69ad8a13f57e752e451ac9f5)
- Author: HaroonMirza02 <haroon.mirza040602@gmail.com>
- Committer: HaroonMirza02 <haroon.mirza040602@gmail.com>; committed 2026-09-30T10:51:11+05:00
- Changed files: api/support.js, docs/IMPLEMENTATION_NOTES.md, package.json, server/audit/service.integration.test.mjs, server/audit/service.js, server/auth/service.integration.test.mjs, server/auth/service.js, server/cards/service.integration.test.mjs, server/cards/service.js, server/db.js, server/index.js, server/support/service.js, src/pages/VerifiedQueuePage.tsx



### 2026-09-30T10:59:30+05:00 — Step 4: add retention and automatic deletion

- Commit: [62d9566963c08883799095528495fb74fcb6a90c](https://github.com/zaidasim-sd/CardLens/commit/62d9566963c08883799095528495fb74fcb6a90c)
- Author: HaroonMirza02 <haroon.mirza040602@gmail.com>
- Committer: HaroonMirza02 <haroon.mirza040602@gmail.com>; committed 2026-09-30T10:59:30+05:00
- Changed files: .env.example, .github/workflows/sweep.yml, api/cron/sweep.js, api/retention.js, docs/IMPLEMENTATION_NOTES.md, package.json, server/cards/service.js, server/db.js, server/http/cardHandlers.js, server/http/retentionHandlers.js, server/index.js, server/retention/service.integration.test.mjs, server/retention/service.js, src/lib/cardApi.ts, src/pages/UserAdminPage.tsx, src/pages/VerifiedQueuePage.tsx, src/types/index.ts



### 2026-09-30T11:12:50+05:00 — Step 5: add encrypted backup and restore

- Commit: [c8fc016d892a06b7527e07cba4661b1b0cca9aa7](https://github.com/zaidasim-sd/CardLens/commit/c8fc016d892a06b7527e07cba4661b1b0cca9aa7)
- Author: HaroonMirza02 <haroon.mirza040602@gmail.com>
- Committer: HaroonMirza02 <haroon.mirza040602@gmail.com>; committed 2026-09-30T11:12:50+05:00
- Changed files: .env.example, .github/workflows/backup.yml, docs/IMPLEMENTATION_NOTES.md, docs/RESTORE_TEST.md, package-lock.json, package.json, scripts/backup.mjs, scripts/lib/backup.js, scripts/lib/backup.test.mjs, scripts/restore.mjs



### 2026-09-30T14:13:37+05:00 — Step 6: use Google Cloud Vision only

- Commit: [d5ee2f3add22213425f1eae0e76a3b082fb11f03](https://github.com/zaidasim-sd/CardLens/commit/d5ee2f3add22213425f1eae0e76a3b082fb11f03)
- Author: HaroonMirza02 <haroon.mirza040602@gmail.com>
- Committer: HaroonMirza02 <haroon.mirza040602@gmail.com>; committed 2026-09-30T14:13:37+05:00
- Changed files: .env.example, docs/IMPLEMENTATION_NOTES.md, server/services/ocrService.js, server/services/ocrService.test.mjs, server/services/providers/googleVisionProvider.js, server/services/providers/ocrSpaceProvider.js, testOcrProviders.js



### 2026-09-30T14:15:43+05:00 — Merge remote-tracking branch 'origin/haroon' into impl/production-controls

- Commit: [1ecde4bc4ee9cb622f28387ac98ea6b76374c27a](https://github.com/zaidasim-sd/CardLens/commit/1ecde4bc4ee9cb622f28387ac98ea6b76374c27a)
- Author: HaroonMirza02 <haroon.mirza040602@gmail.com>
- Committer: HaroonMirza02 <haroon.mirza040602@gmail.com>; committed 2026-09-30T14:15:43+05:00
- Changed files: 



### 2026-09-30T14:24:03+05:00 — Step 6: secure the shared OCR endpoint

- Commit: [2a65b4fd3d4e3496352bf2b222329ebee9349419](https://github.com/zaidasim-sd/CardLens/commit/2a65b4fd3d4e3496352bf2b222329ebee9349419)
- Author: HaroonMirza02 <haroon.mirza040602@gmail.com>
- Committer: HaroonMirza02 <haroon.mirza040602@gmail.com>; committed 2026-09-30T14:24:03+05:00
- Changed files: .env.example, api/ocr.js, server/auth/permissions.js, server/auth/permissions.test.mjs, server/http/ocrHandler.js, server/http/ocrHandler.test.mjs, server/index.js, server/routes/ocr.js, src/components/scanner/OCRReviewModal.tsx, src/components/verified/EditContactModal.tsx, src/pages/ScanPage.tsx, vercel.json



### 2026-09-30T14:45:29+05:00 — Step 7: add assigned review and Sheet register

- Commit: [edbf789fe0f3bf19c3d529b5ea6c4843a7bc58ad](https://github.com/zaidasim-sd/CardLens/commit/edbf789fe0f3bf19c3d529b5ea6c4843a7bc58ad)
- Author: HaroonMirza02 <haroon.mirza040602@gmail.com>
- Committer: HaroonMirza02 <haroon.mirza040602@gmail.com>; committed 2026-09-30T14:45:29+05:00
- Changed files: config/sheetMapping.json, package-lock.json, package.json, scripts/seed-internal-users.mjs, server/audit/service.integration.test.mjs, server/auth/service.js, server/cards/service.integration.test.mjs, server/cards/service.js, server/db.js, server/http/authHandlers.js, server/integrations/sheetService.js, server/integrations/sheetService.test.mjs, server/retention/service.integration.test.mjs, src/App.tsx, src/components/layout/Header.tsx, src/components/layout/MobileNav.tsx, src/components/scanner/OCRReviewModal.tsx, src/lib/cardApi.ts, src/lib/csvExport.ts, src/lib/excelExport.ts, src/pages/UserAdminPage.tsx, src/pages/VerifiedQueuePage.tsx, src/types/index.ts



### 2026-09-30T14:45:41+05:00 — Step 8: add test Constant Contact transfer

- Commit: [43464f47ce34b110cee7bdfad6026a34223eacbe](https://github.com/zaidasim-sd/CardLens/commit/43464f47ce34b110cee7bdfad6026a34223eacbe)
- Author: HaroonMirza02 <haroon.mirza040602@gmail.com>
- Committer: HaroonMirza02 <haroon.mirza040602@gmail.com>; committed 2026-09-30T14:45:41+05:00
- Changed files: .env.example, api/constant-contact.js, api/ocr.js, config/constantContactMapping.json, server/http/constantContactHandler.js, server/index.js, server/integrations/constantContactService.js, server/integrations/constantContactService.test.mjs



### 2026-09-30T15:23:50+05:00 — Step 9: align Version 1 Sheet review workflow

- Commit: [b6eb262e08c8a5ef43a8d776b7f8e7678d7bee50](https://github.com/zaidasim-sd/CardLens/commit/b6eb262e08c8a5ef43a8d776b7f8e7678d7bee50)
- Author: HaroonMirza02 <haroon.mirza040602@gmail.com>
- Committer: HaroonMirza02 <haroon.mirza040602@gmail.com>; committed 2026-09-30T15:23:50+05:00
- Changed files: .env.example, .gitignore, .vercelignore, TEST_REPORT.md, api/constant-contact.js, api/export.js, config/constantContactMapping.json, config/sheetMapping.json, docs/IMPLEMENTATION_NOTES.md, docs/SETUP.md, docs/VERSION_1_RECOMMENDATION.md, package.json, scripts/configure-sheet.mjs, scripts/lib/backup.test.mjs, scripts/seed-internal-users.mjs, server/audit/service.integration.test.mjs, server/auth/permissions.js, server/auth/permissions.test.mjs, server/auth/service.js, server/cards/service.integration.test.mjs, server/cards/service.js, server/export/service.js, server/export/service.test.mjs, server/http/authHandlers.js, server/http/constantContactHandler.js, server/http/exportHandler.js, server/index.js, server/integrations/constantContactService.js, server/integrations/constantContactService.test.mjs, server/integrations/sheetService.js, server/integrations/sheetService.test.mjs, server/retention/service.integration.test.mjs, server/services/ocrService.js, server/services/ocrService.test.mjs, src/App.tsx, src/auth/AuthContext.tsx, src/components/layout/Header.tsx, src/components/layout/MobileNav.tsx, src/components/scanner/OCRReviewModal.tsx, src/lib/cardApi.ts, src/pages/HomePage.tsx, src/pages/UserAdminPage.tsx, src/pages/VerifiedQueuePage.tsx, src/types/index.ts



### 2026-09-30T15:30:11+05:00 — Docs: finalize Version 1 recommendation

- Commit: [bb4bec9e1f862ca2437bdaca8ec3da98589fb843](https://github.com/zaidasim-sd/CardLens/commit/bb4bec9e1f862ca2437bdaca8ec3da98589fb843)
- Author: HaroonMirza02 <haroon.mirza040602@gmail.com>
- Committer: HaroonMirza02 <haroon.mirza040602@gmail.com>; committed 2026-09-30T15:30:11+05:00
- Changed files: docs/VERSION_1_RECOMMENDATION.md



### 2026-09-30T15:30:40+05:00 — Docs: clean recommendation formatting

- Commit: [85dcc04bdb4651b4d13fb2ddac08b1220494ea4c](https://github.com/zaidasim-sd/CardLens/commit/85dcc04bdb4651b4d13fb2ddac08b1220494ea4c)
- Author: HaroonMirza02 <haroon.mirza040602@gmail.com>
- Committer: HaroonMirza02 <haroon.mirza040602@gmail.com>; committed 2026-09-30T15:30:40+05:00
- Changed files: docs/VERSION_1_RECOMMENDATION.md



### 2026-09-30T16:32:35+05:00 — Fix sign in and administrator form submission

- Commit: [f22c8b58d4e26b5f909c81dd13b9d88fbe58153f](https://github.com/zaidasim-sd/CardLens/commit/f22c8b58d4e26b5f909c81dd13b9d88fbe58153f)
- Author: HaroonMirza02 <haroon.mirza040602@gmail.com>
- Committer: HaroonMirza02 <haroon.mirza040602@gmail.com>; committed 2026-09-30T16:32:35+05:00
- Changed files: .vercelignore, src/pages/SignInPage.tsx, src/pages/UserAdminPage.tsx



### 2026-09-30T17:47:02+05:00 — feat(ui/auth): align Version 1 frontend, overhaul admin console, and refine authentication UX

- Commit: [45cd89cab042ee1ca4f2233286fe511188ffc9f0](https://github.com/zaidasim-sd/CardLens/commit/45cd89cab042ee1ca4f2233286fe511188ffc9f0)
- Author: vision71tech <zaidbinasim2197@gmail.com>
- Committer: vision71tech <zaidbinasim2197@gmail.com>; committed 2026-09-30T17:47:02+05:00
- Changed files: FRONTEND_BACKEND_CONTRACT.md, api/config/exhibitions.js, server/auth/service.js, server/http/ocrHandler.js, server/index.js, server/security/encryption.js, src/auth/AuthContext.tsx, src/components/auth/ProtectedRoute.tsx, src/components/layout/AppLayout.tsx, src/components/layout/Header.tsx, src/components/layout/MobileNav.tsx, src/components/layout/Sidebar.tsx, src/components/layout/UserProfileDropdown.tsx, src/components/scanner/DuplicateWarningModal.tsx, src/components/scanner/OCRReviewModal.tsx, src/components/ui/LoadingScreen.tsx, src/components/verified/EditContactModal.tsx, src/lib/api.ts, src/lib/api/client.ts, src/lib/api/contacts.ts, src/lib/api/exhibitions.ts, src/lib/api/export.ts, src/lib/api/index.ts, src/lib/api/ocr.ts, src/lib/cardApi.ts, src/pages/HomePage.tsx, src/pages/ScanPage.tsx, src/pages/SignInPage.tsx, src/pages/UserAdminPage.tsx, src/pages/VerifiedQueuePage.tsx, src/types/index.ts, vite.config.ts



### 2026-10-01T10:30:39+05:00 — Reviewer account issue fixed

- Commit: [53403c75312b37a42aaeb6e0bf7e3cd4da2bd594](https://github.com/zaidasim-sd/CardLens/commit/53403c75312b37a42aaeb6e0bf7e3cd4da2bd594)
- Author: vision71tech <zaidbinasim2197@gmail.com>
- Committer: vision71tech <zaidbinasim2197@gmail.com>; committed 2026-10-01T10:30:39+05:00
- Changed files: server/auth/permissions.js, server/auth/permissions.test.mjs, server/cards/service.integration.test.mjs, server/cards/service.js, server/http/cardHandlers.js, src/components/verified/ReviewContactModal.tsx, src/lib/api/contacts.ts, src/lib/cardApi.ts, src/pages/VerifiedQueuePage.tsx



### 2026-10-01T10:52:56+05:00 — All 4 Status added

- Commit: [ada7178dae0f2fa950e2d977570d37262eeeb6db](https://github.com/zaidasim-sd/CardLens/commit/ada7178dae0f2fa950e2d977570d37262eeeb6db)
- Author: vision71tech <zaidbinasim2197@gmail.com>
- Committer: vision71tech <zaidbinasim2197@gmail.com>; committed 2026-10-01T10:52:56+05:00
- Changed files: server/cards/service.js, src/components/ui/dialog.tsx, src/components/verified/EditContactModal.tsx, src/components/verified/ReviewContactModal.tsx, src/pages/VerifiedQueuePage.tsx, src/types/index.ts



### 2026-10-01T10:58:36+05:00 — Fix requireAction ObjectId comparison for capturer resubmission

- Commit: [5eafa74aca4518e22c02c938ea53fa767c927aea](https://github.com/zaidasim-sd/CardLens/commit/5eafa74aca4518e22c02c938ea53fa767c927aea)
- Author: vision71tech <zaidbinasim2197@gmail.com>
- Committer: vision71tech <zaidbinasim2197@gmail.com>; committed 2026-10-01T10:58:36+05:00
- Changed files: server/auth/permissions.js, server/auth/permissions.test.mjs



### 2026-10-01T14:09:30+05:00 — Implemented UI changes, linked the contact with haroon bhai's google sheet and constant contact, duplicate review flow integrated

- Commit: [754f25a43e87f0091c727b047b3effdaa1a4f56e](https://github.com/zaidasim-sd/CardLens/commit/754f25a43e87f0091c727b047b3effdaa1a4f56e)
- Author: Ibrahim Ahmed <iamalik2005@gmail.com>
- Committer: Ibrahim Ahmed <iamalik2005@gmail.com>; committed 2026-10-01T14:09:30+05:00
- Changed files: .env.example, .gitignore, README.md, api/config/exhibitions.js, api/constant-contact.js, api/cron/constant-contact.js, config/sheetMapping.json, docs/CONSTANT_CONTACT.md, docs/IMPLEMENTATION_NOTES.md, docs/SETUP.md, package-lock.json, scripts/configure-sheet.mjs, server/audit/service.integration.test.mjs, server/audit/service.js, server/auth/password.js, server/cards/duplicateReview.integration.test.mjs, server/cards/duplicateReview.js, server/cards/service.integration.test.mjs, server/cards/service.js, server/db.js, server/export/service.js, server/http/cardHandlers.js, server/http/constantContactCron.js, server/http/constantContactHandler.js, server/index.js, server/integrations/constantContact.js, server/integrations/constantContact.test.mjs, server/integrations/sheetService.js, server/integrations/sheetService.test.mjs, server/retention/service.integration.test.mjs, src/components/ConstantContactSettings.tsx, src/components/scanner/DuplicateWarningModal.tsx, src/components/scanner/OCRReviewModal.tsx, src/components/verified/DuplicateReviewPanel.tsx, src/components/verified/EditContactModal.tsx, src/components/verified/ReviewContactModal.tsx, src/lib/api/contacts.ts, src/lib/api/exhibitions.ts, src/lib/csvExport.ts, src/lib/duplicateChecker.ts, src/pages/SignInPage.tsx, src/pages/UserAdminPage.tsx, src/pages/VerifiedQueuePage.tsx, src/types/index.ts, vercel.json



### 2026-10-01T14:27:47+05:00 — Fix Vercel function count limit

- Commit: [116e415ffa93fa20f4a9a20bf49ad4f7c9876d7a](https://github.com/zaidasim-sd/CardLens/commit/116e415ffa93fa20f4a9a20bf49ad4f7c9876d7a)
- Author: Ibrahim Ahmed <iamalik2005@gmail.com>
- Committer: Ibrahim Ahmed <iamalik2005@gmail.com>; committed 2026-10-01T14:27:47+05:00
- Changed files: api/cron/constant-contact.js, api/cron/sweep.js, docs/VERCEL_DEPLOYMENT.md, vercel.json



### 2026-10-01T14:42:18+05:00 — Fix Assigned Role & Permissions dropdown overlapping lower card

- Commit: [79d3523e476a37db8260bb77893c4b5dc85f7138](https://github.com/zaidasim-sd/CardLens/commit/79d3523e476a37db8260bb77893c4b5dc85f7138)
- Author: vision71tech <zaidbinasim2197@gmail.com>
- Committer: vision71tech <zaidbinasim2197@gmail.com>; committed 2026-10-01T14:42:18+05:00
- Changed files: src/pages/UserAdminPage.tsx



### 2026-10-01T15:04:40+05:00 — Replace top orange prototype banner with clean calm dialog popup

- Commit: [a96a2c715ad8274b42f453aa9557188ed583c47f](https://github.com/zaidasim-sd/CardLens/commit/a96a2c715ad8274b42f453aa9557188ed583c47f)
- Author: vision71tech <zaidbinasim2197@gmail.com>
- Committer: vision71tech <zaidbinasim2197@gmail.com>; committed 2026-10-01T15:04:40+05:00
- Changed files: src/pages/SignInPage.tsx



### 2026-10-02T11:23:22+05:00 — Fix the UI, changed the theme of capturerand admin, added a landing page

- Commit: [9ac395f0c5ec145adb44430f38bc17435cae78e1](https://github.com/zaidasim-sd/CardLens/commit/9ac395f0c5ec145adb44430f38bc17435cae78e1)
- Author: Ibrahim Ahmed <iamalik2005@gmail.com>
- Committer: Ibrahim Ahmed <iamalik2005@gmail.com>; committed 2026-10-02T11:23:22+05:00
- Changed files: capture-1440.png, capture-390.png, capture-mobile-timeline.png, capture-refined.png, index.html, server/cards/service.js, server/http/cardHandlers.js, server/integrations/sheetService.js, server/integrations/sheetService.test.mjs, src/App.tsx, src/components/GoogleSheetStatus.tsx, src/components/layout/AppLayout.tsx, src/components/layout/Header.tsx, src/components/layout/MobileNav.tsx, src/components/layout/UserProfileDropdown.tsx, src/components/scanner/OCRReviewModal.tsx, src/index.css, src/pages/LandingPage.tsx, src/pages/ScanPage.tsx, src/pages/SignInPage.tsx, src/pages/UserAdminPage.tsx, src/pages/VerifiedQueuePage.tsx, src/pages/admin.css, src/pages/capture.css, src/pages/landing.css, src/pages/signin.css, src/types/index.ts, vercel.json



### 2026-10-02T13:07:00+05:00 — Added footer with v71 logo and link, fixed navbar for desktop, removed name from card animation

- Commit: [0b86d4f576a4a9100b84ac603064e71ab405e8eb](https://github.com/zaidasim-sd/CardLens/commit/0b86d4f576a4a9100b84ac603064e71ab405e8eb)
- Author: Ibrahim Ahmed <iamalik2005@gmail.com>
- Committer: Ibrahim Ahmed <iamalik2005@gmail.com>; committed 2026-10-02T13:07:00+05:00
- Changed files: footer-preview.png, legal-page-preview.png, public/vision71-logo.png, src/App.tsx, src/components/layout/Header.tsx, src/components/layout/SiteFooter.css, src/components/layout/SiteFooter.tsx, src/index.css, src/pages/HomePage.tsx, src/pages/LandingPage.tsx, src/pages/LegalPage.tsx, src/pages/ScanPage.tsx, src/pages/capture.css, src/pages/landing.css, src/pages/legal.css, src/pages/legalContent.json, src/pages/signin.css



### 2026-10-02T17:58:51+05:00 — Replaced cardsnap with lead71

- Commit: [ede50882b2f17e207a32ccad963dbc7b05ff9f50](https://github.com/zaidasim-sd/CardLens/commit/ede50882b2f17e207a32ccad963dbc7b05ff9f50)
- Author: Ibrahim Ahmed <iamalik2005@gmail.com>
- Committer: Ibrahim Ahmed <iamalik2005@gmail.com>; committed 2026-10-02T17:58:51+05:00
- Changed files: index.html, lead71-brand-preview.png, public/Lead71_Official.png, public/lead71-logo-footer.svg, public/lead71-logo.svg, server/http/authHandlers.js, server/http/exportHandler.js, server/integrations/sheetService.js, src/components/layout/Header.tsx, src/components/layout/Sidebar.tsx, src/components/layout/SiteFooter.css, src/components/layout/SiteFooter.tsx, src/components/layout/UserProfileDropdown.tsx, src/components/scanner/DemoCardModal.tsx, src/components/ui/LoadingScreen.tsx, src/lib/api/client.ts, src/lib/api/export.ts, src/pages/LandingPage.tsx, src/pages/LegalPage.tsx, src/pages/ScanPage.tsx, src/pages/SignInPage.tsx, src/pages/UserAdminPage.tsx, src/pages/VerifiedQueuePage.tsx, src/pages/landing.css, src/pages/legalContent.json, src/pages/signin.css



### 2026-10-03T12:31:49+05:00 — Removed constatn contact linkage, connected to new official sheet, removed review queue from capturer, simplified the overall flow

- Commit: [868c2353a381063bb2ea4cf1c0ff07a35b8727bd](https://github.com/zaidasim-sd/CardLens/commit/868c2353a381063bb2ea4cf1c0ff07a35b8727bd)
- Author: Ibrahim Ahmed <iamalik2005@gmail.com>
- Committer: Ibrahim Ahmed <iamalik2005@gmail.com>; committed 2026-10-03T12:31:49+05:00
- Changed files: .env.example, config/pilot.json, docs/lead71-pilot.md, package.json, scripts/bootstrap-tests.mjs, scripts/pilot-live-smoke.mjs, server/audit/service.integration.test.mjs, server/auth/permissions.js, server/auth/permissions.test.mjs, server/auth/service.integration.test.mjs, server/auth/service.js, server/cards/duplicateReview.integration.test.mjs, server/cards/duplicateReview.js, server/cards/service.integration.test.mjs, server/cards/service.js, server/export/service.js, server/http/cardHandlers.js, server/http/constantContactCron.js, server/http/constantContactHandler.js, server/index.js, server/integrations/constantContact.js, server/integrations/constantContact.test.mjs, server/integrations/pilotFlow.integration.test.mjs, server/integrations/sheetService.js, server/integrations/sheetService.test.mjs, server/integrations/submissionSheet.integration.test.mjs, server/pilot.js, server/retention/service.integration.test.mjs, src/App.tsx, src/components/auth/ProtectedRoute.tsx, src/components/layout/Header.tsx, src/components/layout/MobileNav.tsx, src/components/scanner/DuplicateWarningModal.tsx, src/components/scanner/OCRReviewModal.tsx, src/components/verified/EditContactModal.tsx, src/config/pilot.ts, src/lib/api/contacts.ts, src/pages/HomePage.tsx, src/pages/LandingPage.tsx, src/pages/ScanPage.tsx, src/pages/SignInPage.tsx, src/pages/UserAdminPage.tsx, src/pages/VerifiedQueuePage.tsx, src/pages/capture.css, src/pages/landing.css



### 2026-10-03T13:05:50+05:00 — Fixed the lead71 card ID format, and changed the landing page animation

- Commit: [cab5ff7377e46d805fc2731c560c7e8f85a2e873](https://github.com/zaidasim-sd/CardLens/commit/cab5ff7377e46d805fc2731c560c7e8f85a2e873)
- Author: Ibrahim Ahmed <iamalik2005@gmail.com>
- Committer: Ibrahim Ahmed <iamalik2005@gmail.com>; committed 2026-10-03T13:05:50+05:00
- Changed files: docs/lead71-pilot.md, package.json, scripts/lib/backup.test.mjs, server/cards/recordId.integration.test.mjs, server/cards/recordId.js, server/cards/service.js, server/db.js, server/integrations/sheetService.js, server/integrations/submissionSheet.integration.test.mjs, src/components/scanner/OCRReviewModal.tsx, src/pages/LandingPage.tsx, src/pages/landing.css, src/types/index.ts



### 2026-10-05T11:03:29+05:00 — Added Signup with Email OTP and Continue with Google

- Commit: [d5a27f7d384f6be75d6445ce8e890e7d867199d1](https://github.com/zaidasim-sd/CardLens/commit/d5a27f7d384f6be75d6445ce8e890e7d867199d1)
- Author: vision71tech <zaidbinasim2197@gmail.com>
- Committer: vision71tech <zaidbinasim2197@gmail.com>; committed 2026-10-05T11:03:29+05:00
- Changed files: .env.example, BATCH_TEST_REPORT.md, api/config/exhibitions.js, latest-otp.txt, package-lock.json, package.json, public/Cards/001_jpg.rf.faa392db48394a04c2ac14de51421892.jpg, public/Cards/002_jpg.rf.2a24a6edd52c08b40eb185ce64faac5f.jpg, public/Cards/003_jpg.rf.b6ba0b8b60d04265999f8ca40c9e2ca2 - Copy.jpg, public/Cards/003_jpg.rf.b6ba0b8b60d04265999f8ca40c9e2ca2.jpg, public/Cards/005_jpg.rf.9ddb1c06f267ca64bd7d8902733b824b.jpg, public/Cards/006_jpg.rf.746fd6a393fedba0e70eccebfecd7d30.jpg, public/Cards/007_jpg.rf.b4be27d55c97a0258d075723a1eb4d03.jpg, public/Cards/009_jpg.rf.e58baa1e6251b3b043bfb65ccfc4b301.jpg, public/Cards/010_jpg.rf.4963c5e153df5455db2c4b9e5ce64158.jpg, public/Cards/011_jpg.rf.69d5b4bacd94b293d623f94222718869.jpg, public/Cards/013_jpg.rf.4294456067cc70b27775d01c4ee2f6e9.jpg, public/Cards/014_jpg.rf.7863fb93466931221f1cd7cf1dc23033.jpg, public/Cards/015_jpg.rf.a4d9fd4355245f9c3e3fbf56814403cb.jpg, public/Cards/016_jpg.rf.7e0c435fbb6e91b0f1b2fe7609453acd.jpg, public/Cards/017_jpg.rf.f4cd7d5b819156d20cd27ee1bcbc604c.jpg, public/Cards/018_jpg.rf.3bda4e8fdc2d21d88bc13ded62879e0e.jpg, public/Cards/019_jpg.rf.06e46e93400e612b3d9f32391be67138.jpg, public/Cards/020_jpg.rf.8d2830e1de0f0fd21269fafc06347163.jpg, public/Cards/021_jpg.rf.2abc36e6e16e5595089c3f9fedbb6fc5.jpg, public/Cards/022_jpg.rf.2febb5765862038e403d3dc38a5203e0.jpg, public/Cards/024_jpg.rf.bdda5639f9fc757125235bcef0ef73d3.jpg, public/Cards/025_jpg.rf.5c1de0ac24762d76bcebc194c037a2fa.jpg, public/Cards/026_jpg.rf.4a4ee2576d5d2d1c0f195af006da7b33.jpg, public/Cards/027_jpg.rf.a26faffddb64ef70dea6822a976918a8.jpg, public/Cards/028_jpg.rf.1c2c4c9c49aef5c3889016c6c44f186f.jpg, public/Cards/029_jpg.rf.9011b4789bab04afb1ff0821b20846d4.jpg, public/Cards/030_jpg.rf.2be601e701bb6615586fdafb5a4ec118.jpg, public/Cards/031_jpg.rf.15ac674f9b3185c25b948d5b6e466bed.jpg, public/Cards/033_jpg.rf.58ecbf735524d47e4321fb0d33ce5ea2.jpg, public/Cards/034_jpg.rf.a5b3dc02de9a88ae2fdd6feef49de7ee.jpg, public/Cards/IMG_20200209_183222.jpg, public/Cards/IMG_20200209_183235.jpg, public/Cards/IMG_20200209_183246.jpg, public/Cards/IMG_20200209_183310.jpg, public/Cards/IMG_20200209_183324.jpg, public/Cards/IMG_20200209_183333.jpg, public/Cards/IMG_20200209_183341.jpg, public/Cards/IMG_20200209_183353.jpg, public/Cards/IMG_20200209_183424.jpg, public/Cards/IMG_20200209_183439.jpg, public/Cards/IMG_20200209_183500.jpg, public/Cards/IMG_20200209_183544.jpg, public/Cards/IMG_20200209_183552.jpg, public/Cards/IMG_20200209_183600.jpg, public/Cards/IMG_20200209_183605.jpg, public/Cards/IMG_20200209_183612.jpg, public/Cards/IMG_20200209_183617.jpg, public/Cards/IMG_20200209_183629.jpg, public/Cards/IMG_20200209_183638.jpg, public/Cards/IMG_20200209_183645.jpg, public/Cards/IMG_20200209_183650.jpg, public/Cards/IMG_20200209_183702.jpg, public/Cards/IMG_20200209_183814.jpg, public/Cards/IMG_20200209_183822.jpg, public/Cards/IMG_20200209_183830.jpg, public/Cards/IMG_20200209_183842.jpg, public/Cards/IMG_20200209_183845.jpg, public/Cards/IMG_20200209_183857.jpg, public/Cards/IMG_20200209_183903.jpg, public/Cards/IMG_20200209_183909.jpg, public/Cards/IMG_20200209_183917.jpg, public/Cards/IMG_20200209_183930.jpg, public/Cards/IMG_20200209_183935.jpg, public/Cards/IMG_20200209_183943.jpg, public/Cards/IMG_20200209_183951.jpg, public/Cards/IMG_20200209_183958.jpg, public/Cards/IMG_20200209_184004.jpg, public/Cards/IMG_20200209_184011.jpg, public/Cards/IMG_20200209_184018.jpg, public/Cards/IMG_20200209_184028.jpg, public/Cards/IMG_20200209_184033.jpg, public/Cards/IMG_20200209_184039.jpg, public/Cards/IMG_20200209_184044.jpg, public/Cards/IMG_20200209_184049.jpg, public/Cards/IMG_20200209_184057.jpg, public/Cards/IMG_20200209_184103.jpg, public/Cards/IMG_20200209_184111.jpg, public/Cards/IMG_20200209_184117.jpg, public/Cards/IMG_20200209_184124.jpg, public/Cards/IMG_20200209_184129.jpg, public/Cards/IMG_20200209_184135.jpg, public/Cards/IMG_20200209_184141.jpg, public/Cards/IMG_20200209_184146.jpg, public/Cards/IMG_20200209_184151.jpg, scripts/batch-test-cards.mjs, scripts/reset-user-password.mjs, scripts/unlock-accounts.mjs, server/auth/service.js, server/http/authHandlers.js, server/index.js, server/notifications/emailService.js, src/App.tsx, src/auth/AuthContext.tsx, src/components/auth/GoogleSignInButton.tsx, src/components/scanner/DuplicateWarningModal.tsx, src/components/scanner/OCRReviewModal.tsx, src/lib/api/exhibitions.ts, src/lib/firebase.ts, src/pages/ApproveUserPage.tsx, src/pages/CreateAccountPage.tsx, src/pages/LandingPage.tsx, src/pages/PendingApprovalPage.tsx, src/pages/ScanPage.tsx, src/pages/SignInPage.tsx, src/pages/UserAdminPage.tsx, src/pages/VerifyOtpPage.tsx, src/pages/capture.css, src/pages/signin.css



### 2026-10-05T11:50:41+05:00 — Card details removed from MongoDB, passwords stored on Firebase Auth

- Commit: [a5a7ec12a90d0cd362806e2ef8340a5fadf1cec0](https://github.com/zaidasim-sd/CardLens/commit/a5a7ec12a90d0cd362806e2ef8340a5fadf1cec0)
- Author: HaroonMirza002 <haroon.mirza040602@gmail.com>
- Committer: HaroonMirza002 <haroon.mirza040602@gmail.com>; committed 2026-10-05T11:50:41+05:00
- Changed files: .env.example, docs/CardSnap_Ali_Bhai_Google_Sheets_and_Production_Architecture.docx, docs/CardSnap_Ali_Bhai_Setup_Request_and_Architecture.docx, docs/legacy-sheet-verification.json, docs/mongodb-pilot-privacy.md, docs/pilot-privacy/01-privacy-facts-sheet.md, docs/pilot-privacy/02-privacy-notice-draft.md, docs/pilot-privacy/03-terms-of-use-draft.md, docs/pilot-privacy/04-aventure-data-service-agreement-draft.md, docs/pilot-privacy/05-evidence-and-launch-checklist.md, docs/pilot-privacy/README.md, docs/pilot-privacy/build_concise_legal.py, docs/pilot-privacy/build_legal_drafts.py, docs/pilot-privacy/build_simple_document.py, docs/pilot-privacy/extract_one_page.py, docs/pilot-privacy/render_facts_sheet.py, output/documents/CardSnap Privacy Facts Sheet.docx, output/documents/CardSnap Privacy Terms and Aventure Agreement.docx, output/documents/CardSnap Privacy and Pilot Documents.docx, output/documents/CardSnap Product Privacy Terms and Aventure Agreement.docx, output/pdf/cardsnap-privacy-facts-sheet.pdf, scripts/link-firebase-user.mjs, scripts/purge-legacy-contact-storage.mjs, scripts/seed-internal-users.mjs, scripts/verify-legacy-sheet-delivery.mjs, server/audit/service.js, server/auth/firebaseIdentity.js, server/auth/firebaseIdentity.test.mjs, server/auth/service.js, server/cards/directSubmission.js, server/cards/directSubmission.test.mjs, server/cards/recordId.js, server/cards/service.js, server/db.js, server/http/cardHandlers.js, server/http/ocrHandler.js, server/http/ocrHandler.test.mjs, src/auth/AuthContext.tsx, src/components/auth/GoogleSignInButton.tsx, src/components/scanner/OCRReviewModal.tsx, src/lib/api/contacts.ts, src/pages/CreateAccountPage.tsx, src/pages/ScanPage.tsx, src/pages/SignInPage.tsx, src/pages/VerifyOtpPage.tsx, tmp/CardSnap_Ali_Bhai_Setup_Request_and_Architecture.pdf, tmp/create_ali_brief.py, tmp/create_ali_setup_brief.py, tmp/docx_one_page/CardSnap Privacy Facts Sheet.pdf, tmp/docx_one_page/page-1.png, tmp/docx_simple/CardSnap Privacy and Pilot Documents.pdf, tmp/docx_simple/page-1.png, tmp/docx_simple/page-2.png, tmp/docx_simple/page-3.png, tmp/docx_simple/page-4.png, tmp/docx_simple/page-5.png, tmp/docx_simple_final/CardSnap Privacy and Pilot Documents.pdf, tmp/docx_simple_final/page-1.png, tmp/docx_simple_final/page-2.png, tmp/docx_simple_final/page-3.png, tmp/docx_simple_final/page-4.png, tmp/docx_simple_final/page-5.png, tmp/final-build.txt, tmp/final-tests.txt, tmp/legal_concise/CardSnap Privacy Terms and Aventure Agreement.pdf, tmp/legal_concise/page-1.png, tmp/legal_concise/page-2.png, tmp/legal_concise/page-3.png, tmp/legal_concise/page-4.png, tmp/legal_drafts/CardSnap Privacy Terms and Aventure Agreement.pdf, tmp/legal_drafts/page-1.png, tmp/legal_drafts/page-2.png, tmp/legal_drafts/page-3.png, tmp/legal_drafts/page-4.png, tmp/legal_drafts/page-5.png, tmp/legal_drafts/page-6.png, tmp/legal_drafts/page-7.png, tmp/legal_product/CardSnap Privacy Terms and Aventure Agreement.pdf, tmp/legal_product/page-1.png, tmp/legal_product/page-2.png, tmp/legal_product/page-3.png, tmp/legal_product/page-4.png, tmp/legal_product_revised/CardSnap Product Privacy Terms and Aventure Agreement.pdf, tmp/legal_product_revised/page-1.png, tmp/legal_product_revised/page-2.png, tmp/legal_product_revised/page-3.png, tmp/legal_product_revised/page-4.png, tmp/pdfs/cardsnap-facts.png, tmp/pdfs/internal-brief/page-1.png, tmp/pdfs/internal-brief/page-2.png, tmp/pdfs/internal-brief/page-3.png, tmp/pdfs/internal-brief/page-4.png, tmp/pdfs/internal-brief/page-5.png, tmp/pdfs/internal-brief/page-6.png, tmp/pdfs/internal-brief/page-7.png



### 2026-10-05T12:46:31+05:00 — fix: added support @vision71tech.com email addresses for testing

- Commit: [28f0631636f648b4cabc9774c570d66fa6a3b955](https://github.com/zaidasim-sd/CardLens/commit/28f0631636f648b4cabc9774c570d66fa6a3b955)
- Author: mhassan-04 <mhassan@vision71tech.com>
- Committer: mhassan-04 <mhassan@vision71tech.com>; committed 2026-10-05T12:46:31+05:00
- Changed files: .env.example, config/pilot.json, package-lock.json, server/auth/domainToggle.test.mjs, server/auth/service.js, src/components/auth/GoogleSignInButton.tsx, src/components/scanner/OCRReviewModal.tsx, src/lib/authConfig.ts, src/lib/authErrors.ts, src/lib/firebase.ts, src/pages/CreateAccountPage.tsx, src/pages/SignInPage.tsx, src/pages/UserAdminPage.tsx, src/pages/VerifyOtpPage.tsx, vite.config.ts



### 2026-10-05T13:09:24+05:00 — feat(auth): configure test approver emails and show verified pending approval UI

- Commit: [298ba5594e81350bee1bfce84577ffd39387c62f](https://github.com/zaidasim-sd/CardLens/commit/298ba5594e81350bee1bfce84577ffd39387c62f)
- Author: mhassan-04 <mhassan@vision71tech.com>
- Committer: mhassan-04 <mhassan@vision71tech.com>; committed 2026-10-05T13:09:24+05:00
- Changed files: .env.example, server/auth/service.integration.test.mjs, server/auth/service.js, src/pages/ApproveUserPage.tsx, src/pages/PendingApprovalPage.tsx



### 2026-10-05T14:49:03+05:00 — fix: removed user accounts from mongodb, moved all auth related logic to firebase and allowed admin verification before first-time sign in

- Commit: [7d334468120850a8e8fb6e8b64e0718cc12791ef](https://github.com/zaidasim-sd/CardLens/commit/7d334468120850a8e8fb6e8b64e0718cc12791ef)
- Author: mhassan-04 <mhassan@vision71tech.com>
- Committer: mhassan-04 <mhassan@vision71tech.com>; committed 2026-10-05T14:49:03+05:00
- Changed files: server/auth/cookies.js, server/auth/service.js, server/cards/service.js, server/db.js, server/export/service.js, server/index.js, server/integrations/constantContact.js, server/integrations/sheetService.js, server/notifications/emailService.js, src/auth/AuthContext.tsx, src/components/auth/GoogleSignInButton.tsx, src/lib/authErrors.ts, src/lib/firebase.ts, src/pages/CreateAccountPage.tsx, src/pages/PendingApprovalPage.tsx, src/pages/SignInPage.tsx



### 2026-10-05T16:09:38+05:00 — Consistent UI for all popup's and email formatting improved, added reply to in env as well

- Commit: [147efb49236e6be71387de5caf4ef2c8607ebf33](https://github.com/zaidasim-sd/CardLens/commit/147efb49236e6be71387de5caf4ef2c8607ebf33)
- Author: zaidasim-sd <zaid.sd@vision71tech.com>
- Committer: zaidasim-sd <zaid.sd@vision71tech.com>; committed 2026-10-05T16:09:38+05:00
- Changed files: .env.example, latest-otp.txt, scripts/test-emails.js, server/auth/firebaseIdentity.test.mjs, server/auth/service.js, server/notifications/emailService.js, src/App.tsx, src/pages/ApproveUserPage.tsx, src/pages/ForgotPasswordPage.tsx, src/pages/PendingApprovalPage.tsx, src/pages/ResetPasswordPage.tsx, src/pages/SignInPage.tsx, src/pages/UserAdminPage.tsx, src/pages/VerifyOtpPage.tsx



### 2026-10-05T16:48:23+05:00 — image size issue resolved and removed the word aventure aviation from codebase

- Commit: [9d082a5c3310e79428a8e3f1f9dec34e9e0934b9](https://github.com/zaidasim-sd/CardLens/commit/9d082a5c3310e79428a8e3f1f9dec34e9e0934b9)
- Author: zaidasim-sd <zaid.sd@vision71tech.com>
- Committer: zaidasim-sd <zaid.sd@vision71tech.com>; committed 2026-10-05T16:48:23+05:00
- Changed files: latest-otp.txt, server/auth/service.js, server/cards/directSubmission.js, server/http/ocrHandler.js, server/index.js, server/notifications/emailService.js, src/auth/AuthContext.tsx, src/components/layout/UserProfileDropdown.tsx, src/components/scanner/DuplicateWarningModal.tsx, src/components/scanner/OCRReviewModal.tsx, src/lib/api/client.ts, src/lib/authConfig.ts, src/pages/CreateAccountPage.tsx, src/pages/LandingPage.tsx, src/pages/ScanPage.tsx, src/pages/UserAdminPage.tsx, src/pages/legalContent.json



### 2026-10-05T16:58:03+05:00 — card capture or upload image crop issue fixed

- Commit: [4d075b534377074624ef8129fc07a1f162ff32bd](https://github.com/zaidasim-sd/CardLens/commit/4d075b534377074624ef8129fc07a1f162ff32bd)
- Author: zaidasim-sd <zaid.sd@vision71tech.com>
- Committer: zaidasim-sd <zaid.sd@vision71tech.com>; committed 2026-10-05T16:58:03+05:00
- Changed files: src/lib/imageCrop.ts, src/pages/ScanPage.tsx



### 2026-10-05T17:08:52+05:00 — footer logo updated

- Commit: [361d5025240a0069aba8fd965eaeb39797ae8d7e](https://github.com/zaidasim-sd/CardLens/commit/361d5025240a0069aba8fd965eaeb39797ae8d7e)
- Author: zaidasim-sd <zaid.sd@vision71tech.com>
- Committer: zaidasim-sd <zaid.sd@vision71tech.com>; committed 2026-10-05T17:08:52+05:00
- Changed files: public/Lead71_wnb.png, public/lead71-logo-footer.svg, src/components/layout/SiteFooter.css, src/components/layout/SiteFooter.tsx



### 2026-10-05T17:48:08+05:00 — submit for review issue fixed

- Commit: [93dce37d328d3bbab43d60e9badbcd7d3b9ddbe7](https://github.com/zaidasim-sd/CardLens/commit/93dce37d328d3bbab43d60e9badbcd7d3b9ddbe7)
- Author: zaidasim-sd <zaid.sd@vision71tech.com>
- Committer: zaidasim-sd <zaid.sd@vision71tech.com>; committed 2026-10-05T17:48:08+05:00
- Changed files: latest-otp.txt, public/audit-screenshots/approve_user_desktop_1791198149439.png, public/audit-screenshots/approve_user_mobile_1791198188300.png, public/audit-screenshots/forgot_password_desktop_1791197767472.png, public/audit-screenshots/forgot_password_mobile_1791197735317.png, public/audit-screenshots/pending_approval_desktop_1791197945974.png, public/audit-screenshots/pending_approval_desktop_bottom_1791197993667.png, public/audit-screenshots/pending_approval_mobile_1791198024919.png, public/audit-screenshots/pending_approval_mobile_top_1791198059830.png, public/audit-screenshots/port_4173_check_1791177922802.png, public/audit-screenshots/reset_password_unavailable_desktop_1791198260232.png, public/audit-screenshots/reset_password_unavailable_mobile_1791198293976.png, public/audit-screenshots/signin_127_mobile_1791177851624.png, public/audit-screenshots/signin_desktop_1791197652961.png, public/audit-screenshots/signin_mobile_1791197682873.png, public/audit-screenshots/signin_mobile_375x667_1791177797424.png, public/audit-screenshots/verify_otp_desktop_1791197816393.png, public/audit-screenshots/verify_otp_mobile_1791197856356.png, server/cards/directSubmission.js, src/components/layout/SiteFooter.css, src/components/layout/SiteFooter.tsx, src/components/scanner/OCRReviewModal.tsx



### 2026-10-05T18:27:22+05:00 — Added hala and osman as admins, fixed scan card button and submit for review button, admins can now capture cards

- Commit: [44bca598a2b7e26331b7da03ac763b896abb7585](https://github.com/zaidasim-sd/CardLens/commit/44bca598a2b7e26331b7da03ac763b896abb7585)
- Author: ibrahim-v71 <ibrahim@vision71tech.com>
- Committer: ibrahim-v71 <ibrahim@vision71tech.com>; committed 2026-10-05T18:27:22+05:00
- Changed files: server/auth/administratorAccess.test.mjs, server/auth/permissions.js, server/auth/permissions.test.mjs, server/auth/service.js, server/cards/directSubmission.test.mjs, server/http/ocrHandler.test.mjs, server/services/cardClassification.js, server/services/cardClassification.test.mjs, shared/workEmail.d.mts, shared/workEmail.mjs, shared/workEmail.test.mjs, src/App.tsx, src/components/layout/AppLayout.tsx, src/components/layout/Header.tsx, src/components/layout/MobileNav.tsx, src/components/scanner/OCRReviewModal.tsx, src/components/scanner/reviewSubmit.css, src/pages/CreateAccountPage.tsx, src/pages/HomePage.tsx, src/pages/ScanPage.tsx, src/pages/SignInPage.tsx



### 2026-10-05T18:39:17+05:00 — Fixed admin scan

- Commit: [453ec01be0e20a83731aa14b7dd747374e46bac0](https://github.com/zaidasim-sd/CardLens/commit/453ec01be0e20a83731aa14b7dd747374e46bac0)
- Author: ibrahim-v71 <ibrahim@vision71tech.com>
- Committer: ibrahim-v71 <ibrahim@vision71tech.com>; committed 2026-10-05T18:39:17+05:00
- Changed files: src/components/layout/Header.tsx, src/components/layout/MobileNav.tsx, src/pages/ScanPage.tsx



### 2026-10-06T17:16:07+05:00 — Added dark mode and gpt suggested fixes

- Commit: [63a4cd3458769123587fae5c067e22b3e2040f98](https://github.com/zaidasim-sd/CardLens/commit/63a4cd3458769123587fae5c067e22b3e2040f98)
- Author: ibrahim-v71 <ibrahim@vision71tech.com>
- Committer: ibrahim-v71 <ibrahim@vision71tech.com>; committed 2026-10-06T17:16:07+05:00
- Changed files: .env.example, docs/password-reset-email.md, server/auth/passwordReset.js, server/auth/passwordReset.test.mjs, server/http/authHandlers.js, server/notifications/emailService.js, src/components/auth/GoogleSignInButton.tsx, src/components/layout/Header.tsx, src/components/layout/ThemeToggle.tsx, src/components/layout/UserProfileDropdown.tsx, src/components/scanner/OCRReviewModal.tsx, src/components/scanner/reviewSubmit.css, src/main.tsx, src/pages/ApproveUserPage.tsx, src/pages/CreateAccountPage.tsx, src/pages/ForgotPasswordPage.tsx, src/pages/LandingPage.tsx, src/pages/LegalPage.tsx, src/pages/PendingApprovalPage.tsx, src/pages/ResetPasswordPage.tsx, src/pages/ScanPage.tsx, src/pages/SignInPage.tsx, src/pages/VerifyOtpPage.tsx, src/uiPolish.css



### 2026-10-06T17:46:33+05:00 — pending approval popup issues fixed removed hala and osman names

- Commit: [11d3479821604be57644da6ff7f988871a9891e1](https://github.com/zaidasim-sd/CardLens/commit/11d3479821604be57644da6ff7f988871a9891e1)
- Author: zaidasim-sd <zaid.sd@vision71tech.com>
- Committer: zaidasim-sd <zaid.sd@vision71tech.com>; committed 2026-10-06T17:46:33+05:00
- Changed files: server/notifications/emailService.js, src/pages/PendingApprovalPage.tsx



### 2026-10-07T12:12:09+05:00 — Added back card scan optional feature, fixed mobile navbar

- Commit: [43dbda4700714f96169e93c767b12fcbc3729d65](https://github.com/zaidasim-sd/CardLens/commit/43dbda4700714f96169e93c767b12fcbc3729d65)
- Author: ibrahim-v71 <ibrahim@vision71tech.com>
- Committer: ibrahim-v71 <ibrahim@vision71tech.com>; committed 2026-10-07T12:12:09+05:00
- Changed files: scripts/cardSides.test.mjs, src/components/layout/Header.tsx, src/components/layout/LandingMobileMenu.tsx, src/components/layout/MobileNav.tsx, src/components/layout/ThemeToggle.tsx, src/components/layout/UserProfileDropdown.tsx, src/components/scanner/OCRReviewModal.tsx, src/components/scanner/reviewSubmit.css, src/lib/cardSides.ts, src/pages/LandingPage.tsx, src/pages/ScanPage.tsx



### 2026-10-07T13:03:39+05:00 — added morocco airshow

- Commit: [09f52a884ffd6b3cc44abf16415f44a7e75f1ed7](https://github.com/zaidasim-sd/CardLens/commit/09f52a884ffd6b3cc44abf16415f44a7e75f1ed7)
- Author: ibrahim-v71 <ibrahim@vision71tech.com>
- Committer: ibrahim-v71 <ibrahim@vision71tech.com>; committed 2026-10-07T13:03:39+05:00
- Changed files: .env.example, api/config/exhibitions.js, server/index.js, shared/exhibitions.d.mts, shared/exhibitions.mjs, src/lib/api/exhibitions.ts

