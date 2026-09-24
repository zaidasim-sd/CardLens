from pathlib import Path
import json, html
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.graphics.shapes import Drawing, Rect, String, Line, Polygon

root=Path(__file__).resolve().parents[1]
out=root/'artifacts';out.mkdir(exist_ok=True)
fonts=out/'qa/fonts'
pdfmetrics.registerFont(TTFont('Aptos',str(fonts/'Aptos.ttf')))
pdfmetrics.registerFont(TTFont('AptosBold',str(fonts/'Aptos-Bold.ttf')))
pdfmetrics.registerFontFamily('Aptos',normal='Aptos',bold='AptosBold',italic='Aptos',boldItalic='AptosBold')
styles={
 'body':ParagraphStyle('body',fontName='Aptos',fontSize=9,leading=13,spaceAfter=7,textColor=colors.black),
 'h1':ParagraphStyle('h1',fontName='AptosBold',fontSize=12,leading=16,spaceAfter=12),
 'h2':ParagraphStyle('h2',fontName='AptosBold',fontSize=10.5,leading=14,spaceBefore=10,spaceAfter=7),
}
story=[];web=[]
def heading(s,sub=False):
    story.append(Paragraph(html.escape(s),styles['h2' if sub else 'h1']));web.append(f'<h{2 if sub else 1}>{html.escape(s)}</h{2 if sub else 1}>')
def p(s):story.append(Paragraph(html.escape(s),styles['body']));web.append('<p>'+html.escape(s)+'</p>')
def table(headers,rows,widths):
    data=[[Paragraph(html.escape(str(v)),styles['body']) for v in row] for row in [headers]+rows]
    t=Table(data,colWidths=widths,repeatRows=1,hAlign='LEFT');t.setStyle(TableStyle([('GRID',(0,0),(-1,-1),.4,colors.black),('BACKGROUND',(0,0),(-1,-1),colors.white),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),3)]));story.extend([t,Spacer(1,10)])
    web.append('<table>'+''.join('<tr>'+''.join(f'<td>{html.escape(str(v))}</td>' for v in row)+'</tr>' for row in [headers]+rows)+'</table>')
def page():story.append(PageBreak());web.append('<div class="pagebreak"></div>')

heading('CardSnap by Vision71 Architecture Readiness Report')
p('Prepared for the Vision71 architecture team and Aventure Aviation. Validation date 24 September 2026.')
p('We have implemented and tested an internal architecture demonstrator in the existing CardLens repository. It proves the core capture, review, duplicate warning and approved Constant Contact transfer route can be built. It is not yet approved for real Aventure use. Production startup remains locked.')
heading('What we implemented',True)
p('The new internal pilot centralises records on the server and separates assistant, reviewer and administrator responsibilities. It adds named accounts, tenant-scoped access, approval states, audit events, configurable dropdowns, temporary-image retention, encrypted storage and controlled transfer handling. The existing OCR parser is reused and corrected. A working local OCR adapter and a proposed Google Cloud Vision adapter are available.')
table(['Evidence','Result'],[
 ['Automated controls','21 passing tests; final results are stored in validation/tests.txt. Tests cover permissions, tenant isolation, duplicates, concurrency, uncertain writes, cooldown, retention, revocation and parser regressions.'],
 ['End to end local run','Named sign-in, fictional draft, actual image OCR, submission, reviewer approval and image deletion passed.'],
 ['Live Constant Contact','OAuth, refresh-token rotation and signature checks, creation, mapping, list assignment, Lead Source assignment, duplicate HTTP 409 and repeated-transfer receipt passed.'],
 ['OCR corpus','30 fictional cards and 33 images processed. Final exact-field scores: name 100%, company 90%, email 96.7%, primary phone 100%. Four cards require correction.'],
 ['Recovery','Encrypted backup restored to a fresh database: three users and one record, with no images or sessions restored.'],
], [126,385])
heading('Scope and remaining gates',True)
p('Constant Contact remains the destination. Salesforce is untouched. No historic contact import, CRM, sales pipeline, inventory, RFQ, follow-up tasks or campaign sending was added. No real Aventure cards or contact records were used.')
p('Before go-live, Aventure must approve fields, retention and review rules. The team must validate the selected cloud OCR provider with its own credentials, deploy and test production security and operations, and complete representative camera-card acceptance testing. The local demonstration is evidence of feasibility, not a production security certification.')

