import { getExhibitionOptions, getDefaultExhibition, ALL_EXHIBITION_NAMES } from '../../shared/exhibitions.mjs';
import { getDb, ensureDatabaseIndexes } from '../db.js';
import { authenticate, verifyCsrf } from '../auth/service.js';
import { parseCookies, SESSION_COOKIE } from '../auth/cookies.js';
import { readExhibitionSession, changeExhibitionSession } from '../exhibitions/session.js';
import { exhibitionOptionsWithDefault } from '../../shared/exhibitionSession.mjs';

export function createExhibitionConfigHandler(deps={}) {
 return async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if(req.method==='GET' && req.query?.action!=='session')return res.status(200).json({exhibitions:getExhibitionOptions(),allExhibitions:ALL_EXHIBITION_NAMES,defaultExhibition:getDefaultExhibition()});
  if(req.query?.action!=='session'||!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed.'});
  try {
   const db=await (deps.getDb||getDb)();await (deps.ensureIndexes||ensureDatabaseIndexes)(db);
   const cookies=parseCookies(req.headers.cookie||'');
   const auth=await (deps.authenticate||authenticate)(db,cookies[SESSION_COOKIE]);
   let session;
   if(req.method==='POST') {
    verifyCsrf(auth.session,req.headers['x-csrf-token']);
    session=await changeExhibitionSession(db,auth.user,req.body||{});
   } else session=await readExhibitionSession(db,auth.user);
   const defaultExhibition=session?.active?session.exhibition:getDefaultExhibition();
   return res.status(200).json({session,defaultExhibition,exhibitions:exhibitionOptionsWithDefault(getExhibitionOptions(),defaultExhibition)});
  }catch(error){return res.status(error.status||503).json({code:error.code||'EXHIBITION_SESSION_UNAVAILABLE',error:error.status?error.message:'The shared exhibition default could not be loaded. Please retry.'});}
 };
}
export default createExhibitionConfigHandler();
