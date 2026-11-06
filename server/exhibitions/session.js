import { randomUUID } from 'node:crypto';
import { requireAction } from '../auth/permissions.js';

const KEY = 'shared_exhibition_session';
const conflict = () => Object.assign(new Error('Another administrator changed the session. Refresh and review the current default before saving.'), {code:'EXHIBITION_SESSION_CONFLICT',status:409});
function view(row) {
  return row ? {id:row.sessionId,exhibition:row.exhibition,active:row.active,version:row.version,updatedAt:row.updatedAt,updatedByName:row.updatedByName} : null;
}
export async function readExhibitionSession(db, user) {
  requireAction(user,'capture_card');
  return view(await db.collection('settings').findOne({tenantId:user.tenantId,key:KEY}));
}
export async function changeExhibitionSession(db, user, input, now = new Date()) {
  requireAction(user,'manage_users');
  const operation = input.operation;
  if (!['set','end'].includes(operation)) throw Object.assign(new Error('Select whether to set or end the session.'),{code:'EXHIBITION_SESSION_INVALID',status:400});
  const exhibition = String(input.exhibition || '').trim();
  if (operation==='set' && (!exhibition || exhibition.length>150 || ['Other / Source','Select exhibition'].includes(exhibition))) throw Object.assign(new Error('Choose an exhibition or enter a specific source.'),{code:'EXHIBITION_SESSION_INVALID',status:400});
  const settings=db.collection('settings'), query={tenantId:user.tenantId,key:KEY};
  const current=await settings.findOne(query);
  if ((current?.version || null)!==(input.expectedVersion ?? null)) throw conflict();
  const row={...query,sessionId:current?.active?current.sessionId:randomUUID(),exhibition:operation==='set'?exhibition:current?.exhibition || '',active:operation==='set',version:randomUUID(),updatedAt:now.toISOString(),updatedById:user.id,updatedByName:user.name || 'Administrator'};
  if (!current) {
    if(operation==='end') throw conflict();
    try {await settings.insertOne(row);}catch(error){if(error.code===11000)throw conflict();throw error;}
    return view(row);
  }
  const changed=await settings.findOneAndUpdate({...query,version:current.version},{$set:row},{returnDocument:'after'});
  if(!changed)throw conflict();
  return view(changed);
}
