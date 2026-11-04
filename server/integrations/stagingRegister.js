import { GoogleAuth } from 'google-auth-library';
import { normalizeGooglePrivateKey, safeSheetValue } from './sheetService.js';

export const tables = {
 Contacts: ['id','email','name','company','title','phone','status','ccId','sessionId','capturedBy','capturedAt','approvedBy','syncStatus','error','version','syncedVersion','providerSnapshot','lead71RecordId'],
 Exhibitions: ['id','name','city','country','venue','startDate','endDate','timeZone','status','createdBy','createdAt','approvedBy','approvedAt'],
 Sessions: ['id','exhibitionId','representativeId','representativeName','startedAt','endedAt','status'],
 Contact_Exhibition_Links: ['id','contactId','sessionId','capturedAt','capturedBy','source','exhibitionId','exhibitionName','city','country'],
 Review_Responses: ['id','contactId','category','proposed','receivedAt','status'],
 Change_Requests: ['id','contactId','before','after','requestedBy','approvedBy','status','createdAt'],
 Sync_Log: ['id','contactId','action','status','attempt','time','detail'],
 Campaign_Register: ['id','name','recipientIds','status','preparedBy','createdAt','ccCampaignId'],
};

export class StagingRegister {
 constructor(env=process.env) {this.env=env;this.id=env.CC_STAGING_REGISTER_ID;}
 async call(path,method='GET',body) {
  if(!this.id) throw Object.assign(new Error('Staging master register is not configured.'),{status:503});
  const auth=new GoogleAuth({credentials:{client_email:this.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,private_key:normalizeGooglePrivateKey(this.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)},scopes:['https://www.googleapis.com/auth/spreadsheets']});
  const r=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.id)}${path}`,{method,headers:{Authorization:`Bearer ${await auth.getAccessToken()}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
  if(!r.ok) throw Object.assign(new Error(`Staging register request failed (${r.status}).`),{status:502});
  return r.json();
 }
 async rows(tab) {
  if(!tables[tab]) throw new Error('Invalid register table.');
  const b=await this.call(`/values/${encodeURIComponent(`'${tab}'!A:AZ`)}`);
  const [head,...rows]=b.values||[];
  if(!head || tables[tab].some((v,i)=>v!==head[i])) throw Object.assign(new Error(`Register columns need configuration: ${tab}`),{status:503});
  return rows.map((row,i)=>Object.assign(Object.fromEntries(head.map((k,j)=>[k,row[j]||''])),{_row:i+2}));
 }
 async append(tab,data) {return this.call(`/values/${encodeURIComponent(`'${tab}'!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,'POST',{values:[tables[tab].map(k=>safeSheetValue(String(data[k]??'')))]});}
 async update(tab,data) {return this.call(`/values/${encodeURIComponent(`'${tab}'!A${data._row}`)}?valueInputOption=RAW`,'PUT',{values:[tables[tab].map(k=>safeSheetValue(String(data[k]??'')))]});}
 async configure() {
  const meta=await this.call('?fields=properties(title),sheets(properties)');
  if(!/staging|dummy|test/i.test(meta.properties?.title||'')) throw new Error('Register must be a staging/test spreadsheet.');
  const names=new Set(meta.sheets.map(s=>s.properties.title));
  const requests=Object.keys(tables).filter(n=>!names.has(n)).map(title=>({addSheet:{properties:{title,gridProperties:{frozenRowCount:1}}}}));
  if(requests.length) await this.call(':batchUpdate','POST',{requests});
  for(const [name,head] of Object.entries(tables)) {
   const existing=await this.call(`/values/${encodeURIComponent(`'${name}'!A1:AZ1`)}`);
   if(existing.values?.length && existing.values[0].some((v,i)=>head[i]!==v)) throw new Error(`Existing incompatible tab: ${name}`);
   if(!existing.values?.length||existing.values[0].length<head.length) await this.call(`/values/${encodeURIComponent(`'${name}'!A1`)}?valueInputOption=RAW`,'PUT',{values:[head]});
  }
  const latest=await this.call('?fields=sheets(properties,protectedRanges)');
  const protections=latest.sheets.filter(s=>tables[s.properties.title]&&!s.protectedRanges?.some(p=>p.description==='Vision71 staging controlled register')).map(s=>({addProtectedRange:{protectedRange:{description:'Vision71 staging controlled register',range:{sheetId:s.properties.sheetId},warningOnly:false,editors:{users:[this.env.GOOGLE_SERVICE_ACCOUNT_EMAIL]}}}}));
  if(protections.length) await this.call(':batchUpdate','POST',{requests:protections});
  return {title:meta.properties.title,url:`https://docs.google.com/spreadsheets/d/${this.id}/edit`,tabs:Object.keys(tables)};
 }
}
