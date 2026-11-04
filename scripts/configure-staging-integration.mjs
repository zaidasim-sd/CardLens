import 'dotenv/config';
import {appendFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {getDb} from '../server/db.js';
import {decryptValue} from '../server/security/encryption.js';
import {StagingRegister} from '../server/integrations/stagingRegister.js';
import {ccCall,TEST_LIST,assertStaging} from '../server/integrations/stagingWorkflow.js';
process.env.STAGING_INTEGRATION_ENABLED='true';assertStaging();
const db=await getDb();
const s=await db.collection('settings').findOne({tenantId:'vision71-internal',key:'constant_contact'});
if(!s?.tokens)throw new Error('Existing internal test OAuth connection required.');
const claims=JSON.parse(Buffer.from(decryptValue(s.tokens).access.split('.')[1],'base64url').toString());
// Operator has confirmed this existing connection belongs to the internal test account.
process.env.CC_STAGING_SUBJECT_HASH=createHash('sha256').update(claims.sub).digest('hex');
process.env.CC_STAGING_REGISTER_ID=process.env.GOOGLE_SHEET_ID;
const registerApi=new StagingRegister();
const register=await registerApi.configure();
if(register.title!=='Aventure_Master_V71 - Vision71 Staging - Dummy Data Only') {
 await registerApi.call(':batchUpdate','POST',{requests:[{updateSpreadsheetProperties:{properties:{title:'Aventure_Master_V71 - Vision71 Staging - Dummy Data Only'},fields:'title'}}]});
 register.title='Aventure_Master_V71 - Vision71 Staging - Dummy Data Only';
}
const lists=await ccCall(db,'/contact_lists?limit=1000&status=active');
let list=lists.lists?.find(l=>l.name===TEST_LIST);
if(!list)list=await ccCall(db,'/contact_lists','POST',{name:TEST_LIST,description:'Internal synthetic integration fixtures only. DO NOT SEND.'});
const fields=await ccCall(db,'/contact_custom_fields');const fieldIds={};
for(const [key,label] of Object.entries({event:'Lead71 Staging Event',capture:'Lead71 Staging Capture'})){
 let field=fields.custom_fields?.find(f=>f.label===label);if(field&&field.type!=='string')throw new Error('Existing staging provenance field must be text.');
 if(!field)field=await ccCall(db,'/contact_custom_fields','POST',{label,type:'string'});fieldIds[key]=field.custom_field_id;
}
await db.collection('settings').updateOne({tenantId:'vision71-internal',key:'staging_integration_configuration'},{$set:{listId:list.list_id,fieldIds,verifiedAt:new Date(),subjectHash:process.env.CC_STAGING_SUBJECT_HASH}},{upsert:true});
appendFileSync('.env',`\n# Isolated integration workbench\nSTAGING_INTEGRATION_ENABLED=true\nCC_STAGING_SUBJECT_HASH=${process.env.CC_STAGING_SUBJECT_HASH}\nCC_STAGING_REGISTER_ID=${process.env.CC_STAGING_REGISTER_ID}\n`);
console.log(JSON.stringify({register,list:{id:list.list_id,name:TEST_LIST},configured:true},null,2));
process.exit();
