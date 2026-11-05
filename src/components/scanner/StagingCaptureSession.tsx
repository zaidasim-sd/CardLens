import {useEffect,useState} from 'react';
import {apiFetch} from '@/lib/api';
type Row=Record<string,string>;
export default function StagingCaptureSession(){
 const [events,setEvents]=useState<Row[]>([]),[active,setActive]=useState<Row>(),[selected,setSelected]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const remember=(session:Row|undefined,exhibitions:Row[])=>{
  const previous=sessionStorage.getItem('l71_staging_session');
  setActive(session);
  if(session){sessionStorage.setItem('l71_staging_session',session.id);sessionStorage.setItem('l71_staging_exhibition_name',exhibitions.find(e=>e.id===session.exhibitionId)?.name||'');}
  else {sessionStorage.removeItem('l71_staging_session');sessionStorage.removeItem('l71_staging_exhibition_name');}
  if(previous!==(session?.id||null))window.dispatchEvent(new Event('lead71-shared-session-changed'));
 };
 useEffect(()=>{let disposed=false,running=false;
 const load=async()=>{if(running)return;running=true;try{const b=await apiFetch<{exhibitions:Row[];sessions:Row[]}>('/api/constant-contact?action=staging_context');if(!disposed){setEvents(b.exhibitions);remember(b.sessions.at(-1),b.exhibitions);}}catch(e){if(!disposed)setMessage(e instanceof Error?e.message:'Session could not be loaded.');}finally{running=false;}};
 void load();const timer=window.setInterval(()=>void load(),5000);const refresh=()=>void load();window.addEventListener('focus',refresh);window.addEventListener('lead71-staging-session',refresh);return()=>{disposed=true;clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('lead71-staging-session',refresh);};},[]);
 async function act(close=false){setBusy(true);setMessage('');try{const s=await apiFetch<Row>(`/api/constant-contact?action=staging_${close?'close_session':'session'}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(close?{id:active?.id}:{exhibitionId:selected})});remember(close?undefined:s,events);}catch(e){setMessage(e instanceof Error?e.message:'Session could not be saved.');}finally{setBusy(false);}}
 return <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-2 text-slate-900" aria-label="Exhibition session"><h2 className="font-semibold">Shared exhibition session</h2>{active?<><p>{events.find(e=>e.id===active.exhibitionId)?.name} · Set by {active.representativeName}</p><p className="text-xs">This session applies to everyone until an administrator changes or ends it. Each card records the actual person scanning.</p><button className="text-sm underline disabled:opacity-40" disabled={busy} onClick={()=>void act(true)}>End session for everyone</button></>:<p className="text-sm">Select an exhibition for everyone, or choose the source in the review form to start the shared session.</p>}<div className="flex flex-wrap gap-2"><select aria-label="Exhibition for this session" className="rounded-lg border bg-white p-2" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Select exhibition</option>{events.map(e=><option key={e.id} value={e.id}>{e.name} · {e.city}</option>)}</select><button className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-40" disabled={busy||!selected} onClick={()=>void act()}>{active?'Change session for everyone':'Start shared session'}</button></div>{message&&<p role="status" className="text-sm text-red-700">{message}</p>}</section>;
}