page();heading('One page data flow diagram')
p('The upper flow is implemented in the internal demonstration. Cloud hosting, production identity integration and the managed database are deployment work still to be approved and tested.')
d=Drawing(511,440)
def box(x,y,w,h,lines):
    d.add(Rect(x,y,w,h,strokeColor=colors.black,fillColor=colors.white,strokeWidth=.7))
    for n,line in enumerate(lines):d.add(String(x+w/2,y+h-17-n*13,line,fontName='Aptos',fontSize=9,textAnchor='middle'))
def arrow(x1,y1,x2,y2):
    d.add(Line(x1,y1,x2,y2,strokeColor=colors.black,strokeWidth=.7))
    if y2<y1:d.add(Polygon([x2,y2,x2-3,y2+6,x2+3,y2+6],fillColor=colors.black))
    elif x2>x1:d.add(Polygon([x2,y2,x2-6,y2-3,x2-6,y2+3],fillColor=colors.black))
box(110,376,290,54,['Named exhibition assistant','Fictional front and optional back card'])
arrow(255,376,255,352)
box(110,296,290,56,['Authenticated API and upload validation','Local OCR -> extraction -> assistant correction'])
arrow(255,296,255,272)
box(110,215,290,57,['Central encrypted records and temporary images','Tenant-scoped data, configurable fields, audit trail'])
arrow(255,215,255,191)
box(110,131,290,60,['Submit and check possible duplicates','Reviewer approves, rejects or requests correction'])
arrow(255,131,255,107)
box(110,47,290,60,['Approved transfer service','Destination lookup -> create -> save contact ID'])
arrow(400,76,426,76)
box(426,47,80,60,['Constant','Contact','test account'])
box(0,215,95,57,['Retention worker','Delete images','at expiry'])
arrow(95,243,110,243)
d.add(String(111,25,'Failure -> visible review queue -> safe retry or explicit reconciliation',fontName='Aptos',fontSize=9))
story.append(d)
web.append('<p>Assistant -> authenticated upload -> OCR -> corrected central draft -> duplicate alert -> reviewer approval -> destination lookup -> Constant Contact -> saved receipt. Retention worker deletes temporary images. Failures return to review.</p>')
heading('Trust boundaries',True)
p('The public prototype only displays a fixed fictional example and cannot submit arbitrary cards. The internal API requires a named session and enforces roles and tenant scope. OAuth secrets and tokens stay on the server. Only an approved transfer reaches Constant Contact. Vision71 support can see aggregate counts for at most 24 hours.')
p('Temporary images are not exported or backed up by the supplied backup tool. No bulk download of historic Constant Contact contacts occurs; destination duplicate checking looks up the exact email only. The pilot is online-first; offline capture and multi-instance deployment are not implemented.')

