# Aventure / Vision71 - Data & Service Agreement

**First draft with Data Processing Schedule | 29 September 2026**

**For client and legal review only. No live-data authorization.** This draft deliberately distinguishes contractual requirements from current implementation. The facts sheet records material gaps. No promise below is evidence that the related control already operates. Neither party may start real-data processing until the launch conditions are satisfied and written approval is recorded.

## 1. Parties and service order

| Item | Particulars to complete before signature |
|---|---|
| Client / controller | Aventure: **[full legal entity, registration, address, country]** |
| Supplier / processor | Vision71: **[full legal entity, registration, address, country]** |
| Authorised instructions | Aventure **[name, role, email]**; alternate **[name, role, email]** |
| Privacy / security contacts | Aventure **[monitored email, urgent phone]**; Vision71 **[monitored email, urgent phone]** |
| Pilot scope | Business-card capture, OCR, human verification and approved contact handling for **[event/team/use case]**; **[users/devices/volume limits]** |
| Term | **[start]** to **[end]**; no automatic renewal without written agreement |
| Support | **[hours/timezone, channel, severity definitions, acknowledgement targets and escalation owner]** |
| Charges / limits | **[fees, currency, taxes, OCR charges/quotas, overage approval and payment terms]** |
| Service levels | **[availability and recovery requirements, or expressly agree that no numeric SLA applies]** |
| Law / forum | **[governing law, courts and applicable privacy/marketing regimes]** |

Vision71 will provide the agreed pilot with reasonable care and skill. Aventure will provide lawful instructions, approved operators and necessary business decisions. Feature additions, production rollout and new integrations require written scope and cost approval. Neither OCR accuracy nor provider availability is guaranteed; errors must be reviewed before business use.

## 2. Conditions before live data

The parties must approve a completed Privacy Facts Sheet identifying the exact deployed revision, hosting and processing locations, provider contracts, retention periods, authentication and access model, logging/backups, incident contacts and exit procedure. Vision71 must demonstrate those controls with synthetic data, resolve the blocking items in the launch checklist, and record an Aventure acceptance and legal review. The Privacy Notice and Terms must be reconciled against that same revision and deployment configuration.

The current browser-only prototype, unauthenticated OCR routes and visual demonstration queue do not satisfy these conditions. A banner is not a technical access gate. Until conditions are met, only synthetic data is authorised; real business cards, manually entered contacts and production imports are prohibited.

## 3. Roles, instructions and confidentiality

For Aventure business-contact data, Aventure determines purposes and essential means and acts as controller; Vision71 acts as processor. This allocation must be reassessed if actual conduct changes. Vision71 may process only documented Aventure instructions, including for transfers, except where applicable law requires otherwise. It will notify Aventure before legally required processing unless prohibited, and immediately alert Aventure if it considers an instruction unlawful, suspending the affected instruction pending resolution where appropriate.

Vision71 will limit access to personnel needing it for authorised service delivery, bind them to confidentiality, provide appropriate privacy/security training and maintain an access roster. It shall not sell, monetise, independently market to, profile for unrelated purposes or train models on Aventure contact data. Service telemetry must not include images, raw OCR, contact fields or credentials unless specifically justified, protected and instructed.

Vision71's separate controller processing, if any, is limited to **[approved business administration/security categories, purposes, lawful bases and retention]** and must be transparently disclosed. That carve-out does not permit reuse of Aventure card content.

## 4. Processing particulars

| Required element | Agreed scope / current limitation |
|---|---|
| Subject matter and purpose | Extract and review business-contact information for Aventure's approved relationship management and follow-up; marketing is a separately authorised purpose. |
| Nature of operations | Capture/upload, transmit for OCR, parse, display, correct, duplicate-check, save and delete; return/transfer only through a separately accepted process. |
| People concerned | Business-card holders, prospective/existing customers, supplier/partner representatives and Aventure operators identified in notes. No intentional collection about children. |
| Personal data | Submitted card images, filenames, full OCR text, names, titles, companies, emails, phones, websites, address/city/country where captured, meeting location/notes, IDs, status and timestamps. Any additional fields require review. |
| Restricted categories | No intentional special-category data, criminal-offence data, identity documents, payment credentials or irrelevant private notes. Accidental receipt triggers isolation and instructions for deletion. |
| Duration | Approved pilot term plus only the agreed return/deletion and restricted-backup periods. Expiry is not permission for indefinite retention. |
| Controller obligations | Establish lawful basis and required notices; decide marketing permissions; maintain lawful source records; authorise operators/recipients; decide and communicate rights requests, retention and accuracy corrections. |
| Processor obligations | Follow instructions; implement agreed controls; maintain evidence; assist rights/compliance; manage authorised subprocessors; report incidents; return/delete data and remove access. |

