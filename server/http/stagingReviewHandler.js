import {createHash} from 'node:crypto';
import {assertStaging,stagingAction,withStagingLock} from '../integrations/stagingWorkflow.js';
import {StagingRegister} from '../integrations/stagingRegister.js';
export async function stagingReviewHandler(req,res,db) {
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
 try{
  assertStaging();
  const token=String(req.body?.token||req.headers['x-review-token']||'');
  if(!/^[A-Za-z0-9_-]{43}$/.test(token))return res.status(403).json({error:'This review link is invalid or expired.'});
  const key=`staging_review:${createHash('sha256').update(token).digest('hex')}`;
  const record=await db.collection('settings').findOne({tenantId:'vision71-internal',key,expires:{$gt:new Date()},used:false});
  if(!record)return res.status(403).json({error:'This review link is invalid, expired or already submitted.'});
  if(req.method==='GET'){
   const contact=(await new StagingRegister().rows('Contacts')).find(c=>c.id===record.contactId);
   if(!contact)return res.status(404).json({error:'Test contact is unavailable.'});
   return res.json({name:contact.name,company:contact.company,title:contact.title,email:contact.email,phone:contact.phone});
  }
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});
  const result=await withStagingLock(db,async()=>{
   // Recheck under the common write lease. GET and email scanners never consume the link.
   const current=await db.collection('settings').findOne({key,used:false,expires:{$gt:new Date()}});
   if(!current)throw Object.assign(new Error('This response was already recorded.'),{status:409});
   const response=await stagingAction(db,{id:`recipient:${record._id}`,name:'Synthetic recipient',tenantId:'vision71-internal'},'response',{id:record.contactId,responseId:`review-${record._id}`,category:req.body.category,proposed:req.body.proposed});
   await db.collection('settings').updateOne({key},{$set:{used:true,usedAt:new Date()}});return response;
  });
  return res.json({recorded:true,responseId:result.id});
 }catch(e){return res.status(e.status||500).json({error:e.status?e.message:'Response could not be recorded. Please try again.'});}
}