page();heading('Roles data model and record flow')
table(['Action','Assistant','Reviewer','Administrator','Support'],[
 ['Capture and correct own drafts','Yes','No','No','No'],['Submit own records','Yes','No','No','No'],['View central contact queue','Own only','Yes','Yes','No'],['Review duplicates and approve','No','Yes','No','No'],['Transfer or reconcile','No','Yes','No','No'],['Manage users and dropdowns','No','No','Yes','No'],['Delete temporary images','No','Yes','Yes','No'],['View audit','No','Yes','Yes','No'],['View aggregate monitoring','No','Yes','Yes','Yes'],
],[179,70,70,105,87])
p('Support is a named, restricted account with a maximum 24-hour expiry. Revocation disables the account and deletes its sessions immediately. Demonstration personas are test fixtures; actual operators must receive individually named accounts. Administrators cannot approve through their administrator role.')
heading('Implemented data model',True)
p('SQLite entities use a composite primary key of tenant, kind and ID. The payload is AES-256-GCM encrypted. Entity kinds include user, session, record, image, settings, Constant Contact mapping, OAuth state and integration token. Each record includes owner, validated contact fields, status, version, creation/update times, duplicate decision, failure code, retry time and destination receipt. Image metadata includes record ID, creation time and expiry. Audit entries store actor ID, action, record ID and UTC time, without contact fields.')
p('A tenant transfer lock serialises destination lookup and creation. Transactions commit record state and its audit event together. The future managed database should split these entities into typed tables with tenant foreign keys, row-level security and a durable outbox. Those database-level controls are proposed, not implemented in SQLite.')
heading('Status flow',True)
p('Draft -> Submitted for review or Possible duplicate -> Approved for transfer -> Transferred to Constant Contact. Transfer errors move to Transfer failed. Reviewers can request correction back to Draft, reject, or archive eligible records. Corrections require resubmission. Every status change records the actor and UTC time; stale versions are rejected.')
p('Duplicate signals use trimmed lowercase email, phone punctuation removal and 00-to-plus conversion, or matching name plus company. Local-format phone numbers are not automatically assigned a country. Reviewers see matching records and decide whether to correct, reject, archive or treat the record as distinct. Exact destination email matches cannot be overwritten by that decision; the reviewer can explicitly link a verified existing contact.')

page();heading('Constant Contact validation and evidence')
p('We used the supplied demo client ID a79f06bd-6984-48bc-8d55-b0b4b7fd003e and its supplied client secret in the server-only .env configuration. The secret is intentionally omitted from this report. The supplied callback http://localhost:3000/auth/callback was used. The account was confirmed by the requester as a test account; account-owner OAuth consent completed successfully.')
p('The preferred General Interest list was not present. We created an isolated CardSnap Readiness Test 2026-09-24 list and reused the existing Lead Source string field. The supplied sender address and Aventure Aviation Team sender name were retained as configuration only; no welcome campaign was created or sent.')
table(['Validation item','Evidence and status'],[
 ['Authentication','LIVE PASS: authorization code flow, session-bound expiring state, server token exchange, token refresh, signature, issuer, audience and client claims.'],
 ['Creation and field mapping','LIVE PASS: approved fictional record created; first and last name, company, email and phone checked on read-back.'],
 ['List and source','LIVE PASS: exact test list membership and Lead Source custom-field value verified. Tag assignment was not used.'],
 ['Duplicate behavior','LIVE PASS: provider returned HTTP 409 for the same email. App returned a review warning and did not merge or overwrite.'],
 ['Success identification','LIVE PASS: saved ID 41b3205e-b7eb-11f1-9831-02420a320002 matched the destination read-back.'],
 ['Repeated transfer','LIVE PASS: a second call returned the saved receipt without a second create operation.'],
 ['Failure and retry','LOCAL FAULT TEST PASS: timeout stays visible and requires reconciliation; HTTP 429 stores a cooldown and permits a later safe retry.'],
 ['Rate limits','Documented provider limits: 4 requests/second and 10,000/day. Requests in one adapter instance are paced at 300 ms. No live saturation or daily-quota exhaustion test was performed.'],
 ['Existing-contact updates','Deliberately disabled. A reviewer can link an existing exact-email match; changing its fields needs a separately approved update policy.'],
],[135,376])
heading('Approved mapping and controlled import fallback',True)
p('Full name is split into first word and remaining words for the tested transfer. Email is normalised; company and both phone slots map directly; event/source maps to Lead Source. Country, categories and short notes remain local pending Aventure approval of their destination mapping. Multi-part names require review. The test uses Account creation with implicit email permission; the real consent policy remains a go-live decision.')
p('If the direct route is unavailable, reviewers can export only approved records to CSV. Formula-leading values are escaped. An authorised operator must compare duplicates, approve the exact list and import mapping, import once, inspect the import result, and reconcile destination IDs before marking completion. CSV download does not mark records as transferred. Import and update behavior itself has not been live-tested.')

