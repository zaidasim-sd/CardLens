import {useState} from 'react';
import {useExhibitionSession} from '@/hooks/useExhibitionSession';
import {changeSharedExhibitionSession,getExhibitionOptions} from '@/lib/api/exhibitions';
import ExhibitionSelector from '@/components/scanner/ExhibitionSelector';
import {Button} from '@/components/ui/button';

export function SharedExhibitionSessionSettings() {
 const {config,error,refresh}=useExhibitionSession();
 const [selection,setSelection]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function save(operation:'set'|'end') {
  if(!config||busy)return;setBusy(true);setMessage('');
  try{
   await changeSharedExhibitionSession({operation,exhibition:selection,expectedVersion:config.session?.version||null});
   await refresh();setSelection('');setMessage(operation==='end'?'Shared session ended.':'Shared default updated for everyone.');
   window.dispatchEvent(new Event('lead71-exhibition-session-updated'));
  }catch(e){setMessage(e instanceof Error?e.message:'The session could not be updated.');await refresh();}
  finally{setBusy(false);}
 }
 const active=config?.session?.active;
 return <section aria-label="Shared exhibition session" className="space-y-3 rounded-3xl border bg-white p-4 sm:p-6 dark:bg-slate-900">
  <h2 className="font-bold">Shared exhibition default</h2>
  <p className="text-sm">{active?`Current default: ${config.session!.exhibition}`:'No shared session is active.'}</p>
  {active&&<p className="text-xs text-slate-500">Set by {config.session!.updatedByName}</p>}
  <p className="text-sm text-slate-600 dark:text-slate-300">New contacts use this default. Scanners can choose a different exhibition for an individual contact.</p>
  <ExhibitionSelector id="sharedExhibition" label="Exhibition for everyone" value={selection} onChange={setSelection} options={config?.exhibitions||getExhibitionOptions()} disabled={busy||!config} />
  <div className="flex flex-wrap gap-2">
   <Button disabled={busy||!config||!selection||selection==='Other / Source'} onClick={()=>void save('set')}>{busy?'Saving…':active?'Change shared default':'Start shared session'}</Button>
   {active&&<Button variant="outline" disabled={busy} onClick={()=>void save('end')}>End shared session</Button>}
  </div>
  {(error||message)&&<p role="status" className="text-sm">{error||message}</p>}
 </section>;
}
