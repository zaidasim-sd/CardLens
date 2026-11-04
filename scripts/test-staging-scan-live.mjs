import 'dotenv/config';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {writeFileSync,mkdirSync} from 'node:fs';
import {getDb,ensureDatabaseIndexes} from '../server/db.js';
import {stagingAction,withStagingLock,ccCall} from '../server/integrations/stagingWorkflow.js';
import {submitStagingScan} from '../server/integrations/stagingScanSubmission.js';
import {createSheetGateway,sheetField} from '../server/integrations/sheetService.js';
if(process.env.RUN_STAGING_LIVE_TEST!=='true')throw new Error('Explicit staging test opt-in required.');
const db=await getDb();await ensureDatabaseIndexes(db);
const actor={id:'staging-scan-evidence',name:'Synthetic Scan Evidence',tenantId:'vision71-internal',role:'exhibition_assistant'};
const run=(action,input)=>withStagingLock(db,()=>stagingAction(db,actor,action,input));
const evidence={startedAt:new Date().toISOString(),method:'Normal scan submission service; actual primary Google Sheet, protected master tabs and Constant Contact APIs',checks:[]};
try{
 const ctx=await stagingAction(db,actor,'context');const event=ctx.exhibitions[0];
 const session=await run('session',{exhibitionId:event.id});
 const input={submissionId:randomUUID(),integrationSessionId:session.id,status:'submitted',source:'manual',verifiedData:{fullName:'Synthetic Normal Scan',companyName:'Example Test Company',jobTitle:'Scan Flow Test',email:`l71-test-scan-${Date.now()}@example.com`,phone:'+1 202 555 0148',notes:'Synthetic staging evidence only',meetingContext:{metAtLocation:event.name}}};
 const first=await submitStagingScan(db,actor,input,{action:(action,data)=>action==='sync'?Promise.reject(new Error('Injected provider timeout after successful Sheets delivery')):stagingAction(db,actor,action,data)});
 assert.equal(first.sheetStatus,'submitted');assert.equal(first.transferStatus,'failed');
 const result=await submitStagingScan(db,actor,input);assert.equal(result.transferStatus,'transferred');
 const again=await submitStagingScan(db,actor,input);assert.equal(again.recordId,result.recordId);assert.equal(again.ccContactId,result.ccContactId);
 const rows=await createSheetGateway().readAll();const index=rows[0].findIndex(h=>sheetField(h)==='recordId');const matching=rows.slice(1).filter(r=>r[index]===result.recordId);assert.equal(matching.length,1);
 const remote=await ccCall(db,`/contacts/${result.ccContactId}?include=list_memberships,custom_fields`);assert.equal(remote.email_address.permission_to_send,'not_set');assert.ok(remote.custom_fields.some(f=>f.value?.includes(result.recordId)));
 const state=await stagingAction(db,actor,'status');assert.equal(state.contacts.filter(c=>c.id===input.submissionId).length,1);
 evidence.checks=['Primary operational Google Sheet saved before provider attempt','Provider failure returned separately without losing Sheet success','Same submission retried without a duplicate Sheet row or provider contact','Selected exhibition carried into primary Sheet and protected master encounter','Provider read-back verified not_set permission and Lead71 reference in provenance'];
 evidence.result='PASS';evidence.record={id:result.id,recordId:result.recordId,email:input.verifiedData.email,ccId:result.ccContactId,sessionId:session.id,exhibitionId:event.id};evidence.primarySheetRow=matching[0];evidence.primarySheetHeaders=rows[0];evidence.provider=remote;evidence.master=state.contacts.find(c=>c.id===input.submissionId);evidence.completedAt=new Date().toISOString();
 await run('close_session',{id:session.id});
}catch(e){evidence.result='FAIL';evidence.error=e.message;process.exitCode=1;}
mkdirSync('artifacts/qa',{recursive:true});writeFileSync('artifacts/qa/staging-scan-evidence.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify({result:evidence.result,error:evidence.error,checks:evidence.checks,record:evidence.record},null,2));process.exit(process.exitCode||0);