page();heading('OCR validation and provider recommendation')
p('We generated and processed 30 fictional cards covering clear and blurred/rotated images, alternate layouts, small text, multiple phones, international formats, dense logo designs and three front/back pairs. The corpus has 33 PNG images. Tesseract.js performs the measured OCR locally; the existing parser produces contact fields.')
table(['Metric','Before parser fixes','After parser fixes'],[['Name','80.0%','100.0%'],['Company','0.0%','90.0%'],['Email','96.7%','96.7%'],['Primary phone','63.3%','100.0%'],['Cards requiring correction','30 of 30','4 of 30'],['Mean processing time','204 ms/card','204 ms/card']], [231,140,140])
p('Matching ignores case/extra spacing, and phone comparison ignores punctuation. Timings include OCR and parsing for all sides after worker startup; they exclude camera capture, initial model download and human review. Correction count is inferred from incorrect expected fields. This is a small synthetic test set with limited names and company diversity. It is not a real-photo benchmark, a multilingual test, a blind holdout or a cloud-provider accuracy claim. Alternate-phone extraction is exercised but is not separately scored.')
p('The fixes broaden international number recognition, preserve the first phone as primary, avoid matching generic email domains as companies, and use whole-word company terms including aviation. Remaining company and email errors demonstrate why review stays mandatory.')
table(['Production candidate','Data handling and deletion','Reliability cost and limits'],[
 ['Google Cloud Vision','Google says submitted content is not used to train Vision. Synchronous requests are processed in memory rather than persisted to disk; limited request metadata is logged. Our application deletes its own copies. Confirm regional processing and contractual requirements before approval.','Proposed first choice; server adapter implemented but not cloud-tested. Quotas and service outages still require retry handling. Document Text Detection: first 1,000 units/month free, then $1.50/1,000 at the cited tier. Text still needs contact-field parsing.'],
 ['Amazon Textract','AWS FAQ permits service improvement use unless an organisation opts out. Some improvement data may cross regions without opt-out. Provider-side deletion can require AWS Support; application/S3 lifecycle deletion is a separate control.','Alternative, not integrated or benchmarked. Detect Document Text example price is $0.0015/page in US West Oregon for the first million. Region, API and language limitations matter; request quota and support terms must be reviewed.'],
],[100,211,200])
p('Recommendation: evaluate Google Cloud Vision first, conditional on Aventure privacy approval and a paid-account run of the same corpus plus at least 30 independently selected consented camera photographs. Target email accuracy of at least 98% is proposed, not achieved by the current baseline. Keep OCR.space prototype-only; it is not the production recommendation. The local adapter is a working demonstration option, not a managed-service reliability promise.')