The deployed architecture must be annexed at acceptance. The inspected version stores full records locally in IndexedDB; it is not a central CRM or cloud database. An operator save sets `VERIFIED`; it does not document separate reviewer approval. The application currently neither records a marketing permission event nor provides a complete operational export/deletion workflow.

## 5. Provider and location schedule

No listed candidate is automatically authorised by this draft. Complete its legal entity, account owner, service/plan, processing/support countries, contract reference, subprocessor list and transfer safeguard; Aventure must specifically approve each before use.

| Recipient | Data and function | Current technical evidence / approval status |
|---|---|---|
| Vercel **[confirm contracting entity]** | Images in requests, OCR responses and request metadata; frontend/API hosting | Live URL https://cardsnapbyv71.vercel.app/; HTTPS homepage verified, free tier confirmed by owner. Account, function region, deployed revision and logs unconfirmed. Commercial plan eligibility and processing approval pending. |
| **[Google contracting entity]**, Cloud Vision | Submitted image including contact details; online `TEXT_DETECTION`; request metadata | Server uses `vision.googleapis.com/v1/images:annotate`. No explicit regional endpoint. Key restrictions, agreement and location approval pending. |
| a9t9 software GmbH / OCR.space **[confirm contracting entity and plan]** | Same image and visible details on fallback; API access metadata | `api.ocr.space/parse/image`, engine 2, no searchable-PDF request. Production key, processing countries and signed processing terms pending. |
| **[Approved support/log/backup providers, if any]** | Specify exact minimum categories; no assumption that logs are content-free | Inventory needed, including host integrations and device backup services. |
| Constant Contact **[contracting entity]** | No current transfer | Excluded from current processing scope. Aventure-controlled recipient if a later import is approved; determine contractual role then. |

Google describes online image processing as in-memory with temporary request metadata logs; OCR.space describes deletion after processing and one-month API IP logging. Confirm the applicable contracted services rather than treating these statements as a complete retention warranty. OCR.space's published policy offers signed DPAs for PRO PDF and Enterprise users; the current account tier is unknown. A comment referring to a free-plan upload limit does not establish the purchased tier or contractual suitability.

Vision71 may not add or replace a subprocessor without Aventure's prior written authorisation. It will provide sufficient advance detail for assessment, impose equivalent applicable data-protection obligations and remain responsible for the subprocessor's performance of those obligations. If Aventure objects and no acceptable alternative is agreed, suspend the affected processing and permit termination of that affected service under an agreed exit plan.

No restricted international transfer may begin until the parties identify the exporter/importer, countries, applicable adequacy decision or contractual mechanism, required transfer assessment and supplementary measures. Headquarters location alone does not establish processing residency. Any regional requirement must be implemented and tested for both primary and fallback paths.

## 6. Security and access schedule

The following are **required pilot controls to implement and verify**, not current-state claims:

- Named operator identities and an approved authentication method covering the frontend and OCR API; no bypass through direct API calls or preview deployments. MFA for privileged infrastructure access and appropriate session expiry/revocation.
- Least-privilege operator, reviewer (if the pilot requires separate approval) and administrator permissions, enforced in the actual architecture. Define record visibility and prevent unauthorised cross-user/client access. If an approved single-operator device model is selected, document its limits expressly instead of claiming application RBAC.
- HTTPS for browser and provider traffic; secrets confined to protected server configuration, restricted to necessary APIs and quotas, with rotation and revocation ownership. No client-bundled secrets or sensitive request logging.
- Managed devices, disk encryption, screen locks, restricted browser profiles and an approved local-storage policy. Decide explicitly whether persisting full card images and raw OCR is necessary; changing that design requires a corresponding notice update.
- File/content and request-size validation, rate limiting, appropriate origin policy, dependency maintenance and negative access tests on the deployed handler. The Express and serverless paths must have equivalent approved protections.
- A minimal audit record of actor, action, time, record identifier and outcome for access changes, approval, export and deletion as applicable, without copying card contents. Restrict audit access and set a finite retention period.
- Agreed backup scope, encryption, ownership, expiry and restore testing, or a documented acceptance of no service backup with a tested authorised return process. Browser persistence alone is not recoverability.
- Tested deletion, incident reporting and offboarding processes, including local devices, originals, exports and external destinations.

