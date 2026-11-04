import {assertStaging,validateStagingContact,stagingAction,withStagingLock} from './stagingWorkflow.js';
import {createCard} from '../cards/service.js';

// The existing review form is the explicit staging test approval. Production rules stay unchanged.
export async function submitStagingScan(db,user,input,deps={}) {
 assertStaging();
 const v=input.verifiedData||{};validateStagingContact({email:v.email,name:v.fullName,company:v.companyName,title:v.jobTitle,phone:v.phone});
 const act=deps.action||((action,data)=>stagingAction(db,user,action,data));
 const context=await act('context');
 let session=context.sessions.find(s=>s.id===input.integrationSessionId);
 const exhibition=session?context.exhibitions.find(e=>e.id===session.exhibitionId):undefined;
 const source=exhibition?.name||String(v.meetingContext?.metAtLocation||'').trim();
 if(!source)throw Object.assign(new Error('Select an exhibition or source.'),{status:400});
 const body={...input,verifiedData:{...v,meetingContext:{...v.meetingContext,metAtLocation:source}}};
 // Always retain the original full operational Sheet delivery and stable submission receipt.
 const record=await (deps.create||createCard)(db,user,body);
 try {
  const transfer=await (deps.lock||((task)=>withStagingLock(db,task)))(async()=>{
   if(!session)session=await act('scan_session',{source});
   const captured=await act('capture',{id:input.submissionId,lead71RecordId:record.recordId,sessionId:session.id,name:v.fullName,company:v.companyName,title:v.jobTitle,email:v.email,phone:v.phone});
   // Another existing local contact is preserved rather than silently approved by this submitter.
   if(captured.capturedBy===user.id)await act('scan_review',{id:captured.id});
   if(!v.email)return act('email_required',{id:captured.id});
   return act('sync',{id:captured.id});
  });
  return {...record,constantContactIntegration:true,transferStatus:transfer.syncStatus==='synced'?'transferred':transfer.syncStatus==='existing contact preserved'?'existing_contact':transfer.syncStatus==='email required'?'not_started':'failed',transferError:transfer.error||'',ccContactId:transfer.ccId,integrationSessionId:session?.id};
 }catch(e){return {...record,constantContactIntegration:true,transferStatus:'failed',transferError:e.status?e.message:'Constant Contact delivery is not confirmed. Retry with this same submission reference.',integrationSessionId:session?.id};}
}