page();heading('Security retention and operational readiness')
table(['Control','Implemented evidence or remaining work'],[
 ['Named authentication and access','Scrypt password hashes, separate personas, role checks, tenant-scoped records and revocation tested. Support expires within 24 hours and sees counts only. SSO/MFA, password recovery and independently reviewed identity operations remain.'],
 ['Sessions and request safety','Random server-side sessions, HttpOnly and SameSite=Lax cookies, 8-hour absolute expiry, origin and CSRF checks, login throttling. Secure cookie is enabled for HTTPS origins. Idle timeout and distributed throttling remain.'],
 ['Encryption and secrets','AES-256-GCM entity payloads and encrypted backups; client secret and tokens stay server-side. Local .env key custody is demonstrator-only. Managed keys, rotation and encrypted production disks are deployment requirements.'],
 ['Transit security','External provider calls use HTTPS. Local demonstration uses loopback HTTP. Production TLS termination, certificates, HSTS and private networking are not deployed.'],
 ['Upload and field validation','Strict contact schema and permitted dropdowns; PNG/JPEG signatures and full decode; 2 MiB per side, two sides, 6000-pixel dimension and 20-million-pixel limits. No arbitrary public uploads. Free-text notes still need user guidance.'],
 ['Logs and audit','Pilot errors return fixed codes; no contact fields or OCR text are logged. Actor/record IDs and times are audited. No analytics integration. External immutable audit storage and infrastructure-log review remain.'],
 ['Temporary-image deletion','Configurable 0 to 168 hours; default 24 hours. Startup and one-minute sweeps, manual deletion and retention reduction implemented. Secure-delete and retention checkpointing reduce SQLite remnants. Storage snapshots need a separate deletion policy.'],
 ['Backup and restore','Encrypted logical backup and empty-database restore tested. Images, sessions and OAuth states are excluded. Remote scheduling, off-site recovery and key-recovery drills remain.'],
 ['Monitoring','Failed-transfer and review counts exposed only to permitted roles; retention failure emits a fixed code. Pager/email alerts, uptime checks and provider budget alerts are proposed.'],
],[134,377])
heading('Retention and failure operating rules',True)
p('Aventure must approve the actual image interval, contact/audit retention and the one-minute scheduler tolerance. Zero image retention processes in memory without saving an image. If the service is down, the startup sweep removes expired images when it resumes; an independent production lifecycle worker is needed for a hard deadline during outages. Do not include image tables in infrastructure snapshots without a compliant expiry design.')
p('A write timeout is an uncertain outcome. The app keeps the record in the failure queue and requires exact-email destination lookup and reviewer linking of a verified contact ID. It does not claim exactly-once delivery across external systems. A crash-held tenant lock requires a stopped-service maintenance review; unresolved ambiguity is escalated rather than retried blindly.')

page();heading('Environments deployment and recurring costs')
table(['Environment','Prepared approach'],[['Development','Local Node 24 process, independent encrypted SQLite file, loopback origin, fictional cards and local OCR. Running in this workspace.'],['Staging and internal demo','Separate config template, origin, key, database path and test integration. Deploy behind HTTPS and restricted access. Template supplied; remote staging is not deployed.'],['Production','Separate template deliberately refuses startup. Approve architecture and operations first. Migrate the demonstrator storage to managed PostgreSQL with row-level policies and durable transfer jobs before scaling beyond one process.']], [123,388])
heading('Monthly planning estimate in USD',True)
p('Assumptions: one client, 5 to 10 named users, 1,000 cards/month, 20% with a back image, 1,200 OCR images/month and 24-hour temporary-image retention. Maximum accepted upload is 2 MiB per side, giving about 2.4 GiB/month of image ingestion; average retained volume is much lower. Prices exclude tax, engineering and support labour, Constant Contact subscription and any Salesforce charges.')
table(['Cost item','Planning allowance per month'],[['Production application VM','12 to 24'],['Separate staging VM','6 to 12'],['Managed relational database','15 to 30'],['Private object storage','5'],['Backup and basic monitoring allowance','3 to 10'],['Google OCR at 1,200 images','0.30 if the free monthly tier is available'],['Estimated total','41.30 to 81.30; budget 45 to 90']], [300,211])
p('Hosting and database figures are engineering allowances, not a purchased configuration or vendor quote. DigitalOcean lists entry compute and storage products in this range; region, memory, managed database size and support can raise the total. Verify a selected bill of materials before committing. Current local demonstration hosting cost is not the production estimate.')
p('At 10,000 cards/month and the same back-image ratio, 12,000 Google OCR units would cost about $16.50 at the cited tier; the same infrastructure allowances total about $57.50 to $97.50. Budget $60 to $110 before a load-driven upgrade. If the free tier is unavailable, add $1.50/month to these OCR examples. Set a provisional $100/month low-volume budget alert and escalate any material increase before purchase.')
heading('Run and reproduce',True)
p('Run npm ci, npm run pilot:setup, then npm run pilot. Open http://localhost:3000/pilot/. Generated local test passwords are in the ignored .data/demo-accounts.json file. Run npm test, npm run build, node scripts/smoke-pilot.js and npm run test:ocr to reproduce local evidence. The separate live-validation script is explicitly test-account-only and creates a new fictional test contact when rerun.')
p('The existing Vercel deployment remains a static fictional prototype. It is not the host for the durable pilot database and retention worker. Environment templates are under config; the operating guide is docs/README-pilot.md.')