Approved identity provider/access approach: **[pending]**. Named access roster and support-access countries: **[pending]**. Security evidence reference and test date: **[pending]**.

## 7. Retention and deletion schedule

Complete every period before launch. Aventure must approve what is necessary; no timer or automatic deletion is represented as implemented merely by signing this schedule.

| Copy/category | Current state | Pilot instruction requiring implementation/evidence |
|---|---|---|
| Submitted image and raw OCR on device | Persist with saved record; no expiry | **[delete on verified transfer/review or other explicit event, with maximum age and failure handling]** |
| Reviewed contact data on device | Persists; local delete helper only | **[retention period, start event, responsible operator and tested deletion procedure]** |
| Backend request image | Memory processing, no application file write | Do not add persistence without approval; verify host capture, debugging and logging policies. |
| OCR-provider content/metadata | Provider policy and contract control retention | **[confirm applicable terms, exceptions, metadata periods and request procedure]** |
| Logs and support material | Console logging; support practice unknown | **[scope, duration, access, redaction and deletion owner]** |
| Original photographs and exports | Outside automatic app deletion | **[approved folders/devices/recipients, retention and owner]** |
| Device/host backups | No active application workflow confirmed | **[inventory, schedule, encrypted location, maximum expiry, restricted use and restore-delete procedure]** |

Archiving is not deletion. Clearing a UI preview is not deletion. Return or deletion must cover original and reviewed values as well as images and raw OCR. Where a backup cannot be selectively erased, document the reason and bounded expiry, isolate it from ordinary use and reapply deletions if restored. Any legally required retained copy must be identified, minimised, access-restricted and deleted when the obligation ends.

## 8. Constant Contact and contact permissions

No Constant Contact integration is included in the current pilot baseline. Existing `CC_*` settings are unused by the inspected runtime. The XLSX helper is not wired into the present queue and exports no card image or raw OCR; its fields are recorded in the evidence register. It must not be presented as a completed transfer mechanism.

Before any future import, sign a change record selecting either a controlled manual file import or a reviewed OAuth integration. Specify the account owner, list/audience, minimum field mapping, custom fields, consent/source evidence, suppression/unsubscribe handling, duplicate/update rules, retry/error behaviour and reconciliation. Test with synthetic contacts. No images, raw OCR or free-text notes may be sent unless separately justified and approved. For OAuth, additionally approve scopes, encrypted token storage, refresh/revocation and access owner; none exists now.

Aventure determines and records lawful collection and communication permission. Verification, camera permission and possession of a card do not automatically authorise marketing. Aventure must comply with applicable marketing law and the destination service's permission policy before import or sending. Vision71 must not independently enrol contacts or send messages.

## 9. Incident reporting and response

**Proposed contractual timing, subject to acceptance:** Vision71 shall notify Aventure without undue delay and in any event within 24 hours of becoming aware of a personal-data breach affecting Aventure data. It must not wait for a full investigation. Report suspected significant exposure promptly for joint triage. Use the monitored contacts in §1; if unacknowledged, escalate by the urgent telephone and alternate owner. The parties must fill those contacts and test the route before launch.

The first report will state what is known about the event, awareness time, affected systems/data/people, likely consequences, containment, contact person and next update. Provide missing information in phases, with at least daily updates during active material response unless otherwise agreed. Protect evidence and record actions without unnecessary duplication of contact content.

Vision71 will contain the event, coordinate relevant providers, preserve necessary evidence, assist Aventure's risk assessment and provide a cause/remediation report within **[agreed period]**. Aventure decides regulator and individual notifications unless law places a direct duty on Vision71. Contractual notification timing does not replace any applicable statutory deadline. Reviewers must identify those deadlines for the agreed jurisdictions; EU/UK rules must not be assumed solely from a vendor's location.

