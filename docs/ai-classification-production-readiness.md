# Single card AI classification readiness plan

Prepared by Haroon Mirza for Ali. 20 October 2026.

I have prepared the staging implementation for one card and one editable review form. Google Cloud Vision reads the card. Gemini organises the extracted text into fields. The person capturing the card must check and edit every record before saving. This is local implementation and design evidence. It is not approval to deploy or a claim of production readiness.

## What I changed

The scan screen now requests AI classification and opens the existing review form directly. The two comparison columns are no longer part of the scan flow. The form retains exhibition or source, contact name, company, job title, email, phone and short notes. The existing optional back image, manual entry, submission identity and retry handling remain.

I commented out Batch Capture navigation and its route entry. The batch implementation remains available in the source for future work. The batch feature helper now returns false regardless of its environment flag. Both experimental paths redirect to the single card screen. The comparison component and API comparison mode are preserved for future controlled testing.

This checkout did not contain an active compression comparison screen. Its existing compression helper is preserved with an explanatory comment and is not called by the single card flow. Existing camera preparation and card cropping still operate as before. Disabling the compression experiment does not mean original camera bytes are always transmitted unchanged.

## Exact workflow

1. The signed in person captures or uploads one card and optionally its back.
2. The browser prepares the image and sends it to the authenticated OCR endpoint.
3. The server sends each supplied side to Google Cloud Vision. If both sides are supplied their text is combined for classification.
4. The existing mapper produces a baseline result. Gemini receives OCR text and field matching instructions through a server request.
5. The server validates the returned JSON and checks that extracted values are supported by the OCR text. Valid AI fields populate one editable form. These checks reduce invented values but cannot prove that a supported name or company has been assigned correctly.
6. The user checks the image, corrects fields, selects the source and adds short notes. No record is automatically saved after OCR.
7. Only the existing explicit Submit for review action invokes contact submission. Existing server validation, identity stamping and duplicate handling remain responsible for persistence. This change does not add a second approval system or remove the existing review obligations.

## Review design

The compact review header says Review before saving. A small static sparkle accompanies AI assisted field matching. The provider explanation is available through the information icon. An information icon opens a small popover explaining that Gemini helps organise detected details and that every field must be reviewed and edited before saving. The explanation is no longer an expanding dropdown. No success badge claims the values are automatically correct.

When AI fails the same form explains that the existing mapper supplied the fields. Manual entry and demo modes have their own wording so they do not imply that either provider processed a card.

The screenshots are the actual built app with dummy fixtures and mocked services. They demonstrate layout and behaviour only. They are not fresh provider accuracy or latency evidence. Desktop shows the whole form. Mobile evidence is split into multiple views so lower fields and notes remain visible.

![Desktop review showing all fields](../../lead71-ai-readiness/screenshots/ai_desktop.png)

![Mobile review upper section](../../lead71-ai-readiness/screenshots/ai_mobile_top.png)

![Mobile review name and source](../../lead71-ai-readiness/screenshots/ai_mobile_middle.png)

![Mobile review lower fields and notes](../../lead71-ai-readiness/screenshots/ai_mobile_fields.png)

![Fallback review](../../lead71-ai-readiness/screenshots/fallback_desktop.png)

## Fallback and failure handling

Missing Gemini credentials, upstream errors, rate limits, timeout, invalid JSON, schema errors and unsupported field values return the existing mapping result. Capture does not depend on Gemini being available. The form remains editable and submission follows the same existing rules. Incomplete values may still need manual correction before validation permits submission.

The classifier makes one request without automatic retry. Its default deadline is 8 seconds and configuration is bounded from 100 milliseconds to 15 seconds. Fallback therefore avoids indefinite waiting but can still add the timeout delay. The default model identifier in the code is gemini-3.5-flash-lite, overridden by GEMINI_CLASSIFICATION_MODEL. I did not verify model availability against Google during this work.

A Vision failure or unreadable card is a separate failure. Gemini cannot recover text that OCR never read. The user must retake the photo or enter the details manually. Authentication, connectivity and storage failures are also separate from the Gemini fallback and retain their existing handling.

## Data protection and ownership

The card image goes to Google Cloud Vision through the server. The Gemini request contains extracted OCR text, field instructions and a response schema. It does not contain image bytes in the implemented classifier. OCR text can include personal names, email addresses, phone numbers and addresses, including details not eventually retained in the form.

The browser receives OCR text and parsed fields for the scan session. The existing contact submission sends the verified form and submission metadata rather than the image or OCR text. I have not verified all downstream retention, infrastructure logging or historical data stores in this implementation check. Do not describe the whole system as having zero retention.

The classifier does not deliberately log OCR text or API keys. Provider side processing and retention still apply. Google states that unpaid Gemini services can use submitted content and responses to improve products and permit human review. Paid service terms differ when the relevant project has active Cloud billing. Google also describes abuse monitoring retention of prompts and responses for 55 days. These distinctions must be checked against the actual account and service configuration before confidential client data is permitted.

The previously reported Gemini setup was a personal Vision71 testing account belonging to Ibrahim. The previously reported Vision key belonged to a production project. Neither statement is an independently verified ownership or billing audit in this change. No new provider calls were made. These configurations do not establish the required dedicated organisation controlled staging or production setup.

