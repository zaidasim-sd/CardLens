import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {decryptValue,encryptValue} from '../security/encryption.js';
import {StagingRegister} from './stagingRegister.js';

export const TEST_LIST='Lead71 - Internal Integration Test - DO NOT SEND';
export const RESPONSE_TYPES=['details confirmed','details changed','no longer at the organisation','not the intended contact','contact has passed away','needs help'];
const issue=(message,status=400)=>Object.assign(new Error(message),{status});
export function writableContact(item) {
 const out={update_source:'Account'};
 for(const k of ['first_name','last_name','company_name','job_title','anniversary','birthday_month','birthday_day','list_memberships','custom_fields','phone_numbers','street_addresses'])if(item[k]!==undefined)out[k]=item[k];
 if(item.email_address)out.email_address={address:item.email_address.address,permission_to_send:item.email_address.permission_to_send};
 return out;
}
const snapshot=item=>JSON.stringify(writableContact(item));
export function assertStaging(env=process.env) {
 if(env.STAGING_INTEGRATION_ENABLED!=='true'||env.APP_ENV!=='staging'||env.APP_BASE_URL!=='https://cardsnap-vision71-staging.vercel.app'||!/staging|test/i.test(env.MONGODB_DB||'')) throw issue('This workflow is available only on the isolated staging deployment.',403);
}
export function validateStagingContact(data) {
 if(data.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) throw issue('Enter a valid email address.');
 for(const k of ['name','company','title','phone']) if(String(data[k]||'').length>100) throw issue(`${k} is too long.`);
 if(!String(data.name||data.company||'').trim()) throw issue('Contact name or company is required.');
}
export async function ccCall(db,path,method='GET',body,env=process.env) {
 assertStaging(env);
 if(!env.CC_STAGING_SUBJECT_HASH) throw issue('Verify the internal Constant Contact account first.',503);
 const s=await db.collection('settings').findOne({tenantId:'vision71-internal',key:'constant_contact'});
 if(!s?.tokens) throw issue('Connect the internal test account first.',503);
 let t=decryptValue(s.tokens);
 if(t.expires<Date.now()+60000) {
  const r=await fetch('https://authz.constantcontact.com/oauth2/default/v1/token',{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${env.CC_CLIENT_ID}:${env.CC_CLIENT_SECRET}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:t.refresh}),signal:AbortSignal.timeout(15000)});
  if(!r.ok) throw issue('Test account authorisation expired. Reconnect the test account.',503);
  const b=await r.json();t={access:b.access_token,refresh:b.refresh_token,expires:Date.now()+b.expires_in*1000};
  await db.collection('settings').updateOne({_id:s._id},{$set:{tokens:encryptValue(t)}});
 }
 const claims=JSON.parse(Buffer.from(t.access.split('.')[1],'base64url').toString());
 if(createHash('sha256').update(claims.sub||'').digest('hex')!==env.CC_STAGING_SUBJECT_HASH) throw issue('Constant Contact account does not match the verified internal account.',403);
 const response=await fetch(`https://api.cc.email/v3${path}`,{method,headers:{Authorization:`Bearer ${t.access}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
 const b=await response.json().catch(()=>({}));
 if(!response.ok) throw issue(`Constant Contact request failed (${response.status}).`,502);
 return b;
}

// One short server lease serialises register writes and refresh-token rotation.
export async function withStagingLock(db,task) {
 const key='staging_workflow_lock',owner=randomUUID();
 try {await db.collection('settings').insertOne({tenantId:'vision71-internal',key,until:new Date(0)});}catch(e){if(e.code!==11000)throw e;}
 const locked=await db.collection('settings').findOneAndUpdate({tenantId:'vision71-internal',key,until:{$lt:new Date()}},{$set:{until:new Date(Date.now()+240000),owner}},{returnDocument:'after'});
 if(!locked) throw issue('Another staging operation is running. Retry shortly.',409);
 try{return await task();}finally{await db.collection('settings').updateOne({key,owner},{$set:{until:new Date(0)},$unset:{owner:''}});}
}

export async function stagingAction(db,user,action,input={},deps={}) {
 const env=deps.env||process.env; assertStaging(env);
 if(user.tenantId!=='vision71-internal') throw issue('Internal staging tenant required.',403);
 const reg=deps.register||new StagingRegister(env);
 const cc=deps.cc||((path,method,body)=>ccCall(db,path,method,body,env));
 const now=()=>new Date().toISOString();
 const log=async(contactId,verb,status,detail='')=>reg.append('Sync_Log',{id:randomUUID(),contactId,action:verb,status,attempt:(await reg.rows('Sync_Log')).filter(r=>r.contactId===contactId&&r.action===verb).length+1,time:now(),detail});
 if(action==='status') {
  const [contacts,exhibitions,sessions,encounters,responses,changes,logs,campaigns]=await Promise.all(['Contacts','Exhibitions','Sessions','Contact_Exhibition_Links','Review_Responses','Change_Requests','Sync_Log','Campaign_Register'].map(t=>reg.rows(t)));
  return {contacts,exhibitions,sessions,encounters,responses,changes,logs,campaigns,listName:TEST_LIST,registerUrl:`https://docs.google.com/spreadsheets/d/${env.CC_STAGING_REGISTER_ID}/edit`,productionDisabled:true};
 }
 if(action==='context') {
  const [exhibitions,sessions]=await Promise.all([reg.rows('Exhibitions'),reg.rows('Sessions')]);
  return {exhibitions:exhibitions.filter(e=>['approved','source recorded'].includes(e.status)),sessions:sessions.filter(s=>s.representativeId===user.id&&s.status==='active')};
 }
 if(action==='scan_session') {
  const source=String(input.source||'').trim();if(!source||source.length>150)throw issue('Select an exhibition or source.');
  let exhibition=(await reg.rows('Exhibitions')).find(e=>e.name===source);
  if(!exhibition){exhibition={id:randomUUID(),name:source,status:'source recorded',createdBy:user.id,createdAt:now()};await reg.append('Exhibitions',exhibition);}
  const ownSessions=(await reg.rows('Sessions')).filter(s=>s.representativeId===user.id&&s.status==='active');
  const existing=ownSessions.find(s=>s.exhibitionId===exhibition.id);
  if(existing)return existing;
  for(const prior of ownSessions){prior.status='closed';prior.endedAt=now();await reg.update('Sessions',prior);}
  const row={id:randomUUID(),exhibitionId:exhibition.id,representativeId:user.id,representativeName:user.name,startedAt:now(),status:'active'};await reg.append('Sessions',row);return row;
 }
 if(action==='exhibition') {
  if(!input.name||!input.city||!input.country||!input.startDate||!input.endDate||!input.timeZone) throw issue('Enter exhibition name, city, country, dates and time zone.');
  if(input.endDate<input.startDate||!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)||!/^\d{4}-\d{2}-\d{2}$/.test(input.endDate))throw issue('Enter a valid exhibition date range.');
  try{new Intl.DateTimeFormat('en',{timeZone:input.timeZone})}catch{throw issue('Enter a valid time zone.');}
  const row={id:randomUUID(),...Object.fromEntries(['name','city','country','venue','startDate','endDate','timeZone'].map(k=>[k,String(input[k]||'').slice(0,150)])),status:'approved',createdBy:user.id,createdAt:now(),approvedBy:user.id,approvedAt:now()};
  await reg.append('Exhibitions',row);return row;
 }
 if(action==='session') {
  const exhibition=(await reg.rows('Exhibitions')).find(e=>e.id===input.exhibitionId&&['approved','source recorded'].includes(e.status));
  if(!exhibition)throw issue('Select an approved exhibition.');
  const active=(await reg.rows('Sessions')).find(s=>s.representativeId===user.id&&s.status==='active');
  if(active){if(active.exhibitionId===exhibition.id)return active;throw issue('End your current exhibition session before starting another.',409);}
  const row={id:randomUUID(),exhibitionId:exhibition.id,representativeId:user.id,representativeName:user.name,startedAt:now(),status:'active'};
  await reg.append('Sessions',row);return row;
 }
 if(action==='close_session') {
  const row=(await reg.rows('Sessions')).find(s=>s.id===input.id&&s.representativeId===user.id);
  if(!row)throw issue('Session not found.',404);row.status='closed';row.endedAt=now();await reg.update('Sessions',row);return row;
 }
 if(action==='capture') {
  validateStagingContact(input);
  if(!/^[a-f0-9-]{36}$/i.test(input.id||''))throw issue('A stable submission ID is required.');
  const session=(await reg.rows('Sessions')).find(s=>s.id===input.sessionId&&s.status==='active'&&s.representativeId===user.id);
  if(!session)throw issue('Start your exhibition session first.');
  const exhibition=(await reg.rows('Exhibitions')).find(e=>e.id===session.exhibitionId);
  const records=await reg.rows('Contacts');
  let row=records.find(c=>c.id===input.id);
  if(row&&row.email!==(input.email||'').toLowerCase())throw issue('Submission reference already belongs to another record.',409);
  if(!row) {
   row=input.email?records.find(c=>c.email===input.email.toLowerCase()):undefined;
   if(!row){row={id:input.id,lead71RecordId:input.lead71RecordId||input.id,email:(input.email||'').toLowerCase(),name:input.name||'',company:input.company||'',title:input.title||'',phone:input.phone||'',status:'pending review',sessionId:session.id,capturedBy:user.id,capturedAt:now(),syncStatus:'not synced',version:now()};await reg.append('Contacts',row);}
  }
  if(!(await reg.rows('Contact_Exhibition_Links')).some(e=>e.id===input.id))await reg.append('Contact_Exhibition_Links',{id:input.id,contactId:row.id,sessionId:session.id,capturedAt:now(),capturedBy:user.id,source:'Exhibition',exhibitionId:exhibition.id,exhibitionName:exhibition.name,city:exhibition.city,country:exhibition.country});
  return row;
 }
 const contact=(await reg.rows('Contacts')).find(c=>c.id===input.id);
 if(action==='campaign') {
  const ids=Array.isArray(input.recipientIds)?input.recipientIds:[];
  if(!ids.length||ids.length>10)throw issue('Select one to ten approved synthetic recipients.');
  const contacts=await reg.rows('Contacts');if(ids.some(id=>!contacts.some(c=>c.id===id&&c.status==='approved')))throw issue('Recipients must be approved.');
  const row={id:randomUUID(),name:String(input.name||'Contact Details Review').slice(0,100),recipientIds:JSON.stringify(ids),status:'local draft only - campaign scope unavailable',preparedBy:user.id,createdAt:now()};await reg.append('Campaign_Register',row);return row;
 }
 if(!contact)throw issue('Contact not found.',404);
 if(action==='email_required') {contact.syncStatus='email required';contact.error='Saved to Google Sheets. Add an email address before Constant Contact sync.';await reg.update('Contacts',contact);return contact;}
 if(action==='scan_review') {
  if(contact.capturedBy!==user.id)throw issue('Only the capturer can confirm this scan review.',403);
  if(!contact.approvedBy){contact.status='approved';contact.approvedBy=`scan-review:${user.id}`;await reg.update('Contacts',contact);await log(contact.id,'scan_review','confirmed on submission');}
  return contact;
 }
 if(action==='verify') {
  if(!contact.ccId)throw issue('Sync or link this test contact before verification.');
  const remote=await cc(`/contacts/${contact.ccId}?include=list_memberships`);
  const lists=await cc('/contact_lists?limit=1000&status=active');
  const list=lists.lists?.find(l=>l.name===TEST_LIST);
  return {id:contact.id,ccId:remote.contact_id,email:remote.email_address?.address,permission:remote.email_address?.permission_to_send,title:remote.job_title,listName:TEST_LIST,inTestList:Boolean(list&&remote.list_memberships?.includes(list.list_id)),checkedAt:now()};
 }
 if(action==='review_link') {
  const token=randomBytes(32).toString('base64url');const hash=createHash('sha256').update(token).digest('hex');
  await db.collection('settings').insertOne({tenantId:'vision71-internal',key:`staging_review:${hash}`,contactId:contact.id,expires:new Date(Date.now()+86400000),used:false});
  await log(contact.id,'review_link','issued');
  return {url:`${env.APP_BASE_URL}/contact-review#${token}`};
 }
 if(action==='approve') {
  if(contact.capturedBy===user.id)throw issue('A different reviewer must approve this contact.',403);
  contact.status='approved';contact.approvedBy=user.id;await reg.update('Contacts',contact);await log(contact.id,'approve','approved');return contact;
 }
 if(action==='response') {
  if(!RESPONSE_TYPES.includes(input.category))throw issue('Select a valid response.');
  const proposed=Object.fromEntries(['name','company','title','phone'].filter(k=>input.proposed?.[k]!==undefined).map(k=>[k,String(input.proposed[k]).slice(0,100)]));
  const responseId=input.responseId||randomUUID();
  const row=(await reg.rows('Review_Responses')).find(r=>r.id===responseId)||{id:responseId,contactId:contact.id,category:input.category,proposed:JSON.stringify(proposed),receivedAt:now(),status:'pending review'};
  if(!row._row)await reg.append('Review_Responses',row);
  if(input.category==='details changed'&&!(await reg.rows('Change_Requests')).some(c=>c.id===row.id)) await reg.append('Change_Requests',{id:row.id,contactId:contact.id,before:JSON.stringify(Object.fromEntries(Object.keys(proposed).map(k=>[k,contact[k]]))),after:JSON.stringify(proposed),requestedBy:user.id,status:'pending',createdAt:now()});
  return row;
 }
 if(action==='apply_change'||action==='rollback') {
  const change=(await reg.rows('Change_Requests')).find(c=>c.id===input.changeId&&c.contactId===contact.id);
  if(!change)throw issue('Change request not found.');
  if(action==='apply_change'&&change.requestedBy===user.id)throw issue('A different reviewer must approve this change.',403);
  const expected=JSON.parse(action==='rollback'?change.after:change.before),values=JSON.parse(action==='rollback'?change.before:change.after);
  if(change.status!==(action==='rollback'?'applied':'pending'))throw issue('Change is not in the expected state.',409);
  if(Object.keys(expected).some(k=>contact[k]!==expected[k]))throw issue('Contact changed since this request. Review the conflict.',409);
  Object.assign(contact,values,{version:now(),syncStatus:'pending approved update'});await reg.update('Contacts',contact);
  change.status=action==='rollback'?'rolled back':'applied';change.approvedBy=user.id;await reg.update('Change_Requests',change);await log(contact.id,action,'recorded');return contact;
 }
 if(action==='retry'||action==='sync') {
  if(contact.status!=='approved'||!contact.approvedBy)throw issue('A different reviewer must approve before sync.',403);
  validateStagingContact(contact);
  if(!contact.email)throw issue('An email address is required for Constant Contact sync.');
  try {
   const lists=await cc('/contact_lists?limit=1000&status=active');
   const list=lists.lists?.find(l=>l.name===TEST_LIST);
   if(!list)throw issue('The exact internal test list is missing. No fallback is allowed.',503);
   const matches=await cc(`/contacts?email=${encodeURIComponent(contact.email)}&status=all&include=list_memberships,custom_fields`);
   const remote=matches.contacts||[];
   if(remote.length>1)throw issue('Multiple provider matches require review.',409);
   if(remote.length){
    const item=await cc(`/contacts/${remote[0].contact_id}?include=list_memberships,custom_fields,phone_numbers,street_addresses`);
    // A saved create intent can reconcile an uncertain create by email without another POST.
    if(!contact.ccId&&!['creating','reconciliation required'].includes(contact.syncStatus)) {
     contact.syncStatus='existing contact preserved';contact.error='Existing contact requires an explicit mapping; no provider changes made.';
    } else {
     if(contact.ccId&&contact.ccId!==item.contact_id)throw issue('Provider identity conflict.',409);
     if(contact.ccId&&contact.syncedVersion!==contact.version) {
      if(!contact.providerSnapshot||snapshot(item)!==contact.providerSnapshot)throw issue('Provider record changed. Review before applying the correction.',409);
      const body=writableContact(item);const [first,...rest]=contact.name.trim().split(/\s+/);
      Object.assign(body,{first_name:first.slice(0,50),last_name:rest.join(' ').slice(0,50),company_name:contact.company.slice(0,50),job_title:contact.title.slice(0,50)});
      if(contact.phone) {
       const phones=[...(body.phone_numbers||[])];const index=phones.findIndex(p=>p.kind==='work');
       if(index>=0)phones[index]={...phones[index],phone_number:contact.phone.slice(0,25)};
       else phones.push({kind:'work',phone_number:contact.phone.slice(0,25)});
       body.phone_numbers=phones;
      }
      await cc(`/contacts/${contact.ccId}`,'PUT',body);
      const verified=await cc(`/contacts/${contact.ccId}?include=list_memberships,custom_fields,phone_numbers,street_addresses`);
      if(verified.job_title!==body.job_title||JSON.stringify(verified.list_memberships)!==JSON.stringify(item.list_memberships)||verified.email_address?.permission_to_send!==item.email_address?.permission_to_send)throw issue('Updated contact did not pass read-back verification.',502);
      contact.providerSnapshot=snapshot(verified);
     }else if(!contact.providerSnapshot)contact.providerSnapshot=snapshot(item);
     contact.ccId=item.contact_id;contact.syncStatus='synced';contact.error='';contact.syncedVersion=contact.version;
    }
   }else{
    if(contact.ccId||contact.syncStatus==='reconciliation required')throw issue('Uncertain or previously linked contact requires reconciliation.',409);
    const [first,...rest]=contact.name.trim().split(/\s+/);
    const config=await db.collection('settings').findOne({tenantId:'vision71-internal',key:'staging_integration_configuration'});
    if(!config?.fieldIds?.event||!config?.fieldIds?.capture)throw issue('Staging provenance fields must be configured explicitly.',503);
    const encounter=(await reg.rows('Contact_Exhibition_Links')).find(e=>e.contactId===contact.id&&e.sessionId===contact.sessionId);
    if(!encounter)throw issue('Capture provenance is missing.',409);
    const provenance=[{custom_field_id:config.fieldIds.event,value:`${encounter.exhibitionId}|${encounter.exhibitionName.slice(0,70)}|${encounter.city.slice(0,40)}|${encounter.country.slice(0,40)}`},{custom_field_id:config.fieldIds.capture,value:`Exhibition|${contact.lead71RecordId||contact.id}|${contact.sessionId}|${contact.capturedAt}|${contact.capturedBy.slice(0,60)}`}];
    contact.syncStatus='creating';await reg.update('Contacts',contact);
    const created=await cc('/contacts','POST',{create_source:'Account',email_address:{address:contact.email,permission_to_send:'not_set'},first_name:first.slice(0,50),last_name:rest.join(' ').slice(0,50),company_name:contact.company.slice(0,50),job_title:contact.title.slice(0,50),custom_fields:provenance,list_memberships:[list.list_id],...(contact.phone?{phone_numbers:[{phone_number:contact.phone.slice(0,25),kind:'work'}]}:{})});
    if(!created.contact_id)throw issue('Provider create result is uncertain.',502);
    contact.ccId=created.contact_id;contact.syncStatus='synced';contact.error='';contact.syncedVersion=contact.version;
    const verified=await cc(`/contacts/${contact.ccId}?include=list_memberships,custom_fields,phone_numbers,street_addresses`);
    contact.providerSnapshot=snapshot(verified);
    if(verified.email_address?.permission_to_send!=='not_set'||!verified.list_memberships?.includes(list.list_id))throw issue('Provider verification failed. Investigate the test record.',502);
   }
   await reg.update('Contacts',contact);await log(contact.id,'sync',contact.syncStatus);return contact;
  }catch(e){contact.syncStatus=contact.syncStatus==='creating'?'reconciliation required':'failed';contact.error=e.message;await reg.update('Contacts',contact);await log(contact.id,'sync','failed',e.message);throw e;}
 }
 throw issue('Unknown staging action.');
}