## 10. Rights, assistance and assurance

Vision71 will promptly forward requests concerning Aventure data and assist with access, correction, deletion, restriction, objection and portability as required by applicable law. It will not independently refuse or substantively answer on Aventure's behalf without instructions, unless legally required. **Proposed forwarding target: two business days**, to be accepted before launch. Requests must be tracked across local records, original OCR, exports and approved recipients; identity checks must be proportionate.

Considering the nature of processing and information available, Vision71 will assist Aventure with security obligations, breach assessments/notifications, impact assessments and regulator consultations. It will provide information reasonably necessary to demonstrate compliance and allow proportionate audits/inspections by Aventure or an independent auditor bound to confidentiality, with reasonable notice except urgent incidents or regulator requirements. Each party will cooperate with competent authorities as required. Audit/assistance cost allocation: **[agree; must not obstruct mandatory duties]**.

## 11. Pilot end, return and removal of Vision71 access

At expiry, termination or an authorised instruction, stop new capture and OCR access for the pilot and record the cutoff. Aventure chooses return and subsequent deletion, or deletion without return, subject to lawful retention. **Proposed deadline: within 30 calendar days after the choice/termination, with access revoked at the cutoff except explicitly time-limited exit personnel.** Agree the actual deadlines and any backup-expiry exception before launch.

The exit owner must:

1. Inventory every approved browser profile/device, original photo location, exported file, support copy, log/backup system and destination account. Preserve only what Aventure instructs for return.
2. Deliver data through an agreed secure format/channel, reconcile record counts and obtain Aventure's receipt. The prototype currently has no complete return action; implement and test one before promising it. Return images/raw OCR only if requested and lawfully needed.
3. Delete the agreed records/copies, verify with synthetic deletion tests and recorded counts, and document any lawful restricted retention/backup expiry. Do not treat masking, archive status or a revoked URL as erasure.
4. Aventure's account owner removes Vision71 users, groups, service accounts, deployment access, repository/CI access, cloud project roles, remote support and shared storage access as applicable. Transfer asset ownership where agreed. Revoke sessions/tokens and rotate shared credentials or keys Vision71 could retain. For a future Constant Contact connection, revoke its authorisation and remove stored tokens as well.
5. Verify removed identities can no longer access each system; close preview/test deployments and any secondary credentials that permit continued pilot processing. Where Vision71 owns infrastructure, close the client service and arrange independently reviewable evidence of access/data disposition rather than claiming all supplier administrators disappeared.
6. Provide a signed return/deletion and access-removal certificate listing systems, owners, dates, evidence references and bounded exceptions. Aventure signs receipt; responsibilities surviving termination remain effective.

No automated offboarding or remote browser wipe exists in the inspected app. The final process must work with the chosen device and ownership model.

## 12. Commercial protections, changes and signatures

Confidential information may be used only to perform this agreement and disclosed only to bound personnel/approved recipients or as legally required. The customer retains rights in its data; Vision71 retains rights in CardSnap. No other rights in contact information are granted.

Either party may terminate for an unremedied material breach after **[agreed cure period]**, or immediately where continued processing would be unlawful or an urgent serious security risk cannot be contained. Fees, refunds, suspension, transition assistance and termination for convenience: **[agree]**. Liability cap, exclusions and carve-outs for confidentiality/data protection, fraud and non-excludable liability: **[legal/commercial review required]**. No limitation may remove mandatory data-subject rights or regulatory powers.

Changes to providers, processing countries, purposes, access model, retention or integrations require an updated schedule and authorised written approval before implementation where required by this agreement. For personal data, this schedule prevails over service/public terms; mandatory law and any applicable transfer clauses prevail where required. The signed service order controls other commercial conflicts. The agreement does not bind Aventure until signed by an authorised representative.

| Approval | Name / signature / date |
|---|---|
| Vision71 authorised signatory | **[pending]** |
| Aventure authorised signatory | **[pending]** |
| Technical readiness approval and deployed revision | **[pending]** |
| Client legal/privacy review reference | **[pending]** |

Drafting references and technical evidence are in `05-evidence-and-launch-checklist.md`; they are not a substitute for completed contractual particulars.