Before client use, Ali must arrange or approve a Vision71 controlled project, organisation access, billing owner, key ownership and recovery arrangements. Record project identifiers, account administrators and the named billing owner in a restricted deployment checklist. Keep key values out of reports and source control. Use server secrets, restrict service access, set quotas, rotate keys and confirm any available retention and data sharing settings. Obtain client approval for the named processors and the intended data transfer. Free personal testing access is not the proposed confidential client arrangement.

## Monitoring and release ownership

Proposed responsibility is Haroon for application failures and mapping quality, a Vision71 project administrator appointed by Ali for IAM and quota controls, and a finance or billing owner appointed by Ali for cost alerts. These assignments need acceptance before release. No billing owner is verified or appointed by this report.

Implement structured counters for scans, AI attempts, success, fallback reason, timeout, rate limit, validation rejection, submission failure and duplicate response. Record request identifiers, model identifier, durations and token counts without raw OCR, contact values, images or credentials. Keep success and fallback machine times separate. Define log access, deletion schedules and an incident response owner.

Set provider quotas, application concurrency limits, spending alerts and alert recipients in the controlled project. A budget alert is not a guaranteed spending cap. Review errors and cost daily during an approved pilot. Agree alert thresholds and a response procedure before launch. Add a documented operational switch to use the baseline mapper without redeploying. These monitoring and operational controls remain production requirements rather than claims about this UI change.

Estimate Gemini cost from actual input and output token usage multiplied by the approved model prices, plus Vision units per supplied image and hosting or monitoring charges. Confirm model availability, project tier, quotas and expected monthly volume before giving a commercial price. No fresh usage cost or billing verification was performed here.

## Testing evidence and limits

The targeted automated suite passed 44 of 44 tests. It covers handler mapping selection, missing credentials, AI errors, rate limits, timeout, rejected output, classifier validation and the existing direct submission protections. A stale privacy test fixture was updated to assert the current prohibition on the users collection before checking nested forbidden fields in an allowed settings collection. No runtime database guard was changed.

TypeScript checking and a production frontend build passed. Browser checks used the built app, mocked authentication and mocked OCR. Both AI success and fallback opened exactly one editable form. Notes survived changing the exhibition. The AI mode request header was asserted. Batch and compression routes redirected to scan. No automatic submission, page runtime error or horizontal page overflow was observed at the tested mobile width. No real Vision, Gemini, Sheet or database request was made by these checks.

Historical evidence is separate. The existing compression evidence analysis contains 40 cards with 191 scored fields per arm and provisional references. Existing mapping matched 118 fields. Original image AI with baseline fallback matched 171 fields. That still leaves 20 mismatches. Pure AI matched 159 fields and had unavailable results. These are historical results from the earlier dataset, not a new benchmark of this checkout or proof on independently confirmed client cards.

The historical baseline identified 8 matching names out of 38 and 6 companies out of 37. Pure AI identified 30 names out of 38 and 28 companies out of 37. These counts support investigating field quality and do not establish zero false positives or eliminate human review. The restricted source evidence remains at D:\lead71-compression-evidence\results\analysis.json and field_scores.csv. Do not redistribute personal dataset records without authorisation.

Average human time saved per card has not been measured in a controlled before and after human review study. Earlier estimates mixed measured machine stages with assumed correction and verification time. They must remain labelled MODELLED and cannot be sold as measured savings. This change deliberately makes no new speed saving claim.

Before approval, test independent authorised mobile card photos with confirmed references, varied light, blur, angles and layouts. Measure field matches separately for name, company, title, email and phone. Count corrections, failures and retries. Time capture, upload, OCR, AI, actual human correction and submission acknowledgment separately. Include Gemini outage and quota exhaustion, slow response, malformed and misleading output, unreadable OCR, duplicate submit and failed writes. Recheck authorisation, tenant boundaries and data retention. Agree acceptance criteria with Ali before examining results.

## Release decision and verification folder

My recommendation is to review this local design and complete the ownership, privacy, monitoring and independent human testing gates before any commercial promise or deployment. The implementation improves the presentation and uses the existing validated fallback. It does not prove a complete production security review or measured human time saving.

Local work started on staging at commit 8e4ebbe111f1cefd838bfc4e63ce4f1d37b898f0. No commit, push or deployment was performed. No environment file was edited. Existing untracked output reports were preserved.

The folder D:\lead71-ai-readiness contains the built frontend, the reproducible local browser script, unit test output, browser check results and screenshots. The browser check report distinguishes mocked services from actual app UI. The repository contains the implementation and this readiness plan. All new screenshots show generated dummy data only.

## Official references

Read 20 October 2026. Confirm the current project settings against these policies before approving client data processing.

Google Gemini terms: https://ai.google.dev/gemini-api/terms

Google abuse monitoring and data handling: https://ai.google.dev/gemini-api/docs/usage-policies

Google Gemini pricing: https://ai.google.dev/gemini-api/docs/pricing

Google Vision pricing: https://cloud.google.com/vision/pricing

