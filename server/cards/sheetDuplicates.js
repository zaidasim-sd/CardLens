import {submissionSheetField,sheetRow} from '../integrations/sheetService.js';
import mapping from '../../config/sheetMapping.json' with {type:'json'};
const text=value=>String(value??'').replace(/^'/,'');
export const normalizedContactEmail=value=>text(value).trim().toLowerCase();

export function exactEmailDuplicate(rows,email) {
  const normalized=normalizedContactEmail(email);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))return null;
  const fields=(rows[0]||[]).map(submissionSheetField),emailColumn=fields.indexOf('email'),idColumn=fields.indexOf('recordId');
  if(emailColumn<0||idColumn<0)return null;
  const row=rows.slice(1).findLast(values=>text(values[idColumn])&&normalizedContactEmail(values[emailColumn])===normalized);
  if(!row)return null;
  const get=field=>text(row[fields.indexOf(field)]);
  const data={fullName:get('fullName'),companyName:get('companyName'),jobTitle:get('jobTitle'),email:get('email'),phone:get('phone'),notes:get('notes'),meetingContext:{metAtLocation:get('event'),notes:get('notes')}};
  return {id:get('recordId'),recordId:get('recordId'),originalFileName:'',createdAt:get('capturedAt'),rawOCRText:'',ocrData:data,verifiedData:data,status:'submitted',sheetStatus:'submitted',alreadySubmitted:true,capturedByName:get('capturedByName'),matchReason:'This exact email is already recorded in the operational register.'};
}

export function reviewedRowMatches(rows,card) {
  const fields=(rows[0]||[]).map(submissionSheetField),idColumn=fields.indexOf('recordId');
  if(idColumn<0)return false;
  const matches=rows.slice(1).filter(row=>text(row[idColumn])===card.recordId);
  if(matches.length!==1)return false;
  const expected=sheetRow(card);
  return ['event','fullName','companyName','jobTitle','email','phone','notes'].every(field=>{
    const index=fields.indexOf(field),canonical=mapping.columns.findIndex(c=>c.field===field);
    return index>=0&&text(matches[0][index])===text(expected[canonical]);
  });
}
