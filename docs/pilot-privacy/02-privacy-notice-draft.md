# CardSnap by Vision71 - Privacy Notice

**First draft for review - 29 September 2026 - NOT FOR PUBLICATION**

This draft describes the inspected prototype. It does not authorize real Aventure data. Bracketed fields and the deployment confirmations in the facts sheet must be resolved before publication. If pilot controls change the processing, update this notice before enabling the changed service.

## 1. Who is responsible

CardSnap is provided by **[Vision71 full legal entity, registered address and country]** ("Vision71"). Contact our privacy team at **[monitored privacy address]**.

For business cards collected for Aventure, **[Aventure full legal entity, address and privacy contact]** decides why contact information is collected, who may receive it and how it will be used. Vision71 processes that information on Aventure's documented instructions under its client agreement. Aventure provides its own notice explaining its business follow-up and any marketing. **[Insert Aventure notice link.]**

Vision71 is separately responsible for any personal information it uses for its own service administration, security or support. Before publication, confirm those activities, their providers and the applicable legal bases; this notice does not assume that a customer account system exists.

## 2. Information processed and its source

An operator can photograph or upload a business card, or enter contact information manually. Uploaded photos are prepared in the browser; the submitted image may be cropped. Images may contain more personal information than the fields shown on screen.

The system processes card images, filenames, extracted text, names, job titles, organisations, email addresses, telephone numbers, websites and postal location details present on cards. The reviewed form also accepts meeting location and notes. The stored record includes both the original OCR output and the reviewed values, a record ID, creation/verification times and a status. Some reviewed fields are blanked by the current form even though the original OCR text and extracted data remain stored.

The source is the card or information supplied by the operator, often following a business meeting. Do not submit identity documents, payment details, sensitive personal information, children's data or unrelated private notes. The service does not need those categories.

## 3. How the service uses information

CardSnap sends the submitted image to its backend for text extraction, returns suggested contact fields, allows the operator to review them, checks for possible duplicates within that browser's saved records and saves the reviewed record locally when submitted. Manual entry bypasses OCR. The built-in demonstration uses prepared fictional data and bypasses the OCR providers.

The current code does not send marketing, perform a separate manager approval workflow or transfer contacts to Constant Contact. "Submitted for review" is a screen label; saving currently assigns a `VERIFIED` status immediately. OCR and duplicate matching can be wrong. A person must check the information before using it. The inspected code does not make decisions producing legal or similarly significant effects about cardholders.

**Legal-basis completion required:** Aventure must state its purpose and applicable legal basis for collecting, storing and following up business contacts, including any legitimate-interest assessment or consent relied on. Vision71 must state the basis for its own security/support processing. Providing a business card, agreeing to these terms or accepting camera access is not, by itself, a record of consent to marketing. Applicable countries and laws have not yet been confirmed.

## 4. Who receives information

The service is hosted on Vercel at https://cardsnapbyv71.vercel.app/. The service backend receives the submitted image and handles the OCR result. The project owner confirms the current free tier; this does not confirm the processing location or contractual suitability for the pilot. **[Confirm Vercel contracting entity, approved commercial hosting arrangement, processing countries and deployed backend configuration before publication.]**

Google Cloud Vision is the primary OCR provider in the intended `both` configuration. If the Google call fails or its key is absent, the backend can send the same submitted image to OCR.space, operated by a9t9 software GmbH. The image itself includes its visible contact information. A failed or timed-out Google request may already have reached Google before fallback; a card may therefore reach both providers. **[Confirm production mode, enabled credentials, provider plans, entities, regions and agreements.]**

Authorised support personnel may access information only where needed and authorised under the client agreement. **[Confirm personnel, access countries and support tools.]** There is no central browser-record retrieval facility in the inspected backend; support copies, screen sharing and infrastructure access must be controlled separately.

There is no implemented Constant Contact connection and no current application transfer to that service. A separate manual import, if approved later, would be a disclosure controlled by Aventure and must be described before use. No analytics, advertising or remote-font integration was found in the inspected application; confirm whether the hosting configuration injects any additional services before making a wider claim.

## 5. Storage, retention and deletion

When a reviewed record is saved, its image, raw OCR, extracted fields and reviewed details are stored in the browser's IndexedDB database on that device. There is no application expiry timer or automatic deletion after review or transfer. They remain until removed, site storage is cleared or the browser evicts them. Closing the page or dismissing a preview does not delete saved records. This storage is not a reliable backup.

The inspected backend processes image buffers in memory without an application disk or object-storage write. This is not a guarantee of zero provider or infrastructure logging, or immediate secure memory erasure. Google's published documentation says its online image operations process image data in memory and do not persist it to disk; request metadata is temporarily logged. OCR.space's published policy says uploaded documents are deleted after processing and API access IP addresses are logged for one month. These are provider statements, not measurements of this deployment. See [Google's data usage documentation](https://docs.cloud.google.com/vision/docs/data-usage) and [OCR.space's privacy policy](https://ocr.space/privacypolicy).

**[Before publication insert approved retention periods or specific criteria for browser records/images, hosting logs, support records, exports and any device/hosting backups, with responsible owners and the tested deletion method.]** No production host-log or backup retention has been confirmed. Deleting browser data does not delete originals in a photo library, independent copies, provider logs or data separately imported elsewhere. Vision71 and Aventure must coordinate deletion across those locations where applicable.

## 6. Security and location

OCR provider requests use HTTPS and provider keys are accessed in backend code. The current application has no user login or role-based access control, and browser records are accessible to someone with access to that browser profile. The demonstration queue hides detail on screen but does not anonymise the stored record; duplicate review can display it.

**[Publication gate: confirm deployed HTTPS, identity/access restrictions, key restrictions, device security and approved security controls; replace this paragraph with the tested final arrangement.]** Do not describe the present service as an authenticated multi-user system.

Browser storage follows the location of the operator's device. Provider and hosting processing locations, support access countries and any international-transfer safeguards must be confirmed. The Google endpoint used in code is not an expressly selected EU or US regional endpoint. **[Insert actual countries, applicable transfer mechanism and how a copy of safeguards can be obtained.]**

## 7. Your choices and rights

Camera use requires browser permission and is optional; the service also supports file selection and manual entry. The current code uses browser storage for saved contacts and contains no application cookie-based login. **[Confirm host cookies and any additional storage before publication.]**

Contact Aventure at **[privacy address]** about its business-contact records, or Vision71 at **[privacy address]** about Vision71's own processing. Depending on applicable law, you may request access, correction, deletion, restriction or portability, object to processing (including direct marketing), and withdraw consent where processing relies on consent, without affecting earlier lawful processing. Rights may have legal conditions or exceptions. We will verify requests proportionately and direct processor-related requests to the responsible client.

You may complain to **[appropriate supervisory authority and contact/link for the confirmed jurisdiction]**, as well as contacting us. **[Insert any jurisdiction-specific disclosures or appeal process required by the final legal review.]** The prototype has no self-service privacy request portal or complete record deletion interface.

## 8. Contact and changes

Report a suspected exposure to **[monitored incident email and urgent telephone]**, without attaching card images or credentials to an ordinary email. We will provide a secure follow-up channel. We will date material changes to this notice and provide any notification required by law before changing the use of personal information. Effective date: **[after technical and legal approval]**.
