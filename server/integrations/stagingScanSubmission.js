import {assertStaging,validateSynthetic,stagingAction,withStagingLock} from './stagingWorkflow.js';
import {createCard} from '../cards/service.js';

// The existing review form is the explicit staging test approval. Production rules stay unchanged.
export async function submitStagingScan(db,user,input,deps={}) {
 assertStaging();
 const v=input.verifiedData||{};validateSynthetic({email:v.email,name:v.fullName,company:v.companyName,title:v.jobTitle,phone:v.phone});
 const act=deps.action||((action,data)=>stagingAction(db,user,action,data));
 const context=await act('context');
 const session=context.sessions.find(s=>s.id===input.integrationSessionId);
 if(!session)throw Object.assign(new Error('Select your exhibition session before reviewing and submitting the card.'),{status:400,code:'EXHIBITION_SESSION_REQUIRED'});
 const exhibition=context.exhibitions.find(e=>e.id===session.exhibitionId);
 if(!exhibition)throw Object.assign(new Error('This exhibition is no longer approved.'),{status:409});
 const body={...input,verifiedData:{...v,meetingContext:{...v.meetingContext,metAtLocation:exhibition.name}}};
 // Always retain the original full operational Sheet delivery and stable submission receipt.
 const record=await (deps.create||createCard)(db,user,body);
 try {
  const transfer=await (deps.lock||((task)=>withStagingLock(db,task)))(async()=>{
   const captured=await act('capture',{id:input.submissionId,lead71RecordId:record.recordId,sessionId:session.id,name:v.fullName,company:v.companyName,title:v.jobTitle,email:v.email,phone:v.phone});
   // Another existing local contact is preserved rather than silently approved by this submitter.
   if(captured.capturedBy===user.id)await act('scan_review',{id:captured.id});
   return act('sync',{id:captured.id});
  });
  return {...record,transferStatus:transfer.syncStatus==='synced'?'transferred':transfer.syncStatus==='existing contact preserved'?'existing_contact':'failed',transferError:transfer.error||'',ccContactId:transfer.ccId,integrationSessionId:session.id};
 }catch(e){return {...record,transferStatus:'failed',transferError:e.status?e.message:'Constant Contact delivery is not confirmed. Retry with this same submission reference.',integrationSessionId:session.id};}
}