page();heading('Aventure decisions escalation and go live gates')
heading('Decisions requiring Aventure confirmation',True)
p('Confirm the individually named assistants, reviewers and administrators; whether reviewers may approve their own work; which events, countries, organisation types, contact types, interests and note categories are permitted; and whether a back image is required. Confirm exact destination list and Lead Source mapping, treatment of multi-part names, missing-email records, local phone numbers and existing contacts. Empty drafts are supported; name and email are required before submission.')
p('Approve the marketing-permission policy separately from possession of a business card. Approve image, contact, audit and backup retention; hosting/provider region; selected OCR provider and its contractual data handling; support access duration; expected peak volume; budget; backup recovery point/time targets; and the final correction/review process. No full historic-contact import is assumed.')
heading('Immediate escalation rules',True)
table(['Trigger','Required response'],[['Transfer route unsupported','Stop destination writes; report evidence and propose controlled CSV review.'],['OCR privacy or retention concern','Stop provider use until Aventure accepts the processing and deletion terms.'],['Image deletion cannot meet the approved deadline','Stop new capture; correct storage, scheduler or snapshot policy and retest deletion.'],['Duplicate prevention or uncertain-write recovery fails','Hold transfers and preserve audit evidence; do not blind retry, merge or overwrite.'],['Monthly cost materially exceeds the agreed budget','Escalate the changed estimate before provisioning or raising quotas.'],['Scope expands into CRM or Salesforce replacement','Pause that feature and obtain a separate Vision71 and Aventure scope decision.']], [213,298])
heading('Definition of ready for Aventure use',True)
table(['Gate','Current status'],[['Roles, workflow and duplicate warnings','Implemented and locally tested; client acceptance still required.'],['Constant Contact route','Live test account validation passed; real-account access and final mapping require approval.'],['Selected production OCR provider','Google recommended conditionally; paid-provider benchmark and privacy approval pending.'],['Retention and production security','Demonstration controls implemented; approved intervals and deployed operations pending.'],['No client data exposed in tests or public demo','Fictional corpus used; public uploads disabled. Production log and analytics review remains.'],['Aventure approves final fields and review process','Pending Aventure decision.'],['Overall release decision','NOT READY FOR REAL CLIENT DATA. Evidence supports continuing the pilot build after approval.']], [220,291])

page();heading('Requirement traceability and evidence files')
table(['Brief requirement','Implementation or evidence'],[['Roles and access','server/pilot/app.js, store.js, pilot.test.js; named sessions, role checks, revocation and support expiry.'],['Record flow and audit','server/pilot/workflow.js; draft, submission, duplicate, approval, transfer, failure, rejection and archive.'],['Contact and image handling','app.js, ocr.js, backup-pilot.js; central encrypted data, retention worker, validated upload and image-free backups.'],['Duplicate handling','workflow.js and constant-contact.js; local signals, exact destination email lookup, explicit reviewer choice, no overwrite.'],['Constant Contact validation','validation/constant-contact-live.json and scripts/validate-constant-contact.js; live result IDs and safe repeated transfer.'],['OCR validation','validation/ocr/manifest.json, baseline-results.json, results.json and all 33 card images; repeatable benchmark.'],['Security design','Report security page, automated controls and operating guide; deployment gaps explicitly identified.'],['Configurable fields','Administrator settings form and strict server validation; six dropdown categories without code changes.'],['Environments and public prototype','config/*.env.example, src/App.tsx and api/ocr.js; isolated templates and fictional-only public screen.'],['Required architecture deliverables','This report contains the one-page diagram, permissions matrix, model/status flow, validation checklist, provider comparison, security checklist, cost estimate and assumptions.']], [150,361])
heading('Evidence interpretation',True)
p('Live provider assertions apply only to the requester-confirmed test account and the fictional contact created on 24 September 2026. Mocked 429, timeout and concurrency tests are local fault-injection evidence. The supplied credentials were actually used for the connection and transfer validation, not merely copied into a sample. Neither the client secret nor OAuth tokens appear in this report or frontend source.')
p('The test artifact retains one fictional destination contact and its dedicated list for inspection. The attempted duplicate was rejected by Constant Contact. Existing contacts were not updated or deleted. Any future cleanup of test artifacts should target only their recorded IDs. No bulk historic-contact organisation route is implemented or authorised for the more than 18,000 contacts mentioned in the brief.')

