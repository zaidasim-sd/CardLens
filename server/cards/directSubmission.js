import { requireAction } from "../auth/permissions.js";
import { allocateRecordId } from "./recordId.js";
import {createHash} from 'node:crypto';
import {exactEmailDuplicate,reviewedRowMatches,normalizedContactEmail} from './sheetDuplicates.js';
import { createSheetGateway, sheetField, sheetRow } from "../integrations/sheetService.js";

const failure = (code, status, message) => Object.assign(new Error(message), { code, status });
const canonical=value=>value&&typeof value==='object'?(Array.isArray(value)?value.map(canonical):Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]))):value;
const referenceConflict=reference=>Object.assign(failure('SUBMISSION_REFERENCE_CONFLICT',409,'This reference belongs to different reviewed details. Close this form and scan the new card again; no new record was saved.'),{submissionReference:reference,submissionStatus:'not_saved',retrySafe:false});

// Only counters and submission leases are persisted; the contact exists in this
// request's memory and the Google Sheet. The browser keeps fields for a retry.
export async function submitDirect(db, user, input, now = new Date(), options = {}) {
  requireAction(user, "capture_card");
  requireAction(user, "submit_own_draft", { tenantId: user.tenantId, capturedBy: user.id });
  const data = input.verifiedData || {};
  const dataDigest=createHash('sha256').update(JSON.stringify(canonical(data))).digest('hex');
  if (input.status && input.status !== "submitted") throw failure("STATE_INVALID", 400, "Contacts must be submitted to Google Sheets.");
  if (!String(data.meetingContext?.metAtLocation || "").trim() ||
      (!String(data.fullName || "").trim() && !String(data.companyName || "").trim()) ||
      (!String(data.email || "").trim() && !String(data.phone || "").trim())) throw failure("CONTACT_INVALID", 400, "Enter an exhibition, a name or company, and an email or phone.");
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.email).trim())) throw failure("CONTACT_INVALID", 400, "Enter a valid email address.");
  if (!/^[a-f0-9-]{36}$/i.test(input.submissionId || "")) throw failure("SUBMISSION_ID_REQUIRED", 400, "A submission reference is required. Please retry.");
  const env = options.sheet?.env || process.env;
  const gateway = options.sheet?.gateway === undefined ? createSheetGateway(env) : options.sheet.gateway;
  if (!gateway) throw failure("SHEET_NOT_CONFIGURED", 503, "Google Sheets is not configured. Your contact has not been submitted. Please retry later.");
  const key = `submission:${user.tenantId}:${user.id}:${input.submissionId}`;
  const settings = db.collection("settings");
  let receipt = await settings.findOne({ key });
  if (!receipt) {
    const identity = await allocateRecordId(db, now, env);
    try { await settings.insertOne({ tenantId: user.tenantId, key, ...identity, createdAt: now, dataDigest }); }
    catch (error) { if (error.code !== 11000) throw error; }
    receipt = await settings.findOne({ key });
  }
  const card = {
    id: input.submissionId, recordId: receipt.recordId, tenantId: user.tenantId,
    capturedBy: user.id, capturedByName: user.name || user.email, status: "submitted",
    createdAt: receipt.createdAt.toISOString(), updatedAt: now.toISOString(), verifiedAt: now.toISOString(),
    verifiedData: data, ocrData: {}, rawOCRText: "", hasImage: false,
    source: input.source === "manual" ? "manual" : "ocr", isDemo: Boolean(input.isDemo),
  };
  if((receipt.completedAt||receipt.appendUncertain)&&receipt.dataDigest&&receipt.dataDigest!==dataDigest)throw referenceConflict(receipt.recordId);
  if (receipt.completedAt) {
    if(!receipt.dataDigest){
      if(!reviewedRowMatches(await gateway.readAll(),card))throw referenceConflict(receipt.recordId);
      await settings.updateOne({key},{$set:{dataDigest}});
    }
    return { ...card, sheetStatus: "submitted" };
  }
  const lease = new Date(Date.now() + 120000);
  const claimed = await settings.findOneAndUpdate({ key, completedAt: { $exists: false },
    $or: [{ lease: { $exists: false } }, { lease: { $lte: new Date() } }],
  }, { $set: { lease, dataDigest } }, { returnDocument: "after" });
  if (!claimed) throw Object.assign(failure('SHEET_SYNC_BUSY',409,'Submission is processing. Keep these details and check again with the same reference.'),{submissionReference:receipt.recordId,submissionStatus:'processing',retrySafe:true});
  let appendStarted = false;
  let emailLockKey;
  let priorEmailUncertain;
  let emailResolved=false;
  try {
    const email=normalizedContactEmail(data.email);
    if(email){
      const lockKey=`sheet-email-lease:${createHash('sha256').update(`${env.GOOGLE_SHEET_ID||env.GOOGLE_SHEET_TEST_ID||'configured'}:${email}`).digest('hex')}`;
      try{await settings.updateOne({key:lockKey},{$setOnInsert:{key:lockKey,tenantId:'__lead71_system'}},{upsert:true});}catch(error){if(error.code!==11000)throw error;}
      const locked=await settings.findOneAndUpdate({key:lockKey,$or:[{lease:{$exists:false}},{lease:{$lte:new Date()}}]},{$set:{lease,owner:input.submissionId}},{returnDocument:'after'});
      if(!locked)throw failure('SHEET_SYNC_BUSY',409,'A submission with this email is processing. Check again using this same reference.');
      emailLockKey=lockKey;
      priorEmailUncertain=locked.uncertainReference;
    }
    const rows = await gateway.readAll();
    const column = rows[0]?.findIndex(header => sheetField(header) === "recordId");
    if (column === undefined || column < 0) throw failure("SHEET_COLUMNS_INVALID", 502, "The Sheet is missing the Contact ID column.");
    // Recover an uncertain successful append without overwriting reviewer edits.
    if (!rows.slice(1).some(row => String(row[column] || "") === card.recordId)) {
      if (receipt.appendUncertain) throw failure('SHEET_RECONCILIATION_REQUIRED',409,'Delivery needs administrator review. Do not create another submission.');
      const duplicate=exactEmailDuplicate(rows,data.email);
      if(duplicate){emailResolved=true;return duplicate;}
      if(priorEmailUncertain)throw failure('SHEET_RECONCILIATION_REQUIRED',409,'An earlier submission for this email needs administrator review. Do not submit another copy.');
      await settings.updateOne({key},{$set:{appendUncertain:true}});
      appendStarted=true;
      await gateway.append(sheetRow(card));
    }
    emailResolved=true;
    await settings.updateOne({ key }, { $set: { completedAt: new Date() }, $unset: {appendUncertain:''} });
    return { ...card, sheetStatus: "submitted" };
  } catch (err) {
    if(err.code==='SHEET_SYNC_BUSY')throw Object.assign(err,{submissionReference:receipt.recordId,submissionStatus:'processing',retrySafe:true});
    const definitiveRejection = ['SHEET_RANGE_INVALID', 'SHEET_COLUMNS_INVALID', 'SHEET_ACCESS_DENIED', 'SHEET_AUTH_FAILED', 'SHEET_NOT_FOUND', 'SHEET_API_DISABLED'].includes(err.code);
    if (appendStarted && definitiveRejection) await settings.updateOne({key}, {$unset:{appendUncertain:''}});
    const uncertain = (appendStarted && !definitiveRejection) || receipt.appendUncertain || priorEmailUncertain || err.code === 'SHEET_RECONCILIATION_REQUIRED';
    if(uncertain&&emailLockKey){await settings.updateOne({key:emailLockKey,owner:input.submissionId},{$set:{uncertainReference:priorEmailUncertain||receipt.recordId}});}
    const code = uncertain ? 'SHEET_RECONCILIATION_REQUIRED' : (err.code || 'SHEET_SUBMISSION_FAILED');
    const reason = ['SHEET_RANGE_INVALID','SHEET_COLUMNS_INVALID'].includes(code)
      ? 'Google Sheet changes detected. Not saved; ask an administrator to check the register tab and columns.'
      : uncertain ? 'Save status needs administrator review. Do not submit another copy.'
      : 'Not saved to Google Sheets. Your details are preserved; retry with this reference after the connection is restored.';
    console.error('[submission failure]', {code, causeCode:err.code || 'UNKNOWN', reference:receipt.recordId, stage:appendStarted?'sheet_append':'sheet_read', status:uncertain?'needs_review':'not_saved'});
    throw Object.assign(failure(code, uncertain ? 409 : 502, reason), {submissionReference:receipt.recordId, submissionStatus:uncertain?'needs_review':'not_saved', retrySafe:!uncertain});
  } finally {
    if(emailLockKey){try{await settings.updateOne({key:emailLockKey,owner:input.submissionId},{$unset:{lease:'',owner:'',...(emailResolved?{uncertainReference:''}:{})}});}catch{console.error('[submission email lease release failed]',{reference:receipt.recordId});}}
    try { await settings.updateOne({ key }, { $unset: { lease: "" } }); }
    catch { console.error('[submission lease release failed]', {reference:receipt.recordId}); }
  }
}