page();heading('Sources and verification references')
p('Vendor documentation checked on 24 September 2026. These sources support the integration design and planning estimates; the repository evidence supports the implementation claims.')
sources=[
 ('Constant Contact OAuth authorization code flow','https://developer.constantcontact.com/api_guide/server_flow.html'),
 ('Constant Contact create and duplicate behavior','https://developer.constantcontact.com/api_guide/contacts_create.html'),
 ('Constant Contact rate limits','https://v3.developer.constantcontact.com/api_guide/rate_limits.html'),
 ('Constant Contact custom fields','https://developer.constantcontact.com/api_guide/create_custom_fields.html'),
 ('Google Cloud Vision data usage','https://docs.cloud.google.com/vision/docs/data-usage'),
 ('Google Cloud Vision pricing','https://cloud.google.com/vision/pricing'),
 ('Google Cloud Vision quotas','https://docs.cloud.google.com/vision/quotas'),
 ('Amazon Textract pricing','https://aws.amazon.com/textract/pricing/'),
 ('Amazon Textract privacy and deletion FAQ','https://aws.amazon.com/textract/faqs/'),
 ('DigitalOcean hosting pricing','https://www.digitalocean.com/pricing'),
 ('Microsoft Aptos fonts','https://www.microsoft.com/en-us/download/details.aspx?id=106087'),
]
for label,url in sources:
    story.append(Paragraph(f'{html.escape(label)}<br/><link href="{html.escape(url,quote=True)}" color="black">{html.escape(url)}</link>',styles['body']));web.append(f'<p>{html.escape(label)}<br><a href="{url}">{url}</a></p>')
heading('Document format',True)
p('White background and black text throughout. Aptos is embedded in the PDF. Main headings are 16 px, subheadings 14 px and body text 12 px, rendered at the standard conversion of 0.75 points per pixel. The accompanying HTML uses the same CSS sizes for editing and printing.')
def footer(canvas,doc):
    canvas.setFont('Aptos',9);canvas.drawRightString(A4[0]-42,24,str(doc.page))
SimpleDocTemplate(str(out/'CardSnap-Architecture-Readiness.pdf'),pagesize=A4,rightMargin=42,leftMargin=42,topMargin=38,bottomMargin=42,title='CardSnap by Vision71 Architecture Readiness Report',author='Vision71').build(story,onFirstPage=footer,onLaterPages=footer)
(out/'CardSnap-Architecture-Readiness.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><title>CardSnap Architecture Readiness</title><style>body{font-family:Aptos,Arial,sans-serif;background:white;color:black;font-size:12px;line-height:1.45;max-width:900px;margin:32px auto}h1{font-size:16px}h2{font-size:14px}table{border-collapse:collapse;width:100%;margin:12px 0}td{border:1px solid black;padding:8px;vertical-align:top}a{color:black}.pagebreak{break-before:page;margin-top:35px}@media print{body{margin:0}}</style>'+''.join(web)+'</html>',encoding='utf8')
print('Created readiness PDF and editable HTML')
